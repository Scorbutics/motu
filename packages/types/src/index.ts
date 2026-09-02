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
/**
 * ONE THING AN ISLAND OR A SOURCE REACHES that was not handed to it.
 *
 * A bare STRING is a host module specifier — the common case, and the one that needs no kind because
 * a module is what an unqualified name has always meant. Everything else is an OBJECT whose single
 * discriminating key names the kind.
 *
 * These were prefixed strings (`'scope:search'`, `'table:shots(select)'`), which read compactly and
 * were the wrong shape for the same reason the contract's own keys were: `'scpoe:search'` is a valid
 * string and silently becomes an entry nothing recognises, while `{ scpoe: 'search' }` is a build
 * error. This whole area exists because a mistyped declaration used to compile and mean nothing; a
 * kind system that only a regex enforces would have reintroduced that one level down.
 *
 * Lives here, in the type-only package, because an application writes these on its own `Source` — and
 * this package still contains no values, so it erases with everything else in it.
 */
export type EffectEntry =
  | string
  | { readonly scope: string }
  | { readonly table: string; readonly operation?: TableOperation }
  | { readonly rpc: string }
  | { readonly fn: string }
  | { readonly route: string; readonly method?: HttpMethod };

/** What a table access does. Closed, because the wire fake resolves exactly these five. */
export type TableOperation = 'select' | 'insert' | 'update' | 'delete' | 'upsert';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface Source<TRegion, TKeys extends keyof TRegion, TArgs extends readonly unknown[] = readonly unknown[]> {
  create(...args: TArgs): SourceInstance<TRegion, TKeys>;
  /** The region keys it produces. Checked against the region type HERE, where the mistake is made. */
  produces: readonly TKeys[];
  /**
   * The backend it touches — `{ table: 'shots', operation: 'select' }`, `{ rpc: 'accept' }`, and so on.
   *
   * The same list an island that reaches a backend DIRECTLY puts in its own `contract.ambient`: one
   * concept, declared wherever the reaching actually happens. It belongs to the SOURCE rather than to
   * the islands that bind its keys, because a source reads inside a channel, at region level and
   * outside any island's attribution window — charging its tables to whichever island was rendering
   * would report a correct declaration as a violation.
   *
   * Optional, and checked only when present: `data-reach` warns both ways for a source that declares
   * one, and says nothing about a source that does not, so adopting this is not the same as failing it.
   */
  reaches?: readonly EffectEntry[];
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
