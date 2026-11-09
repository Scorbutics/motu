import { islandElement } from '@motu/react';
import { EventsHeader } from '../../ui/events-header/EventsHeader.js';

export const element = islandElement({
  tag: 'x-events-header',
  component: EventsHeader,
  options: {
    // READS the calendar, your RSVPs and who you are; OWNS NOTHING. A projection of three keys.
    contract: {
      input: ['events', 'myRsvps', 'me'],
    },
    legacy: 'fill',
  },
});
