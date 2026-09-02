// Mount point for DockRegions: the application's OWN component, so the island cannot drift from what
// the page ships.
import { islandElement } from '@motu/react';
import { DockRegions } from '@/components/lagoon/dock-regions';

export const element = islandElement({
  tag: 'x-dock-regions',
  component: DockRegions,
  options: {
    contract: {
      // WHAT IT IS TOLD: the catalogue, and which region is framed. Both held by the region — a
      // controlled control, which is what lets an address or a flow put it anywhere.
      input: ['regions', 'region'],
      // WHAT IT DECIDES. The region reads it as `region` — see the archipelago's `writes`.
      output: { onRegionChange: 'region-changed' },
      // Nothing ambient: it reaches for no host module, and never touches the framed artifact.
      effects: [],
    },
  },
});
