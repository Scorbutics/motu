// Declared FLOWS for the harbour — the dock example's outer region.
//
// Two views of the same island. In the region's own lane (the mountpoints view) the readout is one
// framed slot like any other. In the COMPOSED dock state (`dock: 'quay.quay-aside'`) it must render
// INSIDE the quay's dock — `in` asserts placement, read from the DOM — and keep answering THIS region's
// keys while it sits in the other region's arrangement.
import type { RegionScenario } from '@motujs/runtime/mock';
import { STATS, VIEWER } from '../../shared/index-evidence.js';

export const scenarios: RegionScenario[] = [
  {
    name: 'each slot renders its own island',
    seed: { stats: STATS, viewer: VIEWER },
    steps: [{ expectRender: { 'harbour-readout': 'OBJECTS 346' } }, { expectRender: { 'harbour-account': 'Scorbutics' } }],
  },
  {
    // THE DOCK. The readout is the harbour's island, placed in the quay's arrangement — and when the
    // harbour's own key moves, the island in the OTHER region's dock follows, because it is still
    // bound here. A docked island answering the quay's store, or stuck at its fallback, fails both.
    name: 'the readout docks beside the quay and keeps the harbour data',
    dock: 'quay.quay-aside',
    seed: { stats: STATS, viewer: VIEWER },
    steps: [
      { expectRender: { 'harbour-readout': { text: 'OBJECTS 346', in: 'quay.quay-aside' } } },
      {
        provide: { stats: { blobs: 12, bytes: 4096, maxRecords: 1000 } },
        expectRender: { 'harbour-readout': { text: 'OBJECTS 12', in: 'quay.quay-aside' } },
      },
    ],
  },
];
