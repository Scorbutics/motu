// THE COMPOSED GROUP VIEW, moved into the app.
//
// WHY IT HAD TO MOVE, and it is the same reason the read routes did, found the same way — by looking
// at the screen. Signed in, the front page listed `acme/example-app`, which is private in
// access.json and readable to this viewer because the DATABASE says so: a `repo_access` row from the
// GitHub grant. Opening the `everything` group, it was gone. The page and the gallery disagreed about
// what one person may see.
//
// The cause is exactly what `read-routes.ts` records for `/api/repos`: `readable()` in server.mjs is
// `canRead(access.json, …)` and nothing else. It has never heard of a session, a membership or a
// share link, so every gate it applies is the policy from before phase 2. Filtering a group's members
// with it drops precisely the private repositories the viewer was granted.
//
// The direction matters and is worth stating: this failed SAFE. It showed less than the viewer may
// see, never more. That is why it survived — a leak gets noticed, a silent omission gets shrugged at.
//
// FRAME INDICES COME FROM THE SAME FILTERED LIST, which is why the shell and the frames had to move
// together. `/g/<name>/f/2` means the third READABLE member; if the app rendered the shell from its
// list and the host served frames from its own, the two would number differently and a click would
// open somebody else's lagoon.
import { store, normalizeSegment } from './store.ts'
import { html } from './read-routes.ts'
import type { Visible } from './read-routes.ts'
import { upstreamOrigin, proxyToHost } from '../upstream.ts'
// @motu/host is plain ESM node; tsc reads it through allowJs.
import { composedPage, errorPage } from '@motu/host/src/views.mjs'
import { wrapFragment, withRepoMeta } from '@motu/host/src/document.mjs'

const NO_STORE = 'no-store'

/** One member of a resolved group, as `store.resolveGroup` returns it. */
export type Member = {
  repo: string
  slug: string
  hash: string | null
  title: string
  sha: string | null
  live: string | null
}

/**
 * Which members are being served LIVE right now, asked of the host that knows.
 *
 * THE REGISTRY STAYS WHERE IT IS, deliberately, and this is the one piece that did not move. It is
 * in-memory state fed by `motu lagoon serve --watch` through `POST /api/live`, and the CLI's
 * `host.json` points at the node host — so moving the map here would mean repointing every developer's
 * config and breaking watch mode for anyone who had not. Asking for it is one request per group
 * render against a process on the same machine, and it keeps the migration to the part that was
 * actually wrong.
 *
 * A FAILURE IS "NOTHING IS LIVE", not an error. If the host is down or slow, every member resolves to
 * its last published build — which is what a gallery shows the rest of the time, and is a better
 * answer than refusing the page.
 */
async function liveEndpoints(): Promise<(repo: string, slug: string) => string | null> {
  try {
    const res = await fetch(`${upstreamOrigin()}/api/live`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(1500),
    })
    if (!res.ok) return () => null
    const body = (await res.json()) as { live?: Array<{ member: string; url: string }> }
    const map = new Map((body.live ?? []).map((e) => [e.member, e.url]))
    return (repo: string, slug: string) => map.get(`${repo}/${slug}`) ?? null
  } catch {
    return () => null
  }
}

/**
 * The members of a group this viewer may see, IN ORDER.
 *
 * Its own function because the order is load-bearing and the ordering is the subtle part: `/g/x/f/2`
 * means the third READABLE member, so dropping one shifts every index after it. The shell and the
 * frames both derive from this list, which is why they had to move into the app together — two
 * filters producing two orders is a click that opens somebody else's lagoon, and it renders
 * perfectly while doing it.
 */
export async function visibleMembers(all: Member[], visible: Visible): Promise<Member[]> {
  const keep = await Promise.all(all.map((m) => visible(m.repo)))
  return all.filter((_, i) => keep[i])
}

/**
 * `GET /g/<name>` and `/g/<name>/f/<i>` — a gallery of several projects, and its frames.
 *
 * Returns null for anything that is not a group view, so the caller falls through exactly as before.
 */
export async function groupView(
  segments: string[],
  url: URL,
  request: Request,
  visible: Visible,
): Promise<Response | null> {
  if (segments[0] !== 'g') return null
  const name = normalizeSegment(segments[1])
  if (!name) return html(400, errorPage(400, 'bad group name'))

  const s = store()
  if (!s.getGroup(name)) return html(404, errorPage(404, `no group "${name}"`))

  // A GALLERY MUST NOT BE A WAY ROUND THE GATE, and now it is not a way round the GRANT either.
  // an `all` group composes every published project, so a private one joins a
  // public gallery by default rather than by anyone choosing it — and the answer to that is the same
  // question the front page asks, which is what this line finally is.
  //
  // Filtered rather than refused: a gallery of five projects, one of which you may not see, is still
  // a gallery of the four you may.
  const endpointFor = await liveEndpoints()
  const all = (s.resolveGroup as (n: string, e: unknown) => Member[])(name, endpointFor)
  const members = await visibleMembers(all, visible)

  if (!members.length) {
    return html(404, errorPage(404, `group "${name}" resolves to nothing yet — no member has published`))
  }

  if (segments[2] === 'f') {
    const i = Number.parseInt(segments[3] ?? '', 10)
    const member = Number.isInteger(i) ? members[i] : undefined
    if (!member) return html(404, errorPage(404, 'no such frame'))
    if (member.live) {
      // THE WHOLE REMAINING PATH, and the query with it — server.mjs learned this the hard way, when
      // forwarding one segment left anything nested arriving truncated. It costs nothing today,
      // because the process behind a live frame answers every path with the same self-contained
      // artifact, and it is here so that stays true of one that routes.
      // The path only — `proxyToHost` carries the query across itself, and appending it here too
      // produced `?a=1?a=1`.
      const rest = segments.slice(4).join('/')
      return proxyToHost(request, { origin: member.live, rewritePath: () => `/${rest}` })
    }
    if (!member.hash) return html(404, errorPage(404, 'this member has never published'))
    const bytes = s.readHash(member.hash) as Buffer | null
    if (!bytes) return html(410, errorPage(410, 'this frame’s object is gone'))
    // NOT immutable: the group means TODAY, and today's `latest` moves.
    return html(200, withRepoMeta(wrapFragment(bytes, { title: member.title }), member.repo) as string)
  }

  // The trailing slash is LOAD-BEARING — the shell's frame src is relative (`f/<i>`).
  if (segments.length === 2 && !url.pathname.endsWith('/')) {
    return new Response(null, {
      status: 302,
      headers: { location: `/g/${name}/`, 'cache-control': NO_STORE },
    })
  }
  if (segments.length > 2) return html(404, errorPage(404, 'no such group view'))

  // The pin: what this view would be if it were frozen now. Live members pin their last published
  // build, because a dev server has nothing to pin — and the footer says so.
  const snap = s.snapshot(name) as { id?: string } | null
  return html(200, composedPage({ id: snap?.id ?? null, group: name, members, live: true }))
}
