// Mount point for CorpusFilter: it wraps the application's OWN component rather than a copy, so the
// island cannot drift from what the app already ships.
import { islandElement } from '@motu/react';
import { CorpusFilter } from '@/components/corpus/corpus-filter';

export const element = islandElement({
  tag: 'x-corpus-filter',
  component: CorpusFilter,
  options: {
    contract: {
      // WHAT IT IS TOLD. `unacceptedCount` comes in rather than being derived here: the states island
      // already computes what it shows, and two components counting the same list independently is
      // how the number under the button stops matching the list beside it.
      input: ['value', 'unacceptedCount'],
      // WHAT IT DECIDES. The region reads this as `filter` — see the archipelago's `writes`.
      output: { onFilterChange: 'filter-changed' },
      // Nothing ambient: it reaches for no host module. The corpus is read on the server.
      ambient: [],
    },
  },
});
