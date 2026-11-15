// Declared FLOWS for the quay — the dock example's inner region.
import type { RegionScenario } from '@motujs/runtime/mock';
import { REPOS, FILTERED_REPOS, CAP } from '../../shared/index-evidence.js';

export const scenarios: RegionScenario[] = [
  {
    name: 'the list shows what it was given',
    seed: { repos: REPOS, cap: CAP, query: '' },
    steps: [
      { expectRender: { 'quay-repos': 'twentyhq/twenty' } },
      { provide: { repos: FILTERED_REPOS }, expectRender: { 'quay-repos': 'motu-review' } },
    ],
  },
  {
    // FROM THE DOCK'S SIDE. The harbour's readout is mounted as a GUEST — from the harbour's config
    // and seed, still the harbour's island — and must land in this region's dock, and stay there while
    // this region's own list moves beside it.
    name: "the harbour's readout lands in the dock beside the list",
    dock: 'quay.quay-aside',
    seed: { repos: REPOS, cap: CAP, query: '' },
    steps: [
      { expectRender: { 'harbour-readout': { text: 'OBJECTS 346', in: 'quay.quay-aside' }, 'quay-repos': 'twentyhq/twenty' } },
      { provide: { repos: FILTERED_REPOS }, expectRender: { 'quay-repos': 'motu-review', 'harbour-readout': { in: 'quay.quay-aside' } } },
    ],
  },
];
