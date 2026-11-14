import { islandElement } from '@motujs/react';
import { EventDetail } from '../../ui/event-detail/EventDetail.js';

export const element = islandElement({
  tag: 'x-event-detail',
  component: EventDetail,
  options: {
    // OWNS NOTHING. Its RSVP is an INTENT the events source answers — whether you are going is the
    // backend's answer, so the button asks and the keys come back from the source.
    contract: {
      input: ['events', 'selectedEventId', 'me', 'myRsvps', 'rsvp', 'attendees'],
      output: { onRsvp: 'event-rsvp', onOpenMember: 'member-open' },
    },
    legacy: 'fill',
  },
});
