// The index region, for the lagoon: what the page establishes on first paint.
import { overridesFor } from '@motu/react';
import type { LagoonOverrides } from '@motu/react';
import { indexArchipelago } from '../../../../src/archipelagos/index/index.archipelago.js';
import { REPOS, STATS, CAP } from '../../../../src/shared/index-evidence.js';

/**
 * Seeded to the host AS IT STANDS rather than to the empty state.
 *
 * The opposite choice from `signin`, and for the opposite reason: that region exists for the screen
 * somebody sees when something went wrong, so it opens there. This one exists for the ordinary
 * arrival, and the empty host is one scenario away with its own address.
 */
export const indexSeed: NonNullable<LagoonOverrides['seed']>[string] = {
  repos: REPOS,
  stats: STATS,
  cap: CAP,
};

export const indexRegion = overridesFor(indexArchipelago, { seed: indexSeed });
