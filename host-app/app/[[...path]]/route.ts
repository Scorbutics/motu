// THE FALL-THROUGH, AND THE GATE.
//
// Phase 0 made this file the place where everything the app does not own is handed to the node host.
// Phase 2 makes it the place where the app decides who may read a RECORD — the one route
// docs/plan-lagoon-host.md calls the entire security surface of the host.
//
//   resolve(repo, ref, slug) -> authorize(viewer, project) -> store.read(...) -> stream
//
// Only the record route. The index, the group pages, `/shot/<hash>` and the API keep falling through
// untouched, still gated by the host's own `access.mjs` — which is where their gating already lives
// and is tested. Two gates on one URL would be two answers to one question.
//
// THE BYTES STILL COME FROM store.mjs, and that is deliberate rather than incidental. Its retention
// rule — never evict what an alias or a composed manifest points at, order eviction by LAST ACCESS —
// is bookkeeping that must have exactly one owner. A second process reading the store directly would
// be a second writer of that bookkeeping, which is how the invariant the plan says not to rewrite
// gets broken by something that never meant to touch it.
import { parseRecordPath } from '@/src/host/records';
import { authorize, refusalMessage, refusalStatus } from '@/src/auth/authorize';
import { postgresProjectStore, postgresMembershipStore } from '@/src/auth/stores';
import { postgresAccessStore } from '@/src/auth/access-store';
import { createClient } from '@/src/supabase/server';
import { proxyToHost } from '@/src/upstream';

// Nothing here may be prerendered or cached. The record route answers differently per viewer, and a
// static answer served to a second viewer is the exact failure `authorize` exists to prevent.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// The proxy streams request and response bodies, which only the node runtime can do.
export const runtime = 'nodejs';

/**
 * A refusal, and it is a 404 — RENDERED BY THE HOST'S OWN PAGE.
 *
 * A 403 confirms that a private lagoon exists at that address, which is a fact the asker has not
 * earned. The status code alone does not achieve that, and the first version of this function proved
 * it: it answered 326 bytes of `text/plain` where a genuine miss answers 24,946 bytes of HTML, so
 * anyone could tell a refusal from an absence by looking at the content type. That is a 403 wearing a
 * 404's status code, and it leaks exactly what it was written to withhold.
 *
 * So the page comes from `views.mjs` — the same function the host calls, imported rather than copied.
 * A second implementation would be identical on the day it was written and is the kind of thing that
 * drifts by one word a year later, which is enough. `motuPage` embeds no per-request state beyond the
 * message, so this is byte-identical to what the host would have said had the record simply not
 * existed.
 */
// `@motu/host` is plain ESM node; tsc reads it through allowJs, so no directive is needed here.
import { errorPage } from '@motu/host/src/views.mjs';

function notFound(record: { repo: string; ref: string; slug: string }) {
  return new Response(errorPage(404, refusalMessage(record)), {
    status: refusalStatus(),
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/** Whoever is asking, or null. Never throws: an unreadable session is nobody, not an error. */
async function viewerOf() {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    return data.user ? { userId: data.user.id } : null;
  } catch {
    return null;
  }
}

/**
 * The credential the app presents once it has decided yes.
 *
 * Absent means the host was started without a read secret, which is the ordinary case for a host that
 * has no private repos at all — and then a private read cannot be authorized by this app anyway,
 * because there is nothing private for it to unlock.
 */
function hostCredential(): Record<string, string> {
  const secret = process.env.MOTU_HOST_READ_SECRET;
  return secret ? { authorization: `Bearer ${secret}` } : {};
}

const handler = async (request: Request) => {
  const { pathname } = new URL(request.url);
  const record = parseRecordPath(pathname);

  // NOT A RECORD: the app has no opinion. Unchanged from phase 0.
  if (!record) return proxyToHost(request);

  let decision;
  try {
    decision = await authorize(await viewerOf(), record.repo, {
      projects: postgresProjectStore(),
      memberships: postgresMembershipStore(),
      access: postgresAccessStore(),
    });
  } catch (err) {
    // THE DATABASE IS DOWN, AND THAT IS NOT A VERDICT. Failing closed here would 404 every public
    // lagoon on the host over an outage in a component none of them need; failing open would be the
    // app overriding a gate it could not consult. So it does neither and abstains — the host answers
    // from access.json exactly as it did before phase 2, which is the behaviour this whole migration
    // is built to preserve. Private repos stay refused, by the host, on its own authority.
    console.error(`[authorize] could not decide for ${record.repo}:`, (err as Error)?.message ?? err);
    decision = { outcome: 'abstain' as const, because: 'unknown-project' as const };
  }

  if (decision.outcome === 'deny') return notFound(record);

  // ABSTAIN: no `projects` row, so the host decides as it always has. No credential is added, which
  // is what makes this genuinely "step aside" rather than "allow" — a private repo the app has never
  // heard of is still refused by the host.
  if (decision.outcome === 'abstain') return proxyToHost(request);

  // ALLOWED. `public` needs no credential — the host will serve it to anyone, and adding a bearer
  // there would mean the host's gate was never exercised on the path where it agrees with us.
  const response = await proxyToHost(request, {
    setHeaders: decision.because === 'public' ? {} : hostCredential(),
  });

  // NEVER BEHIND A SHARED CACHE. This response was computed for one viewer; `private, no-store` is
  // what stops a proxy between here and them handing it to the next person. Set for the allowed path
  // only — a public lagoon keeps whatever caching the host chose for it.
  if (decision.because !== 'public') {
    const headers = new Headers(response.headers);
    headers.set('cache-control', 'private, no-store');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
  return response;
};

// Named exports, one per method, because that is the only way the App Router accepts a handler.
// The host itself only answers GET, HEAD and POST — everything else it 405s (server.mjs) — and the
// rest are listed here anyway ON PURPOSE: a method missing from this list is answered 405 by NEXT,
// from a different code path, before the host is ever asked. Forwarding them keeps the host the
// only thing deciding what it serves, so the day a route grows a DELETE nothing in front of it has
// to be remembered.
export {
  handler as GET,
  handler as HEAD,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
  handler as OPTIONS,
};
