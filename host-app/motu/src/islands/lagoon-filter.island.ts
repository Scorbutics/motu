// Mount point for LagoonFilter: it wraps the application's OWN component rather than a copy, so the
// island cannot drift from what the app already ships.
import { islandElement } from '@motu/react';
import { LagoonFilter } from '@/components/lagoon/lagoon-filter';

export const element = islandElement({
  tag: 'x-lagoon-filter',
  component: LagoonFilter,
  options: {
    contract: {
      // WHAT IT IS TOLD: its own decision, read back. It is a controlled control — the region holds
      // the value, not the component, which is what lets a link or a flow set it.
      input: ['query'],
      // WHAT IT DECIDES. The region reads it as `query` — see the archipelago's `writes`.
      output: { onQueryChange: 'query-changed' },
      // Nothing ambient: it reaches for no host module. It never sees a list.
      ambient: [],
    },
  },
});
