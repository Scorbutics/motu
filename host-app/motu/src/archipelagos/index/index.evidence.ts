// Declared FLOWS for the index region — what this page promises, as something that runs.
//
// NOTHING HERE FLOWS BETWEEN ISLANDS: both only render, and the region has no produced key. So every
// step is an assertion on what an island SHOWS, which is the only honest kind available — and the one
// that catches a slot wired to its neighbour's data, which no static check can see.
import type { RegionScenario } from '@motu/runtime/mock';
import { REPOS, GROUPS, FILTERED_REPOS, STATS } from '../../shared/index-evidence.js';

export const scenarios: RegionScenario[] = [
  {
    // Each slot renders ITS OWN island. Two lists of repository names side by side is exactly the
    // shape where a crossed wire renders perfectly and means the wrong thing.
    name: 'each card is its own card',
    seed: { groups: GROUPS, repos: REPOS, stats: STATS },
    steps: [
      { expectRender: { composed: 'product' } },
      { expectRender: { repositories: 'twentyhq/twenty' } },
      // THE BAY'S READOUT IS ASSERTED TOO, because it was the one thing on this screen nothing
      // looked at — and the number it rendered was one the host cannot produce.
      { expectRender: { readout: '346 objects' } },
    ],
  },
  {
    // THE PROMISE THIS REGION EXISTS FOR: what the page shows is what the viewer was given, and
    // nothing else. A repository filtered out upstream must not appear — and `provide` moving the
    // list is a real stimulus, so the assertion depends on what the step did.
    name: 'a filtered list shows only what it was given',
    seed: { groups: [], repos: REPOS, stats: STATS },
    steps: [
      { expectRender: { repositories: 'Scorbutics/peps_ta_boite_app' } },
      {
        provide: { repos: FILTERED_REPOS },
        // It renders what it now has…
        expectRender: { repositories: 'motu-review' },
      },
    ],
  },
];
