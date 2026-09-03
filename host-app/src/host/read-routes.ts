// The host's READ routes, moved into the app.
//
// PHASE 4, continued. These are pure reads of `store.mjs` — no writes, no retention, no live
// registry — which is why they come first: each one is verifiable by fetching the same URL from the
// app and from the node host and comparing bytes.
//
// EVERY ONE OF THEM FILTERS THROUGH THE APP'S GATE, not the host's. That is the whole reason for
// moving them rather than leaving them proxied: `readable()` in server.mjs knows only about
// access.json, so a repo private in the DATABASE was still listed by name in `/api/repos` and
// `/api/groups` even while its records 404'd. The listing and the gate have to agree, or the listing
// is the leak.
import { store, access, normalizeRepo, normalizeSegment } from './store.ts'
import type { RecordPath } from './records.ts'
import { liveMap, liveFor, proxyLive } from './live.ts'
// @motu/host is plain ESM node; tsc reads it through allowJs.
import { repoIndexPage, errorPage } from '@motu/host/src/views.mjs'
import { canRead } from '@motu/host/src/access.mjs'
import { wrapFragment, withRepoMeta } from '@motu/host/src/document.mjs'

const NO_STORE = 'no-store'
/** `store.mjs`'s own value for content addressed by hash: it cannot change, so cache it for a year. */
const IMMUTABLE = 'public, max-age=31536000, immutable'

// PRETTY-PRINTED, two spaces — `server.mjs`'s own `json()` helper does `JSON.stringify(obj, null, 2)`
// and these responses are meant to be byte-identical to what it produced. A parser would not care;
// the point of matching is that "byte-identical to the host" stays a check anyone can run rather than
// a claim with an asterisk on it.
export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': NO_STORE },
  })

export const html = (status: number, body: string, cacheControl = NO_STORE) =>
  new Response(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': cacheControl },
  })

/** The app's filter, given a predicate that already folds in `authorize` + the access.json fallback. */
export type Visible = (repo: string) => Promise<boolean>

/** `GET /api/health` — the one route with nothing to hide, so nothing to filter. */
export function apiHealth() {
  return json(200, { ok: true, ...(store().stats() as object) })
}

/** `GET /api/repos` — the CLI builds a gallery from this rather than scraping the index. */
export async function apiRepos(visible: Visible) {
  const all = store().listRepos() as Array<{ repo: string }>
  const keep = await Promise.all(all.map((r) => visible(r.repo)))
  return json(200, { repos: all.filter((_, i) => keep[i]) })
}

/** `GET /api/groups` — members filtered, and an empty group dropped rather than shown empty. */
export async function apiGroups(visible: Visible) {
  // `listGroups` went with the groups feature. An empty list is the truthful answer for a host that
  // has no groups, and it keeps this endpoint's shape for anything still calling it.
  const all = ((store() as unknown as { listGroups?: () => Array<{ members?: Array<{ repo: string }> }> }).listGroups?.() ??
    []) as Array<{ members?: Array<{ repo: string }> }>
  const groups: unknown[] = []
  for (const g of all) {
    const members = []
    for (const m of g.members ?? []) if (await visible(m.repo)) members.push(m)
    if (members.length) groups.push({ ...g, members })
  }
  return json(200, { groups })
}

/** `GET /api/baselines?repo=&island=` — visual baselines for one repo. */
export async function apiBaselines(url: URL, visible: Visible) {
  const repo = normalizeRepo(url.searchParams.get('repo') ?? '')
  if (!repo) return json(400, { error: 'repo is required' })
  // 404 AND NOT 403, same rule as a record: a refusal that reads differently from an absence tells
  // the asker the repo exists.
  if (!(await visible(repo))) return json(404, { error: 'no such repo' })
  return json(200, {
    repo,
    // Cast at the boundary, like `openStore`: listShots takes an island filter (store.mjs), but tsc
    // infers the parameter type from the destructure's `= null` default.
    shots: (store().listShots as (r: string, i: string | null) => unknown)(
      repo,
      url.searchParams.get('island') || null,
    ),
  })
}

/**
 * `GET /shot/<hash>` — the bytes of one screenshot, by content hash.
 *
 * NOT GATED BY REPO, and that is `server.mjs`'s own choice rather than an omission: the address is a
 * content hash, so possessing it is already the proof, and there is no repo in the URL to gate by.
 */
