import { islandElement } from '@motu/react';
import { MyEvents } from '../../ui/my-events/MyEvents.js';

export const element = islandElement({
  tag: 'x-my-events',
  component: MyEvents,
  options: {
    // OWNS NOTHING. Cancelling is the same `event-rsvp` intent the events page sends.
    contract: {
      input: ['events', 'myRsvps', 'me', 'rsvp', 'eventsLoading'],
      output: { onRsvp: 'event-rsvp', onBrowse: 'events-browse' },
    },
    legacy: 'fill',
  },
});
