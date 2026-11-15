// The DOCK example's inner region — the quay: the repositories, with a place kept beside them.
//
// `aside: { dock: 'quay-aside' }` OPENS that place: a root prop of `QuayLayout` that motu fills with the
// island another region docks there (the harbour's readout). The page never passes it, and the island
// that lands in it is never counted as one of this region's.
import { archipelago } from '@motujs/core';
import type { ElementTypes } from '../../islands/registry';
import { QuayLayout } from '@/app/examples/dock/quay-layout';
import type { QuayRegion, ProducedQuayKeys } from '@/app/examples/dock/quay-region';

export const quayArchipelago = archipelago<QuayRegion, Pick<ElementTypes, 'x-lagoon-repos'>, ProducedQuayKeys>()(
  {
    id: 'quay',
    root: QuayLayout,
    slots: {
      repositories: { slot: 'quay-repos' },
      aside: { dock: 'quay-aside' },
    },
    islands: [{ slot: 'quay-repos', element: 'x-lagoon-repos', bind: [{ repos: 'repos', cap: 'cap' }, 'query'] }],
  } as const,
  { ownership: true, wiring: true, produced: true },
);
