// Mount point for CorpusStates — the application's own component, wrapped, not copied.
import { islandElement } from '@motu/react';
import { CorpusStates } from '@/components/corpus/corpus-states';

export const element = islandElement({
  tag: 'x-corpus-states',
  component: CorpusStates,
  options: {
    contract: {
      // ALL THREE COME FROM THE REGION, and one of them from another island: `filter` is
      // `corpus-filter`'s output. That is the coupling this region exists to declare — without it,
      // the page would have to hold the filter in a `useState` and thread it across, which is the
      // laundering the ownership rules exist to stop.
      input: ['states', 'filter', 'regionId'],
      // It shows; it does not act. Accepting a state takes the admin token and is not this control's.
      output: {},
      ambient: [],
    },
  },
});
