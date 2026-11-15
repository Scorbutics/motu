// The DOCK example's outer region (`/examples/dock`) — the harbour.
//
// It places the quay (`quay: { region: 'quay' }`), a region of its own, and DOCKS its readout in the
// quay's arrangement: `readout: { slot, dockInto: { region: 'quay', dock: 'quay-aside' } }`. The readout
// stays THIS region's island in every sense — it binds `stats` from here, the ownership guard counts it
// here, and its flows are here — and only its DOM lands in the quay's dock. When the quay is not on
// screen it renders where `HarbourLayout` places `readout`: in the bay. See docs/proposals/docks.md.
import { archipelago } from '@motujs/core';
import type { ElementTypes } from '../../islands/registry';
import { HarbourLayout } from '@/app/examples/dock/harbour-layout';
import type { HarbourRegion, ProducedHarbourKeys } from '@/app/examples/dock/harbour-region';

export const harbourArchipelago = archipelago<HarbourRegion, Pick<ElementTypes, 'x-lagoon-stats' | 'x-viewer-badge'>, ProducedHarbourKeys>()(
  {
    id: 'harbour',
    root: HarbourLayout,
    slots: {
      // DOCKED beside the quay's list; in the bay when there is no quay.
      readout: { slot: 'harbour-readout', dockInto: { region: 'quay', dock: 'quay-aside' } },
      account: { slot: 'harbour-account' },
      // A region of its own, placed here — the composition the dock follows.
      quay: { region: 'quay' },
    },
    islands: [
      { slot: 'harbour-readout', element: 'x-lagoon-stats', bind: [{ stats: 'stats' }] },
      { slot: 'harbour-account', element: 'x-viewer-badge', bind: [{ viewer: 'viewer' }] },
    ],
  } as const,
  { ownership: true, wiring: true, produced: true },
);
