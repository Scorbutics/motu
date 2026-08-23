// Lagoon overrides: what a JSON declaration cannot hold.
//
// Everything the lagoon DOES lives in @motu/react (`startLagoon`); everything it can be TOLD is in
// ../lagoon.config.json. This file is for the rest — functions and objects.
import type { LagoonOverrides } from '@motu/react';
import { channelFrom } from '@motu/core';
import { ReviewRegionFrame, reviewSeed } from './regions/review';
import { reviewArchipelago } from '../../../src/archipelagos/review/review.archipelago.js';
import { shotsFixturePort } from '../../../src/shared/review-evidence.js';

/** Initial store contents per archipelago id, so bound islands render on first paint. */
export const seed: LagoonOverrides['seed'] = {
  review: reviewSeed,
};

/**
 * What ANSWERS here, rather than merely sits here.
 *
 * The console's central promise is that picking a project changes what the shot list shows, and the
 * page performed it — so in the lagoon every project card after the seeded one was inert. Clicking
 * them did nothing, which reads as a broken console and was invisible to every check, because
 * `seed` is data and data does not react.
 *
 * This installs the page's OWN source over fixtures: the same `createShotsSource`, told through the
 * same declared `inputs`. It is a channel, so it is present in every view — the region view a human
 * opens AND the mountpoints view the flow checks drive.
 */
export const channels: LagoonOverrides['channels'] = {
  review: [
    channelFrom({
      to: reviewArchipelago,
      id: 'shots',
      channelName: 'review: the page’s shot fetch',
      args: [shotsFixturePort],
    }),
  ],
};

/** Where each region's islands sit — the page's own arrangement, never a second copy of it. */
export const layout: LagoonOverrides['layout'] = {
  review: (island) => <ReviewRegionFrame island={island} />,
};
