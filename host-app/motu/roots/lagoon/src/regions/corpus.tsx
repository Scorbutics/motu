// The corpus region, for the lagoon — AND THE STAGE-1 FRAME, which is what this file is here to show.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// A FRAME IS THE SECOND HALF OF STAGE-1 COMPOSITION.
//
// `corpus` declares no `root`, so the page composes it with `<Corpus.Island>` in its own JSX — and
// the lagoon cannot import a Next route module to find out what that JSX was. This frame is how the
// lagoon is told where the islands go instead.
//
// WHAT A FRAME MAY HOLD: the application's own components, fragments, and `island(slot)`. Nothing
// else. `region-root` errors on an intrinsic element (`<div>`) or a literal string, because a frame
// that draws its own version of the page is a drawing of the page and drifts from it — this host's
// own `/signin` shipped a lagoon reading "On récupère ton accès" over a page that said something
// else, green, for weeks.
//
// So this frame is a FRAGMENT and two islands. It is honest and it is thin, and the thinness is the
// cost of stage 1: the heading, the summary line and the section chrome in `corpus-screen.tsx` are
// the page's own and appear nowhere below. Somebody previewing this region sees the two islands, not
// the page.
//
// STAGE 2 IS THE ANSWER TO THAT, and `signin.tsx` beside this file is what it looks like: the
// archipelago names `SigninLayout` as its `root`, the page and the lagoon render THAT component from
// the same `slots` map, and this file becomes data rather than arrangement. Take that step for this
// region when somebody is next editing `corpus-screen.tsx` — see docs/06-composition-and-adoption.md.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
import type { ReactNode } from 'react';
import { overridesFor } from '@motu/react';
import type { LagoonOverrides } from '@motu/react';
import { corpusArchipelago } from '../../../../src/archipelagos/corpus/corpus.archipelago.js';
import {
  CORPUS_REGION_ID,
  CORPUS_STATES,
  CORPUS_UNACCEPTED,
} from '../../../../src/shared/corpus-evidence.js';

/**
 * What the PAGE establishes on first paint.
 *
 * `filter` is NOT seeded, and the omission is deliberate: it is the region's one produced key, so
 * seeding it here would be the lagoon establishing a value its owner is meant to decide. The island
 * renders from its own declared default, which is the rule an island has to satisfy anyway.
 */
export const corpusSeed: NonNullable<LagoonOverrides['seed']>[string] = {
  states: CORPUS_STATES,
  unacceptedCount: CORPUS_UNACCEPTED,
  regionId: CORPUS_REGION_ID,
};

/** Where the islands sit, for a region whose page keeps its own arrangement. */
export function CorpusRegionFrame({ island }: { island: (slot: string) => ReactNode }) {
  return (
    <>
      {island('corpus-filter')}
      {island('corpus-states')}
    </>
  );
}

/** Everything the lagoon is told about `corpus`, in one place. */
export const corpusRegion = overridesFor(corpusArchipelago, {
  seed: corpusSeed,
  layout: CorpusRegionFrame,
});
