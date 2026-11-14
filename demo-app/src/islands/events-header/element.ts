import { islandElement } from '@motujs/react';
import { EventsHeader } from '../../ui/events-header/EventsHeader.js';

export const element = islandElement({
  tag: 'x-events-header',
  component: EventsHeader,
  options: {
    // READS the calendar, your RSVPs, who you are and whether the calendar is still loading; OWNS NOTHING.
    contract: {
      input: ['events', 'myRsvps', 'me', 'eventsLoading'],
    },
    legacy: 'fill',
  },
});
