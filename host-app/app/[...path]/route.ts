// THE FALL-THROUGH, AND THE GATE.
//
// A REQUIRED catch-all (`[...path]`), not an optional one, since `/` became a real page: Next refuses
// a page and an optional catch-all at the same specificity, and `/` is the one route that genuinely
// needs to be a page — a route handler cannot render the region, because Next will not allow
// `react-dom/server` inside one.
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
import { createHash } from 'node:crypto';
import { groupView } from '@/src/host/group-routes';
import { parseMemberAssetPath } from '@/src/host/records';
import { railMembers, focusIndex } from '@/src/host/lagoon-rail';
// @motu/host is plain ESM node; tsc reads it through allowJs.
import { lagoonPage } from '@motu/host/src/views.mjs';
import { store, access, normalizeRepo } from '@/src/host/store';
// @motu/host is plain ESM node; tsc reads it through allowJs.
import { visibilityFor } from '@/src/host/visibility';
import { canRead } from '@motu/host/src/access.mjs';
// The SAME ramp every other motu surface wears — see bootSplashFor.
import { primaryVars } from '@motu/chrome/primary';
import {
  apiHealth, apiRepos, apiGroups, apiBaselines, shot, repoListing, record as serveRecord,
} from '@/src/host/read-routes';

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
/**
 * THE DECISION FOR ONE MEMBER, REMEMBERED FOR A FEW SECONDS — because a lagoon is not one request.
 *
 * `viewerOf()` calls `supabase.auth.getUser()`, which is a GoTrue ROUND-TRIP. That is fine once per
 * page. It is not fine once per MODULE: a Vite dev server's frame pulls a hundred-odd `@fs` modules
 * in one burst, and authorizing each of them separately turns one page load into a hundred auth
 * round-trips. Under that load some of them lose — `viewerOf` answers null, the decision flips to
 * deny, and the browser is handed HTML where it asked for JavaScript:
 *
 *     Loading module … was blocked because of a disallowed MIME type ("text/html")
 *
 * The failures are a RANDOM SUBSET, which is what gives it away: `club.archipelago.ts` loads and
 * `regions/club.tsx` does not, with timings from 700ms to 12.6s. Nothing about the paths differs —
 * only how many were in flight.
 *
 * KEYED BY THE CREDENTIAL, not just the member: two viewers must never share an answer. The cookie
 * header carries the session, so it is part of the key (hashed — this is a decision cache, not a
 * place to keep tokens). A few seconds is long enough to cover one page's burst and short enough that
 * a revoked grant is not honoured beyond it.
 *
 * ASSET PATHS ONLY. The page and the frame decide afresh every time; they are one request each, and
 * they are the request where being current matters.
 */
const DECISION_TTL_MS = 5_000;
const decisions = new Map<string, { at: number; value: unknown }>();

function decisionKey(request: Request, repo: string, slug: string): string {
  return createHash('sha256')
    .update(`${request.headers.get('cookie') ?? ''}\n${repo}/${slug}`)
    .digest('hex');
}

function rememberedDecision(key: string): unknown | null {
  const hit = decisions.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > DECISION_TTL_MS) {
    decisions.delete(key);
    return null;
  }
  return hit.value;
}

function rememberDecision(key: string, value: unknown): void {
  // Bounded, so a long-lived process cannot grow one entry per viewer per member for ever. The cache
  // is a burst absorber; anything older than the TTL is dead weight, and clearing on size is enough.
  if (decisions.size > 500) {
    const now = Date.now();
    for (const [k, v] of decisions) if (now - v.at > DECISION_TTL_MS) decisions.delete(k);
    if (decisions.size > 500) decisions.clear();
  }
  decisions.set(key, { at: Date.now(), value });
}

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


