// The front page's shared state, as a type.
//
// Belongs to the APPLICATION: no motu import, and it erases at runtime.
//
// EVERYTHING HERE IS HOST-FED. The server reads the store and filters it through `authorize`; neither
// island can change any of it. That is not a limitation to apologise for — it is what the page IS. A
// listing shows what you may see, and "what you may see" is decided somewhere no browser can reach.
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
}

/**
 * Nothing on this page is island-owned.
 *
 * Both islands only render. There is no control here yet, and when one arrives — a filter, a sort —
 * it will produce a key and this type is where that gets declared.
 */
export type ProducedIndexKeys = never
