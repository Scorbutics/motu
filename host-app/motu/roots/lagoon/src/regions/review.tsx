// The review console region, for the lagoon: what the page establishes on first paint.
//
// A SEED AND NOTHING ELSE, now that `ReviewLayout` is the archipelago's `root`. This file used to
// carry a `ReviewRegionFrame` — a second copy of the page's JSX — and then a component the page also
// imported, which was better and still two calls. Declaring the root made it one, and the frame went
// away with the project around it.
import { overridesFor } from '@motu/react';
import type { LagoonOverrides } from '@motu/react';
import { channelFrom } from '@motu/core';
import { reviewArchipelago } from '../../../../src/archipelagos/review/review.archipelago.js';
import { REPOS, shotsFixturePort } from '../../../../src/shared/review-evidence.js';

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

/**
 * THE PAGE'S OWN SOURCE, over fixtures.
 *
 * `createShotsSource` runs here exactly as it does in the console — same timeout, same generation
 * guard, same error mapping — and what is swapped is the PORT. A channel rather than a seed, because
 * it must ANSWER: the shot list is fetched when a project is picked, and a seeded array would sit in
 * front of that and never move.
 *
 * LOST IN THE FOLD, and the region said so within the hour: this lived in the review console's own
 * lagoon root, which was deleted with the project around it. `region-flow` failed with the shot list
 * rendering LOAD-ERROR — the source was real, the port was missing, and it reported the failure it
 * actually had. Worth keeping as the reason a region's flows are worth running after a move.
 */
export const reviewRegion = overridesFor(reviewArchipelago, {
  seed: reviewSeed,
  channels: [
    channelFrom({
      to: reviewArchipelago,
      id: 'shots',
      channelName: 'review: the page’s shot fetch',
      args: [shotsFixturePort],
    }),
  ],
});
