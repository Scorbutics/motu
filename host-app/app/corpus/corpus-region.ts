// The corpus region's shared state, as a type.
//
// Belongs to the APPLICATION: no motu import, and it erases at runtime. Same rule as
// `app/signin/signin-region.ts` — the region's vocabulary is the app's to name.
//
// THIS REGION IS THE STAGE-1 EXAMPLE (see docs/06-composition-and-adoption.md). It is composed with
// `<Corpus.Island>` inside the page's own JSX and has NO `root` on its archipelago. Compare with
// `signin`, which is the same host, the same framework and the stage-2 shape.

/** One recorded state, flattened for the screen. `fingerprint` stays motu's; everything else is ours. */
export type CorpusState = {
  /** `fingerprintId(entry.fingerprint)` — the identity the corpus counts by and `known()` returns. */
  id: string
  /** Every declared key and what it held, as motu's fingerprinter categorised it. */
  fingerprint: Record<string, string>
  /** How many times production reached this state. */
  count: number
  /** Share of the corpus, 0..1. Precomputed by the page: the islands rank by it and must agree. */
  share: number
  /** Somebody decided this state is known. `known()` is the source; the island only shows it. */
  accepted: boolean
}

export type CorpusRegion = {
  /**
   * The recorded states, already ranked by share.
   *
   * HOST-FED. The page reads them from `@/src/coverage/store` on the server — the corpus is the
   * host's own table, and no island can or should fetch it.
   */
  states: CorpusState[]

  /**
   * Which states the reader is looking at.
   *
   * ISLAND-OWNED, and the only produced key this region has. `corpus-filter` writes it and
   * `corpus-states` reads it, which is the whole coupling: one island narrows what another shows,
   * and neither knows the other exists.
   */
  filter: CorpusFilter

  /**
   * How many states nobody has accepted yet.
   *
   * HOST-FED, and DERIVED from `states` — which is exactly why it is a region key rather than
   * something the filter island counts for itself. The page already has the list; two components
   * counting it independently is how the number under the button stops matching the list beside it.
   */
  unacceptedCount: number

  /**
   * The region the corpus is about, for the heading the states island prints when there are none.
   *
   * HOST-FED, and here for the empty state rather than the full one: "no states recorded for
   * `signin`" is a different sentence from "no states recorded", and only one of them tells the
   * reader whether they are looking at the wrong region.
   */
  regionId: string
}

/** All of them, or only what nobody has accepted yet. */
export type CorpusFilter = 'all' | 'unaccepted'

/**
 * `filter` and nothing else.
 *
 * `ProducedKeysAre` in the archipelago makes it a compile error for this to drift from what the
 * islands actually declare in `writes`.
 */
export type ProducedCorpusKeys = 'filter'
