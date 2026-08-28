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
import { authorize, refusalMessage, refusalStatus, type Asker, type AuthorizeDeps } from '@/src/auth/authorize';
import { postgresProjectStore, postgresMembershipStore } from '@/src/auth/stores';
import { postgresAccessStore } from '@/src/auth/access-store';
import { postgresShareLinkStore } from '@/src/auth/share-link-store';
import { cookieMaxAgeSeconds, grants, tokenHash } from '@/src/auth/share-links';
import { createClient } from '@/src/supabase/server';
import { proxyToHost } from '@/src/upstream';
import { store, access, normalizeRepo } from '@/src/host/store';
// @motu/host is plain ESM node; tsc reads it through allowJs.
import { rootIndexPage } from '@motu/host/src/views.mjs';
import { canRead } from '@motu/host/src/access.mjs';

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

/**
 * The cookie a share link becomes.
 *
 * PATH-SCOPED TO THE PROJECT, which is what "scoped to that project" means in the only vocabulary a
 * browser has. It is also what lets somebody hold several links at once: two cookies of the same name
 * under different paths are two cookies, so a link to `acme/web` does not evict a link to `acme/api`.
 *
 * Cookie path matching is by whole segments, so `/acme/secret` covers `/acme/secret/latest/all` and
 * does NOT leak to `/acme/secretive`.
 */
const SHARE_COOKIE = 'motu_share';

/**
 * A Cookie header with one named cookie removed, everything else preserved byte-for-byte.
 *
 * Used only on the branch where this app attaches its OWN credential to the host — see the comment
 * where it is called for why a stale `motu_read` cannot be allowed to ride along on that request.
 */
function withoutCookie(header: string | null, name: string): string {
  return (header ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => {
      const eq = part.indexOf('=');
      return eq < 0 || part.slice(0, eq).trim() !== name;
    })
    .join('; ');
}

