// The review console region, for the lagoon: what the page establishes on first paint.
//
// A SEED AND NOTHING ELSE, now that `ReviewLayout` is the archipelago's `root`. This file used to
// carry a `ReviewRegionFrame` — a second copy of the page's JSX — and then a component the page also
// imported, which was better and still two calls. Declaring the root made it one, and the frame went
// away with the project around it.
import { overridesFor } from '@motu/react';
import type { LagoonOverrides } from '@motu/react';
import { reviewArchipelago } from '../../../../src/archipelagos/review/review.archipelago.js';
import { REPOS } from '../../../../src/shared/review-evidence.js';

export const reviewSeed: NonNullable<LagoonOverrides['seed']>[string] = {
  repos: REPOS,
  // A project IS selected on open, because a console that opens on nothing shows nothing. `shots` is
  // NOT seeded: the channel answers the selection, and a seeded list would sit in front of it — the
  // first paint would show one project's shots and never move again, which is the bug this fixes.
  selectedRepo: 'Scorbutics/peps_ta_boite_app',
  viewMode: 'last',
  busy: false,
  error: null,
};

export const reviewRegion = overridesFor(reviewArchipelago, { seed: reviewSeed });
