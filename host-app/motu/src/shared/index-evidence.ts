// The front page's invented data, in ONE place.
//
// Typed against the APP's own types with `import type`, which erases at runtime so the loaders that
// read evidence files are unaffected — and a renamed field then fails the build here instead of
// quietly previewing last month's shape.
import type { LagoonRepo } from '../../../app/index-region'

/** What this host actually holds, so the preview is not a fiction about a fictional host. */
export const REPOS: LagoonRepo[] = [
  { repo: 'Scorbutics/peps_ta_boite_app', slugs: ['all'], records: 24 },
  { repo: 'twentyhq/twenty', slugs: ['all'], records: 3 },
  { repo: 'motu-review', slugs: ['all'], records: 12 },
  { repo: 'Scorbutics/motu-demo-app', slugs: ['all'], records: 1 },
  { repo: 'Scorbutics/motu-host-app', slugs: ['all'], records: 1 },
]

/**
 * THE SAME HOST, with somebody working on one of them.
 *
 * Its own fixture because liveness is a fact with a clock on it: it is true only while a
 * `motu lagoon serve --watch` is running on somebody's machine, so the state is unreachable by
 * looking at a host unless you happen to look during the minutes it holds. A scenario is the only
 * way anyone sees the badge, the ranking it causes in the palette, or what the row says underneath.
 */
export const REPOS_WITH_LIVE: LagoonRepo[] = REPOS.map((r) =>
  r.repo === 'Scorbutics/motu-host-app' ? { ...r, live: ['all'] } : r,
)

/** One repository, which is what the singular in "1 lagoon · 1 record" is for. */
export const ONE_REPO: LagoonRepo[] = [{ repo: 'Scorbutics/motu-host-app', slugs: ['all'], records: 1 }]

/**
 * WHAT A RESTRICTED VIEWER SEES, and the reason this island exists at all.
 *
 * Filtered UPSTREAM by `authorize` — the island is never told what was removed, and cannot be, which
 * is why "did the filter run" is not a question it can answer about itself. What it CAN do is render
 * this list, and a scenario pinning it is the only place the shape of a partly-filtered host is
 * addressable at all.
 */
export const FILTERED_REPOS: LagoonRepo[] = [
  { repo: 'motu-review', slugs: ['all'], records: 12 },
  { repo: 'Scorbutics/motu-demo-app', slugs: ['all'], records: 1 },
]

/** The host total from `/api/health` while this was written — 76.3 MB on the page. */
export const STATS = { blobs: 346, bytes: 80031207, maxRecords: 1000 }

/**
 * WHOEVER IS READING IT, in the reduced form the badge takes.
 *
 * The real handle rather than an invented one, like every other row in this file: the states a person
 * previews should be this host's, and `Scorbutics` is who signs into it.
 */
export const VIEWER = { handle: 'Scorbutics', initial: 'S' }

/** The host's per-repo record cap, which is what each row's fill is drawn against. */
export const CAP = 1000