/** One cookie out of a Cookie header. The host has the same helper; this is the app's side of it. */
function cookieValue(header: string | null, name: string): string | null {
  for (const part of (header ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Turn `?k=<token>` into a cookie, and get the token out of the URL.
 *
 * The redirect is the point, and `access.mjs` records why: a browser following a link cannot set a
 * header, so the secret arrives once in the query string — where it then sits in the address bar, in
 * history, and in any Referer the page later sends. One 302 later it is an httpOnly cookie and none
 * of those have it.
 *
 * IT REDIRECTS EVEN WHEN THE LINK IS NO GOOD, with no cookie attached. Answering a bad token
 * differently would say "that link is wrong AND this record exists" to anybody who guesses one — and
 * the whole design of the refusal is that a stranger cannot tell those apart. After the redirect the
 * request is an ordinary one and gets the ordinary answer, which for a private record is a 404
 * byte-identical to a miss.
 */
async function unlock(request: Request, url: URL, record: { repo: string; ref: string; slug: string }) {
  const clean = new URL(url.href);
  clean.searchParams.delete('k');
  const location = clean.pathname + clean.search + clean.hash;
  const headers = new Headers({ location, 'cache-control': 'no-store' });

  const token = url.searchParams.get('k') ?? '';
  try {
    const project = await postgresProjectStore().byRepo(record.repo);
    if (project) {
      const link = await postgresShareLinkStore().byTokenHash(tokenHash(token));
      const now = new Date();
      if (link && grants(link, project.id, record, now)) {
        // SCOPED TO THE PROJECT'S PATH, not to `/`. A link to one repo must not become a credential
        // the browser offers on every request to this host.
        const maxAge = cookieMaxAgeSeconds(link, now);
        headers.append(
          'set-cookie',
          `${SHARE_COOKIE}=${encodeURIComponent(token)}; Path=/${record.repo}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`,
        );
      }
    }
  } catch (err) {
    // Same reasoning as `authorize`'s catch: a database outage is not a verdict. No cookie is set, so
    // the redirected request is answered by whatever the host would have said.
    console.error(`[unlock] could not resolve a share link for ${record.repo}:`, (err as Error)?.message ?? err);
  }

  return new Response(null, { status: 302, headers });
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

/**
 * May this viewer see that this repo EXISTS?
 *
 * The same decision the record route makes, asked for a listing — because a filter that disagreed
 * with the gate would either hide something readable or, far worse, name something that is not.
 * `server.mjs` learned this the hard way and left the note: the gallery itself was filtered correctly
 * on the first try while the sentence ABOUT it still printed "2 lagoons · acme/secret + acme/open".
 *
 * ABSTAIN falls back to the host's own `access.json`, exactly as it does for a record: a repo the
 * database has never heard of is still the host's to judge, and it judges by the same policy it did
 * before phase 2.
 */
async function visibleTo(asker: Asker, repo: string, deps: AuthorizeDeps, hostAccess: unknown): Promise<boolean> {
  const decision = await authorize(asker, { repo, ref: 'latest', slug: 'all' }, deps);
  if (decision.outcome === 'allow') return true;
  if (decision.outcome === 'deny') return false;
  return canRead(hostAccess, repo, { adminOk: false, readSecret: null }) as boolean;
}

const handler = async (request: Request) => {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // THE INDEX IS THE APP'S NOW — the first route to move out of `server.mjs` under phase 4, and the
  // one that makes the migration visible at all. Everything below it still falls through.
  if (pathname === '/' && request.method === 'GET') {
    try {
      return await renderIndex(request);
    } catch (err) {
      // A store the app cannot open is not a reason to serve a blank host: fall through and let the
      // node host answer, exactly as it did before. Same reasoning as `abstain`.
      console.error('[index] falling through to the host:', (err as Error)?.message ?? err);
      return proxyToHost(request);
    }
  }

  const record = parseRecordPath(pathname);

  // NOT A RECORD: the app has no opinion. Unchanged from phase 0 — including `?k=`, which on a group
  // page or the index is still the HOST's read secret and still handled there.
  if (!record) return proxyToHost(request);

  // A SHARE LINK ARRIVES AS `?k=`, and on a record path the app must answer it rather than let it
  // through: the host has its own `?k=` handler for its own secret, and forwarding one would set the
  // wrong cookie for the wrong credential. See `unlock` for what it does with it.
  if (url.searchParams.has('k')) return unlock(request, url, record);

  const shareToken = cookieValue(request.headers.get('cookie'), SHARE_COOKIE);

  let decision;
  try {
    decision = await authorize({ viewer: await viewerOf(), shareToken }, record, {
      projects: postgresProjectStore(),
      memberships: postgresMembershipStore(),
      access: postgresAccessStore(),
      shareLinks: postgresShareLinkStore(),
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
  //
  // A STALE `motu_read` COOKIE MUST NOT SHADOW OUR OWN CREDENTIAL, and this is not hypothetical — it
  // is how the first real sign-in through this path failed. `access.mjs`'s `readSecretFrom` checks the
  // cookie BEFORE the bearer, by design: a browser carries a cookie, an application carries a bearer,
  // and the two were never meant to arrive on the same request. This proxy makes them arrive on the
  // same request — it forwards whatever cookies the browser happens to hold AND attaches its own
  // bearer once `authorize` has decided. A `motu_read` cookie set months ago, before a secret
  // rotation, then wins over a bearer that is correct RIGHT NOW, and the person who was just granted
  // access is refused by a credential they forgot they had.
  //
  // The fix is not in access.mjs's precedence — that rule is still right for the case it was written
  // for, a browser with nothing else to offer. It is that once THIS app has decided, its bearer is the
  // only credential this hop should present. So the browser's `motu_read` cookie, if any, is stripped
  // here — not the whole Cookie header, which still carries the Supabase session cookies the app set
  // and nothing else the host reads (`motu_read` is the host's only cookie, per access.mjs).
  const cred: Record<string, string> =
    decision.because === 'public'
      ? {}
      : { ...hostCredential(), cookie: withoutCookie(request.headers.get('cookie'), 'motu_read') };
  const response = await proxyToHost(request, { setHeaders: cred });

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

/** The front page, rendered by the app from `views.mjs`'s own renderer — imported, never copied. */
async function renderIndex(request: Request) {
  const s = store();
  const hostAccess = access();
  const deps = {
    projects: postgresProjectStore(),
    memberships: postgresMembershipStore(),
    access: postgresAccessStore(),
    shareLinks: postgresShareLinkStore(),
  };
  const asker = {
    viewer: await viewerOf(),
    shareToken: cookieValue(request.headers.get('cookie'), SHARE_COOKIE),
  };

  const keep = async (repo: string) => visibleTo(asker, repo, deps, hostAccess);

  const allRepos = s.listRepos() as Array<{ repo: string }>;
  const visible = await Promise.all(allRepos.map((r) => keep(r.repo)));
  const repos = allRepos.filter((_, i) => visible[i]);

  // A GROUP'S SUMMARY NAMES ITS MEMBERS, so filtering the repo list alone is not enough — and a group
  // left with nothing readable is DROPPED rather than shown empty, because "a gallery you may not
  // see" is itself the fact being withheld. Both rules copied from server.mjs deliberately.
  const allGroups = s.listGroups() as Array<{ members?: Array<{ repo: string }> }>;
  const groups: unknown[] = [];
  for (const g of allGroups) {
    const members = [];
    for (const m of g.members ?? []) if (await keep(m.repo)) members.push(m);
    if (members.length) groups.push({ ...g, members });
  }

  return new Response(rootIndexPage({ repos, groups, stats: s.stats() }), {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

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
