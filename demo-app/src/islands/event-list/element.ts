import { islandElement } from '@motujs/react';
import { EventList } from '../../ui/event-list/EventList.js';

export const element = islandElement({
  tag: 'x-event-list',
  component: EventList,
  options: {
    // OWNS `selectedEventId`. Everything else it reads is the source's or another island's.
    contract: {
      input: ['events', 'filter', 'me', 'myRsvps', 'selectedEventId', 'eventsLoading'],
      output: { onSelect: 'event-selected' },
    },
    legacy: 'fill',
  },
});
