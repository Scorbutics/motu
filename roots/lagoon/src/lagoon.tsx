// Lagoon overrides: what a JSON declaration cannot hold.
//
// Everything the lagoon DOES lives in @motu/react (`startLagoon`); everything it can be TOLD is in
// ../lagoon.config.json. This file is for the rest — functions and objects.
import type { LagoonOverrides } from '@motu/react';
import { ReviewRegionFrame, reviewSeed } from './regions/review';

/** Initial store contents per archipelago id, so bound islands render on first paint. */
export const seed: LagoonOverrides['seed'] = {
  review: reviewSeed,
};

/** Where each region's islands sit — the page's own arrangement, never a second copy of it. */
export const layout: LagoonOverrides['layout'] = {
  review: (island) => <ReviewRegionFrame island={island} />,
};
