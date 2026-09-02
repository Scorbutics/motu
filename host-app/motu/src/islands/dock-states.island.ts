// Mount point for DockStates — the panel's list and the phone bar's strip, which are one island in
// two slots rather than two islands claiming `flow`.
import { islandElement } from '@motu/react';
import { DockStates } from '@/components/lagoon/dock-states';

export const element = islandElement({
  tag: 'x-dock-states',
  component: DockStates,
  options: {
    contract: {
      // `compact` is NOT a region key — it is which of the two arrangements this placement draws, so
      // it comes from the slot's own props rather than from state everyone shares.
      input: ['states', 'flow'],
      output: { onFlowChange: 'flow-changed' },
      effects: [],
    },
  },
});
