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

/**
 * What the PAGE passes on the island element, as the lagoon's stand-in.
 *
 * `shotUrl` is not region state — where the host lives is the page's business — so no bind declares
 * it, and the lagoon had no way to supply it. The diff viewer therefore rendered `<img src="">` here
 * while every check passed, including a flow asserting its heading. A reviewer approving that shot
 * was approving a blank frame.
 *
 * A STAND-IN, deliberately: an inline SVG, so the lagoon reaches no host and the picture is obviously
 * a fixture rather than something that might be a real baseline.
 */
export const props: LagoonOverrides['props'] = {
  review: {
    'diff-viewer': {
      shotUrl: (hash: string) =>
        'data:image/svg+xml;utf8,' +
        encodeURIComponent(
          `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360">` +
            `<rect width="100%" height="100%" fill="#e6efee"/>` +
            `<text x="50%" y="48%" text-anchor="middle" font-family="monospace" font-size="20" fill="#0f3f3a">fixture shot</text>` +
            `<text x="50%" y="60%" text-anchor="middle" font-family="monospace" font-size="14" fill="#4a7c76">${hash}</text>` +
            `</svg>`,
        ),
    },
  },
};

/** Where each region's islands sit — the page's own arrangement, never a second copy of it. */
export const layout: LagoonOverrides['layout'] = {
  review: (island) => <ReviewRegionFrame island={island} />,
};