const serve = async (request: Request) => {
  const url = new URL(request.url);
  const pathname = url.pathname;

  const segments = pathname.split('/').filter(Boolean).map((x) => {
    try { return decodeURIComponent(x); } catch { return x; }
  });

  // THE READ ROUTES, moved out of server.mjs. Each filters through the APP's gate rather than the
  // host's — which is the reason to move them at all: `readable()` in server.mjs knows only about
  // access.json, so a repo private in the DATABASE was still named by /api/repos and /api/groups
  // while its records 404'd. The listing and the gate have to agree, or the listing is the leak.
  if (request.method === 'GET') {
    try {
      const visible = await visibilityFor({
        viewer: await viewerOf(),
        shareToken: cookieValue(request.headers.get('cookie'), SHARE_COOKIE),
      });
      if (pathname === '/api/health') return apiHealth();
      if (pathname === '/api/repos') return apiRepos(visible);
      if (pathname === '/api/groups') return apiGroups(visible);
      if (pathname === '/api/baselines') return apiBaselines(url, visible);
      if (segments[0] === 'shot' && segments[1]) return shot(segments[1]);
      // THE GALLERY, gated by the same predicate as the page that links to it. Before this it was
      // proxied, and the host filtered its members with access.json alone — so a repository the front
      // page listed (private, granted in the database) vanished on the way into the group.
      const group = await groupView(segments, url, request, visible);
      if (group) return group;
      if (segments.length && segments.length < 3 && !HOST_NAMESPACES.has(segments[0] as string)) {
        const listing = await repoListing(segments, visible);
        if (listing) return listing;
      }
    } catch (err) {
      // Same rule as the index: a store or database the app cannot reach is not a verdict. Fall
      // through and let the host answer exactly as it did before.
      console.error('[read-routes] falling through to the host:', (err as Error)?.message ?? err);
      return proxyToHost(request);
    }
  }

  let record = parseRecordPath(pathname);
  /**
   * `__motu_frame` GOES THROUGH UNTOUCHED — the host owns it now.
   *
   * This used to strip the suffix before the hop, because the address was the app's own and the host
   * had never heard of it. The host implements it (`server.mjs`, `isFrame`): the suffixed path serves
   * the ARTIFACT and the bare path serves the SHELL. Once that landed, stripping became a recursion.
   *
   *   frame asks /r/latest/all/__motu_frame  ->  stripped to /r/latest/all  ->  host returns the SHELL
   *   that shell contains a frame pointing at /r/latest/all/__motu_frame    ->  stripped again  -> ...
   *
   * The page renders as a stack of shells inside shells, each drawn a little later than the last, and
   * it looks like a rendering bug rather than a routing one — it was reported as "the lagoon is
   * broken", chased through the artifact, the store and the tunnel, and none of them were involved.
   *
   * Two hosts disagreeing about who owns an address is the shape of this failure; the rule now is
   * that the host owns it and this proxy passes it along.
   */
  const bareRewrite = (p: string) => p;

  // NOT A RECORD: the app has no opinion. Unchanged from phase 0 — including `?k=`, which on a group
  // page or the index is still the HOST's read secret and still handled there.
  //
  // EXCEPT A LIVE MEMBER'S ASSETS, which are not a record and are not "no opinion" either: they are
  // the dev server's modules under the member's own prefix, and on a PRIVATE repo they need the same
  // credential the page just got. Without it the host refuses them anonymously and the browser is
  // handed HTML where it asked for JavaScript — a frame that loads and then renders nothing. Treated
  // as `bare` so it takes the artifact path below (authorize, then proxy) and never draws a shell.
  const asset = record ? null : parseMemberAssetPath(pathname);
  if (asset) record = { ...asset, isReload: false, bare: true };
  if (!record) return proxyToHost(request);

  // THE SHELL, for a page. Every lagoon carries the rail that used to belong to a group — see
  // `lagoon-rail.ts` — so what the browser gets at this address is the sidebar plus a frame, and the
  // frame asks for `/f`, which is the same bytes without the shell. A reload stream and a bare
  // request are the page itself and go straight through.
  if (!record.isReload && !record.bare) {
    try {
      const visible = await visibilityFor({
        viewer: await viewerOf(),
        shareToken: cookieValue(request.headers.get('cookie'), SHARE_COOKIE),
      });
      // GATED BY THE SAME PREDICATE THE INDEX USES, and placed before the authorize block for one
      // reason: `visibilityFor` already resolves an ABSTAIN through access.json, and on this host
      // every repo abstains today. Deciding the shell after the abstain branch meant deciding it
      // never. A lagoon this viewer may not see falls through to the gate below and is refused
      // there, exactly as before — the shell is never the thing that reveals one exists.
      if (!(await visible(record.repo))) throw new Error('not visible');
      const members = await railMembers(visible);
      const at = focusIndex(members, record.repo, record.slug);
      // A SHELL AROUND SOMEBODY ELSE'S LAGOON IS WORSE THAN NO SHELL. `at < 0` means the member being
      // asked for is not in the rail at all — it has no PUBLISHED record, which is exactly what a
      // live-only lagoon looks like, and a normal thing to want to look at. `focusIndex` used to
      // answer 0 there, so the shell framed whoever came first: a request for one lagoon served
      // another, with a rail that did not contain the repo in the URL. Fall through instead and serve
      // the page as it always was.
      if (members.length && at >= 0) {
        return new Response(
          // `lagoonPage`, which is what `composedPage` was renamed to when a group stopped being the
          // only thing with a shell. This call still said `composedPage`, so the app could not BUILD
          // — the process serving it is an older build from before the rename, and any deploy would
          // have failed. `id` and `group` went with the group concept and are no longer parameters.
          lagoonPage({
            docTitle: `${record.repo}/${record.slug}`,
            members: members.map((m, i) => ({ ...m, i })),
            live: true,
            focus: at,
          }),
          { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
        );
      }
      // AN EMPTY RAIL IS NOT A SHELL. If nothing resolved — a store the app cannot read, a viewer who
      // may see nothing — fall through and serve the page as it always was, rather than a sidebar
      // with nothing in it wrapped around the one thing they asked for.
    } catch (err) {
      // A REFUSAL IS NOT A FAULT. `not visible` is this block deciding it has no business rendering a
      // shell; everything else is the store or the database failing, which is worth a line.
      if ((err as Error)?.message !== 'not visible') {
        console.error('[lagoon-rail] serving the page bare:', (err as Error)?.message ?? err);
      }
    }
  }


  // A SHARE LINK ARRIVES AS `?k=`, and on a record path the app must answer it rather than let it
  // through: the host has its own `?k=` handler for its own secret, and forwarding one would set the
  // wrong cookie for the wrong credential. See `unlock` for what it does with it.
  if (url.searchParams.has('k')) return unlock(request, url, record);

  const shareToken = cookieValue(request.headers.get('cookie'), SHARE_COOKIE);

  let decision;
  // One burst of modules is one decision. See `decisions` above for why this exists and why it is
  // keyed by the credential.
  const cacheKey = asset ? decisionKey(request, record.repo, record.slug) : null;
  const remembered = cacheKey ? rememberedDecision(cacheKey) : null;
  try {
    decision =
      (remembered as typeof decision) ??
      (await authorize({ viewer: await viewerOf(), shareToken }, record, {
        projects: postgresProjectStore(),
        memberships: postgresMembershipStore(),
        access: postgresAccessStore(),
        shareLinks: postgresShareLinkStore(),
      }));
    if (cacheKey && !remembered) rememberDecision(cacheKey, decision);
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
  // THE SAME REWRITE ON EVERY PROXY PATH. `__motu_frame` is the app's own address and the host has
  // never heard of it, so any hop that forgets to take it off gets a 404 for a page that exists —
  // which is exactly what this branch did. Every repo on this host abstains today, so that was every
  // frame except the ones whose repo happened to be answered by another branch.
  // THE SAME SPLASH ON BOTH ARTIFACT PATHS. A repo with no row abstains and is served from here, which
  // is most of this host today -- patching only the decided path left twenty, the very artifact the
  // loader exists for, without one.
  if (decision.outcome === 'abstain') {
    return withBootSplash(await proxyToHost(request, { rewritePath: bareRewrite }), record);
  }

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
  // THE BYTES. `__motu_frame` is the app's own address and the host has never heard of it, so it
  // comes back off before the hop — the host answers the page exactly as it did, live or stored.
  // THE ARTIFACT ONLY. The shell around a lagoon is rendered by this app and paints at once; a
  // loader over it would be a regression, so the splash goes on the framed document and nothing else.
  const response = withBootSplash(await proxyToHost(request, { setHeaders: cred, rewritePath: bareRewrite }), record);

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

/**
 * A LOADER, because a lagoon is one enormous document and the wait was blank.
 *
 * Measured on twenty's artifact: first-paint at 272ms, first-CONTENTFUL-paint at 3984ms. The browser
 * has the page and paints nothing recognisable for three and a half seconds, on top of the transfer.
 * The host streams (TTFB 0.42s against a 3.0s total), so markup placed right after <body> paints
 * almost immediately -- which is why this needs no sharding and no change to any artifact.
 *
 * INJECTED WHILE STREAMING, not by buffering the document. Holding 19 MB to do a string replace
 * would delay the first byte until the last one arrived and defeat the entire point.
 *
 * IT REMOVES ITSELF TWICE OVER. A published lagoon renders into the body and takes this with it --
 * the same thing that made `motu-repo` have to live in the <head> -- so it usually disappears at the
 * exact moment there is something to see. The listener is for the artifacts that do not.
 *
 * AND IT WEARS THE PROJECT'S COLOUR, not motu's. The shell around this frame already follows the
 * lagoon -- acme's rail is gold -- so a teal loader inside a gold shell was the one moment the host
 * attributed its own colour to somebody else's application, and it was the FIRST thing anyone saw of
 * that project. The ramp is built by `primaryVars`, the same function `applyMotuChrome` and the
 * shell's detector use, so there is no second set of percentages to drift.
 *
 * Two ways to know the colour, in the order the rest of the host already ranks them:
 *
 *   1. DECLARED (`chrome.brand`) -- known on the server, so it is in the first bytes and the splash
 *      is never briefly teal. acme tuned its gold by hand; that decision wins, verbatim.
 *   2. DETECTED -- read from the artifact's own pixels, which cannot happen until the artifact has
 *      painted, which is precisely what this splash is covering. So it can only come from a PREVIOUS
 *      visit, via the same sessionStorage entry the shell writes.
 *
 * Neither available -- a lagoon with no declared colour, seen for the first time -- and it stays
 * motu teal, which is honest: the host is the only thing on screen that anybody has heard of yet.
 *
 * This cannot poison detection. `rasteriseDocument` excludes `#motu-boot` by name, for exactly this
 * reason: a full-viewport gradient in the project's own colour would otherwise BE the answer on any
 * artifact slow enough to still be showing it.
 */
const MOTU_TEAL = '#12988f';

/**
 * The ramp, expressed against a CSS variable rather than a colour.
 *
 * `primaryVars`' mix helper only concatenates strings, so handing it `var(--mb)` yields valid CSS --
 * `color-mix(in srgb, var(--mb) 84%, #000)`. That is what lets the splash be REPAINTED by setting one
 * property, instead of a second copy of these percentages living in the inline script where it would
 * quietly drift from the one every other surface uses.
 */
const BOOT_RAMP = primaryVars('var(--mb)') as Record<string, string>;

/**
 * A DECLARED COLOUR IS NOT A HEX, and assuming it was is what made the first version of this ship
 * teal. acme declares `color-mix(in srgb, hsl(55 90% 48%) 75%, #000)` — the console's own contract
 * says any self-contained CSS colour, and `normalisePrimary` parses hex only, so it answered null and
 * the splash fell straight back to motu's teal on the one project that had bothered to say otherwise.
 *
 * Nothing needs to parse it. The ramp above is `color-mix(in srgb, var(--mb) N%, …)`, so the browser
 * does the mixing and a nested color-mix, an hsl() or a hex all work identically. The clamp exists
 * for DETECTED colours, which arrive already normalised from the detector that read the pixels.
 *
 * Safe in the attribute because the host constrains it at publish (`[;{}<>]` rejected, 120 chars) —
 * quotes are escaped here anyway, since that filter was written to protect a stylesheet, not an
 * attribute, and relying on someone else's threat model is how the next one gets through.
 */
const bootSplashFor = (primary: string | null, key: string): string => {
  const mb = (primary ?? MOTU_TEAL).replace(/["&<>]/g, '');
  return [
    `<div id="motu-boot" role="status" aria-live="polite" style="--mb:${mb};position:fixed;inset:0;z-index:2147483646;`,
    'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;',
    `background:${BOOT_RAMP['--motu-surface-page']};transition:opacity .26s ease;`,
    // THE CAPTION TOO. #5f716c is a desaturated TEAL grey -- invisible as motu's colour until the rest
    // of the splash stops being teal, at which point it is the one cool thing on a warm screen. A
    // small mix rather than a ramp entry: this is the splash's own text, not a token any other
    // surface shares, and adding it to `primaryVars` would put it on chrome that never asked for it.
    'font:500 13px/1.55 ui-sans-serif,system-ui,\'Segoe UI\',Roboto,sans-serif;',
    'color:color-mix(in srgb, var(--mb) 22%, #5a625f)">',
    `<div style="width:180px;height:6px;border-radius:9999px;overflow:hidden;background:${BOOT_RAMP['--motu-line']}">`,
    '<div style="width:45%;height:100%;border-radius:9999px;',
    `background:linear-gradient(90deg,${BOOT_RAMP['--motu-water-deep']},${BOOT_RAMP['--motu-water-mid']} 55%,${BOOT_RAMP['--motu-water-shallow']});`,
    'animation:motu-boot-swim 1.15s cubic-bezier(.45,.05,.55,.95) infinite"></div></div>',
    '<div>opening the lagoon…</div>',
    '<style>@keyframes motu-boot-swim{0%{transform:translateX(-100%)}100%{transform:translateX(322%)}}',
    '@media (prefers-reduced-motion:reduce){#motu-boot [style*="motu-boot-swim"]{animation:none;width:100%}}</style>',
    '</div>',
    '<script>(function(){var e=document.getElementById("motu-boot");',
    // TIER 2, and only when the server had nothing. A declared colour is a decision and must not be
    // overruled by an inference -- the same precedence the shell's detector already applies.
    `var d=${primary ? 'true' : 'false'};`,
    `if(!d&&e){try{var c=JSON.parse(sessionStorage.getItem(${JSON.stringify('motu-primary:' + key)}));`,
    'if(c&&c.primary)e.style.setProperty("--mb",c.primary)}catch(x){}}',
    'var g=function(){if(!e)return;e.style.opacity="0";setTimeout(function(){e.remove()},260)};',
    'if(document.readyState==="complete")g();else addEventListener("load",g);setTimeout(g,60000)})();</script>',
  ].join('');
};

/**
 * Inject the splash after the first <body>, without waiting for the document to finish.
 *
 * Buffers only until <body> is found (or 64 kB, whichever comes first) so a tag straddling a chunk
 * boundary is still matched, then gets out of the way and passes every later chunk straight through.
 */
const withBootSplash = (response: Response, record: { repo: string; slug: string }): Response => {
  const body = response.body;
  if (!body) return response;
  if (!/^text\/html/i.test(response.headers.get('content-type') ?? '')) return response;

  // THE COLOUR THE PROJECT DECLARED, read from the index the store already holds in memory. Null for
  // a repo that declared none, which is the tier-2 case the splash handles for itself.
  const declared = (store().listRepos() as Array<{ repo: string; brand: string | null }>)
    .find((r) => r.repo === record.repo)?.brand ?? null;
  const splash = bootSplashFor(declared, `${record.repo}/${record.slug}`);

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let held = '';
  let injected = false;

  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      if (injected) return controller.enqueue(chunk);
      held += decoder.decode(chunk, { stream: true });
      const at = /<body[^>]*>/i.exec(held);
      if (at) {
        const cut = at.index + at[0].length;
        injected = true;
        controller.enqueue(encoder.encode(held.slice(0, cut) + splash + held.slice(cut)));
        held = '';
      } else if (held.length > 65536) {
        // No <body> in the first 64 kB: this is not a document worth waiting on.
        injected = true;
        controller.enqueue(encoder.encode(held));
        held = '';
      }
    },
    flush(controller) {
      if (held) controller.enqueue(encoder.encode(held));
    },
  });

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return new Response(body.pipeThrough(transform), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

/**
 * COMPRESS ON THE WAY OUT, which is worth more than anything else on this route.
 *
 * A published lagoon is one self-contained HTML document, and twenty's is 19.66 MB of it. Measured
 * against the real artifact: the host served it with no content-encoding at all, so a viewer
 * downloaded all 19.66 MB raw -- 10.0s of a ~25s load, at about 2 MB/s over the funnel, against
 * 0.22s on loopback. gzip takes the same bytes to 6.12 MB, a 3.2x cut, for one header. It needed no
 * change to any artifact and it applied to every lagoon already published, which is why it came
 * before both of the other ideas on the table.
 *
 * STREAMED, never buffered. CompressionStream lets the 19 MB go out as it arrives; gzipping into a
 * Buffer first would hold the whole artifact in memory per request and delay the first byte until
 * the last one was read, which is the opposite of what a loader needs.
 *
 * `vary` is not optional. Without it a cache in front of this can hand a gzipped body to a client
 * that never asked for one.
 */
const COMPRESSIBLE = /^(?:text\/|application\/(?:javascript|json|xml)|image\/svg)/i;

const compressed = (request: Request, response: Response): Response => {
  const body = response.body;
  if (!body) return response;                                     // HEAD, 204, 304
  if (response.headers.get('content-encoding')) return response;   // already encoded upstream
  if (!/\bgzip\b/.test(request.headers.get('accept-encoding') ?? '')) return response;
  if (!COMPRESSIBLE.test(response.headers.get('content-type') ?? '')) return response;

  const headers = new Headers(response.headers);
  headers.set('content-encoding', 'gzip');
  // The length is the UNCOMPRESSED one and is now a lie; a wrong content-length truncates the body.
  headers.delete('content-length');
  headers.append('vary', 'accept-encoding');
  return new Response(body.pipeThrough(new CompressionStream('gzip')), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

/** Every path out of `serve` goes through the compressor, so no return can forget it. */
const handler = async (request: Request) => compressed(request, await serve(request));

/** The host's own namespaces, which are never a repo listing. Mirrors records.ts. */
const HOST_NAMESPACES = new Set(['shot', 'g', 'm', 'api', 'signin', 'console', 'auth', '_next']);


// `/` IS A PAGE NOW (app/page.tsx), not a branch here. Next prefers it over this catch-all, and a
// route handler could not render the region anyway: Next refuses `react-dom/server` inside one.
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
