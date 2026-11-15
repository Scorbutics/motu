// The dock example's inner region, for the lagoon. Alone (`?region=quay`) its dock is an empty place;
// `?region=quay&state=quay.dock.quay.quay-aside` mounts the harbour's readout there as a guest.
import { overridesFor } from '@motujs/react';
import { quayArchipelago } from '../../../../src/archipelagos/quay/quay.archipelago.js';
import { REPOS, CAP } from '../../../../src/shared/index-evidence.js';

export const quayRegion = overridesFor(quayArchipelago, { seed: { repos: REPOS, cap: CAP, query: '' } });
