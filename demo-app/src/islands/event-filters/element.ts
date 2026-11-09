import { islandElement } from '@motu/react';
import { EventFilters } from '../../ui/event-filters/EventFilters.js';

export const element = islandElement({
  tag: 'x-event-filters',
  component: EventFilters,
  options: {
    // OWNS `filter` (declared in the archipelago's `writes`). Reads the calendar only to count it.
    contract: {
      input: ['filter', 'events', 'me'],
      output: { onFilterChange: 'filter-changed' },
    },
    legacy: 'fill',
  },
});
