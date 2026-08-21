// The ONE motu module an application may import.
//
// The guarantee, stated precisely, because the package only makes sense if it can be:
//
//   Deleting motu leaves no runtime trace — the application ships byte-identical output. One
//   TYPE-ONLY package remains, which erases at compile time.
//
// That is why there is not a single value in this file. Not a helper, not a constant, not a `const
// enum`. The moment one appears the sentence above becomes false, the app has a runtime dependency on
// the framework, and `removal-check` is proving something weaker than it claims. If a helper is
// wanted, it belongs in `@motu/core`, which the app does not import.
//
// What earns a place here is the vocabulary an application needs to describe ITS OWN data. The test:
// "does the app need this word to say what it holds?" — `Source` passes, `Channel` does not. A channel
// is motu's construct for installing a source; a source is the app's own object, and typing it here is
// what moves an error from the archipelago (two files away) into the file with the mistake in it.

/**
 * A running source: what it holds, and how to watch it.
 *
 * `getState()` returns the region's OWN types — `Pick<TRegion, TKeys>`, not "an object with these
 * keys". A source that starts returning `receivedCount: string` fails in its own file rather than
 * rendering a lagoon that looks right and reads wrong.
 */
export interface SourceInstance<TRegion, TKeys extends keyof TRegion> {
  getState(): Pick<TRegion, TKeys>;
  subscribe(listener: () => void): () => void;
  /** Region keys this source consumes — the page and the lagoon both drive it through these. */
  inputs?: readonly (keyof TRegion & string)[];
  applyInputs?(values: Partial<TRegion>): void;
  /** Host intents it answers: an island asks, the page acts, this is the page's half. */
  intents?: Readonly<Record<string, (detail: unknown) => void>>;
  dispose?(): void;
}

/**
 * A source, as the region refers to it: what builds it, and which keys it feeds.
 *
 * Declared beside the source itself, in application code, and imported by the archipelago. Naming the
 * module and the export as STRINGS was the earlier shape, and it meant the same fact was written in
 * two files with a check to keep them agreeing — which is a symptom, not a safety property.
 */
export interface Source<TRegion, TKeys extends keyof TRegion, TArgs extends readonly unknown[] = readonly unknown[]> {
  create(...args: TArgs): SourceInstance<TRegion, TKeys>;
  /** The region keys it produces. Checked against the region type HERE, where the mistake is made. */
  produces: readonly TKeys[];
}

/**
 * What the page may still assign: the region minus the keys an island produces.
 *
 * The concept has a name in motu (`HostRegionOf`, derived from the archipelago), but naming it there
 * does not help the file that needs it — the page's own state literal. Written by hand it comes out as
 * `Omit<ActionsRegion, ProducedActionsKeys>`, which says HOW rather than WHAT, once per region.
 *
 * Using it is what makes a laundered value a compile error: the page cannot claim a key another island
 * produces, so it cannot pass one on to a third island behind the archipelago's back.
 */
export type HostRegion<TRegion, TProduced extends keyof TRegion> = Omit<TRegion, TProduced>;