export function shot(hash: string) {
  const bytes = store().readHash(hash) as Buffer | null
  if (!bytes) return html(404, errorPage(404, 'no such shot'))
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { 'content-type': 'image/png', 'cache-control': IMMUTABLE },
  })
}

/**
 * `GET /<repo>/` — one repo: latest per slug, plus history.
 *
 * THREE OUTCOMES, not two, and collapsing two of them was a leak I shipped for one build. Returning
 * null for "you may not see this" fell through to the proxy, and the HOST served the page happily —
 * because access.json still called that repo public. A refusal must be ANSWERED here, not delegated
 * to the component whose disagreement is the entire reason this route moved.
 *
 *   null      — not a repo listing at all; the caller falls through, as before.
 *   404 page  — a repo, and this viewer may not see it. Same body as one that does not exist.
 *   200 page  — the listing.
 */
export async function repoListing(segments: string[], visible: Visible) {
  const repo = normalizeRepo(segments.join('/'))
  if (!repo) return null
  const listing = store().listRepo(repo)
  // Not a repo this host holds: fall through, so a genuinely unknown path keeps its old answer.
  if (!listing) return null
  if (!(await visible(repo))) return html(404, errorPage(404, `nothing at ${segments.join('/')}`))
  return html(200, repoIndexPage(listing))
}

/**
 * `GET /<repo>/<ref>/<slug>` — the page itself, once `authorize` has said yes.
 *
 * This is the branch phases 2 and 3 gated and then PROXIED, because `store.mjs` had to keep one
 * writer. With `server.mjs` gone the app is that writer, so it can read the bytes directly and the
 * hop — along with the whole `motu_read` cookie-shadowing problem that hop created — goes away.
 */
export async function record(rec: RecordPath, request: Request, url: URL) {
  const s = store()
  const found = s.resolveRef(rec.repo, rec.ref, rec.slug) as
    | { id: number; hash: string; title?: string; mutable?: boolean }
    | null

  // LIVE FIRST, and only for `latest`. The project somebody is working on right now has a dev server
  // that IS the answer. This route is not the one serving records yet — the catch-all still gates and
  // proxies them, and the host answers — so this is here BEFORE it is needed rather than after: the
  // switch that starts calling this function must not be the change that quietly stops hot reload.
  // See `live.ts`.
  const serving = liveFor(await liveMap(), rec.repo, rec.ref, rec.slug)
  if (serving) {
    const sub = rec.isReload ? '/__motu_reload' : `/${url.search}`
    return proxyLive(serving, sub, request, {
      repo: rec.repo,
      slug: rec.slug,
      hash: found?.hash ?? null,
      title: found?.title ?? rec.slug,
      // Read LAZILY: the fallback is only paid for when the dev server has actually gone.
      bytes: () => (found ? (s.read(rec.repo, found.id, found.hash) as Buffer | null) : null),
    })
  }
  // NOTHING IS SERVING IT. A reload channel with no live server is a 404 rather than a page: the
  // client asked for a stream, and handing it a document would have it parse HTML as events for ever.
  if (rec.isReload) return html(404, errorPage(404, 'nothing is serving this page live'))

  if (!found) return html(404, errorPage(404, `nothing at ${rec.repo}/${rec.ref}/${rec.slug}`))
  const bytes = s.read(rec.repo, found.id, found.hash) as Buffer | null
  // A record whose blob has been swept is GONE rather than missing — 410, because the URL was valid
  // and the content is what expired. store.mjs makes the same distinction.
  if (!bytes) return html(410, errorPage(410, 'the object behind this URL has been swept'))
  return html(
    200,
    // `withRepoMeta` is document.mjs's own, imported — it takes the wrapped page and the repo, and a
    // second copy of it here would be one more thing to keep in step for no reason.
    withRepoMeta(wrapFragment(bytes, { title: found.title }), rec.repo) as string,
    found.mutable ? NO_STORE : IMMUTABLE,
  )
}

/** The host's own `readable`, for the ABSTAIN fallback: a repo the database has never heard of. */
export function hostReadable(repo: string): boolean {
  return canRead(access(), repo, { adminOk: false, readSecret: null }) as boolean
}

export { normalizeSegment }
