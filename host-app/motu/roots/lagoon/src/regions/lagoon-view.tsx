// The lagoon VIEW region, for the lagoon — the dock, looked at through the thing it is a dock for.
//
// A MAP, not a page: `hostProps` carries the arrangement's own plain props and `seed` carries the
// region's keys. The two are different seams and getting them backwards renders nothing with no
// error — `seed` fills the STORE (what an island reads via `bind`), `hostProps` is handed to the
// ROOT directly.
//
// NO FRAME HERE. The page's root takes the artifact as a prop, and there is no artifact to frame in
// a lagoon — the region under test IS the dock, not the thing it docks against. Left out rather than
// stubbed with an empty box: an invented frame would be a third description of a screen nobody
// diffs, and the two lists are what this region actually promises.
import { overridesFor } from '@motu/react';
import type { LagoonOverrides } from '@motu/react';
import { lagoonViewArchipelago } from '../../../../src/archipelagos/lagoon-view/lagoon-view.archipelago.js';
import { STATIONS, REVIEW_STATES } from '../../../../src/shared/lagoon-view-evidence.js';

/** What the page establishes: the catalogue, and where the reader currently is. */
export const lagoonViewSeed: NonNullable<LagoonOverrides['seed']>[string] = {
  regions: STATIONS,
  states: REVIEW_STATES,
  region: 'review',
  flow: null,
};

export const lagoonViewRegion = overridesFor(lagoonViewArchipelago, {
  seed: lagoonViewSeed,
  // THE STRIP DRAWS AS A STRIP. `compact` is not a region key — it is which of the two arrangements
  // a placement uses — so it travels as the slot's own prop. Without it both placements previewed as
  // the same column and the phone bar's rendering was unreachable in the lagoon.
  props: { statesStrip: { compact: true } },
  hostProps: {
    title: 'Scorbutics/motu-host-app',
    subtitle: 'latest · all',
  },
});
