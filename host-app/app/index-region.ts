// The front page's shared state, as a type.
//
// Belongs to the APPLICATION: no motu import, and it erases at runtime.
//
// EVERYTHING HERE IS HOST-FED. The server reads the store and filters it through `authorize`; neither
// island can change any of it. That is not a limitation to apologise for — it is what the page IS. A
// listing shows what you may see, and "what you may see" is decided somewhere no browser can reach.
/** Which kinds the page lists. Re-exported from the component that owns the control. */
import type { Viewer } from "@/src/auth/viewer"

export type LagoonRepo = {
  repo: string
  slugs: string[]
  records: number
  /**
   * The slugs somebody is serving LIVE right now, from a `motu lagoon serve --watch` on their machine.
   *
   * A FACT WITH A CLOCK ON IT, which makes it unlike everything else in this type. Every other value
   * here describes what the host holds; this one describes what a process somewhere is doing this
   * minute, and it stops being true when that process stops. It is read per request and never cached,
   * because a stale "live" is worse than no badge at all — it promises a page that updates and
   * delivers one that does not.
   *
   * Absent rather than empty when nothing is live, so a host that cannot reach the registry and a
   * host where nothing is running are the same answer: no badge.
   */
  live?: string[]
}

export type IndexRegion = {

  /** The repositories this viewer may see. Same rule: filtered upstream, never explained here. */
  repos: LagoonRepo[]

  /** What the host holds in total. Chrome, not a listing — it names no repository. */
  stats: { blobs: number; bytes: number; maxRecords: number }

  /**
   * The per-repo record cap, as its own key.
   *
   * It lives inside `stats` too, and it is declared separately because a DIFFERENT island needs it:
   * the repositories list draws each row's fill against it. Reaching into `stats` from there would
   * make one island depend on the shape of another's input — `props-match` caught the first attempt,
   * where `cap` was a prop nothing could ever set and every row silently used a hardcoded 1000.
   */
  cap: number

  /**
   * Whoever is reading this, or null for a visitor.
   *
   * HOST-FED, and read on the SERVER rather than fetched. The alternative — asking `/auth/whoami`
   * after hydration — renders the visitor state first and swaps, which on an identity badge means
   * every signed-in reader watches themselves appear to be signed out for a frame.
   *
   * It is the reduced form (`viewerFrom`), not the session: a handle and a letter. The email, the
   * provider id and the avatar URL stay on the server, so no browser bundle can render them by
   * accident and no page load of this host reaches GitHub for a picture.
   */
  viewer: Viewer | null

  /**
   * What the reader typed.
   *
   * ISLAND-OWNED. `lagoon-filter` writes it; both listing islands read it and narrow themselves. The
   * filter never sees a list and neither list knows the filter exists — that is the coupling this
   * region was drawn to declare, and it is the only one on the page.
   */
  query: string


  /**
   * Whether the ⌘K palette is showing.
   *
   * ISLAND-OWNED, by the palette, and a REGION key rather than the component's own `useState` for one
   * reason: it makes the palette an address. "Open, with `motu` typed" is a URL in the lagoon and a
   * seed in a flow, and neither is reachable for state a component keeps to itself. That is the same
   * argument `filter` makes in the corpus region, applied to a surface nobody can see by default.
   */
  paletteOpen: boolean

  /** What has been typed into the palette. Island-owned, by the same island, for the same reason. */
  paletteQuery: string
}

/**
 * `query`, and the palette's two.
 *
 * `ProducedKeysAre` in the archipelago makes it a compile error for this to drift from what the
 * islands actually declare in `writes`.
 */
export type ProducedIndexKeys = "query" | "paletteOpen" | "paletteQuery"
