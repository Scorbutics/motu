// Lagoon EVIDENCE for lagoon-stats — the bay's readout.
//
// `0 objects · 0 kB` is a REAL state and an IMPOSSIBLE one, depending on what is beside it. On a host
// with nothing published it is exactly right; above a list of five repositories it is a number
// `store.stats()` cannot produce. That is why the readout needed to be seedable: unreachable from the
// region, it defaulted to zeros and rendered the impossible version.
import type { Scenario } from '@motu/runtime/mock';
import { STATS } from '../shared/index-evidence.js';

export const fixtures = [];
export const roles: string[] = [];

export const scenarios: Scenario[] = [
  // NOT HERE: "the host has not been asked" (`stats: null`). The readout renders NOTHING then, on
  // purpose — not asked yet is not the same as holds nothing — and `data-flow` cannot compare a blank
  // render against the others: "if its empty state is deliberate, that scenario does not belong here".
  // It sank `motu check --runtime` on every push from 5 Nov until it was taken out. The behaviour is
  // still the component's; it is just not evidence of data flowing.
  {
    // A genuinely empty host, where zero IS the answer. Paired with `a host with nothing published`
    // on the repositories island: together they are the screen somebody sees on day one.
    name: 'a host holding nothing',
    seed: { stats: { blobs: 0, bytes: 0, maxRecords: 1000 } },
  },
  {
    name: 'the host as it stands',
    seed: { stats: STATS },
  },
  {
    // The singular, and the kB branch of `size()` — the host's own formatter switches at a megabyte,
    // and everything above only ever exercised the MB side.
    name: 'one object, measured in kB',
    seed: { stats: { blobs: 1, bytes: 4096, maxRecords: 1000 } },
  },
];
