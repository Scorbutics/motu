// The front page's shared state, as a type.
//
// Belongs to the APPLICATION: no motu import, and it erases at runtime.
//
// EVERYTHING HERE IS HOST-FED. The server reads the store and filters it through `authorize`; neither
// island can change any of it. That is not a limitation to apologise for — it is what the page IS. A
// listing shows what you may see, and "what you may see" is decided somewhere no browser can reach.
/** Which kinds the page lists. Re-exported from the component that owns the control. */
export type { LagoonShow } from "@/components/lagoon/lagoon-filter"
import type { LagoonShow } from "@/components/lagoon/lagoon-filter"

export type LagoonGroup = {
  name: string
  members: Array<{ repo: string }>
}

export type LagoonRepo = {
  repo: string
  slugs: string[]
  records: number
}

export type IndexRegion = {
  /**
   * The composed galleries, already filtered.
   *
   * FILTERED BEFORE IT ARRIVES, and the island is never told what was removed. A group whose members
   * were all filtered out is dropped upstream rather than passed here empty, because "a gallery you
   * may not see" is itself the fact being withheld — server.mjs learned that and the note survives in
   * the route that feeds this key.
   */
  groups: LagoonGroup[]

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
   * What the reader typed.
   *
   * ISLAND-OWNED. `lagoon-filter` writes it; both listing islands read it and narrow themselves. The
   * filter never sees a list and neither list knows the filter exists — that is the coupling this
   * region was drawn to declare, and it is the only one on the page.
   */
  query: string

  /**
   * Which kinds are listed.
   *
   * ISLAND-OWNED, by the same island. Two keys rather than one object, because they move
   * independently: typing does not reset the segment, and choosing a segment does not clear the
   * query. A single `{ query, show }` key would make every change to either a write of both, and the
   * lens could no longer show which one actually moved.
   */
  show: LagoonShow

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
 * `query` and `show`.
 *
 * `ProducedKeysAre` in the archipelago makes it a compile error for this to drift from what the
 * islands actually declare in `writes`.
 */
export type ProducedIndexKeys = "query" | "show" | "paletteOpen" | "paletteQuery"
