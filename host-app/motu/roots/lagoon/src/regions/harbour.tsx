// The dock example's outer region, for the lagoon: the host as it stands, read by the same evidence the
// front page uses. Its own address (`?region=harbour`) is the quay-ABSENT state: the quay is a
// placeholder and the readout renders in the bay. `?region=harbour&state=harbour.dock.quay.quay-aside`
// loads the quay in place and the readout lands in its dock.
import { overridesFor } from '@motujs/react';
import { harbourArchipelago } from '../../../../src/archipelagos/harbour/harbour.archipelago.js';
import { STATS, VIEWER } from '../../../../src/shared/index-evidence.js';

export const harbourRegion = overridesFor(harbourArchipelago, { seed: { stats: STATS, viewer: VIEWER } });
