// Mount point for LagoonFilter: it wraps the application's OWN component rather than a copy, so the
// island cannot drift from what the app already ships.
import { islandElement } from '@motu/react';
import { LagoonFilter } from '@/components/lagoon/lagoon-filter';

export const element = islandElement({
  tag: 'x-lagoon-filter',
  component: LagoonFilter,
  options: {
    contract: {
      // WHAT IT IS TOLD: its own two decisions, read back. It is a controlled control — the region
      // holds the value, not the component, which is what lets a link or a flow set either one.
      input: ['query', 'show'],
      // WHAT IT DECIDES. The region reads these as `query` and `show` — see the archipelago's `writes`.
      output: { onQueryChange: 'query-changed', onShowChange: 'show-changed' },
      // Nothing ambient: it reaches for no host module. It never sees a list.
      ambient: [],
    },
  },
});
