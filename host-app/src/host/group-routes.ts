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
import { lagoonPage, errorPage } from '@motu/host/src/views.mjs'
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
  _url: URL,
  _request: Request,
  _visible: Visible,
): Promise<Response | null> {
  // GROUPS ARE GONE FROM THE STORE, so this view cannot answer and no longer pretends to.
  //
  // `getGroup`, `resolveGroup`, `snapshot` and `listGroups` were removed with the feature — the rail
  // belongs to every lagoon now, so a group stopped being the only way to look at more than one. The
  // calls left behind here could only throw, and they also stopped the app TYPECHECKING: that is why
  // the deployed build predates the `composedPage` -> `lagoonPage` rename and why nothing landed on
  // it for weeks.
  //
  // ABSTAINING, NOT DELETED. `visibleMembers` above is the gate's own logic and is still covered by
  // `test/group-visibility.test.ts`; removing a feature's last routes is a decision for whoever owns
  // the product, not a repair made while fixing a proxy loop. `/g/<name>` falls through to ordinary
  // routing, which 404s it.
  if (segments[0] !== 'g') return null
  return null
}
