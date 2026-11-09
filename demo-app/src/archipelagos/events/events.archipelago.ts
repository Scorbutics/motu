// The events page: the club's calendar, the filters over it, one event in detail, and the RSVP.
//
// THE STATE MODEL, and who owns what:
//
//   me               HOST-FED. The app's session — who is acting. Read by every island and by the source.
//   filter           PRODUCED by `event-filters`. Read by the list (and the filters, for their counts).
//   selectedEventId  PRODUCED by `event-list`. Read by the detail panel, and by the source, which loads
//                    that event's attendees.
//   events, myRsvps, rsvp, attendees, eventsLoading
//                    PRODUCED by the `events` SOURCE (`shared/events-source.ts`) — the application's own
//                    object, which the page installs over Postgres and the lagoon installs over the seed.
//
// THE COUPLING THIS REGION EXISTS TO HOLD: pressing RSVP in the detail panel changes what the LIST
// marks, what the HEADER counts and who the panel shows going — three islands, none of which talks to
// another. The button does not write any of it. It asks (`event-rsvp`, an intent), the source asks the
// backend, and every island reads the answer. A full event, a suspended member and a started event
// are refused by the database, and the refusal arrives the same way.
import { archipelago } from '@motu/core';
import type { ElementTypes } from '../../islands/registry.js';
import type { EventsRegion, ProducedEventsKeys } from './events.region.js';
import { eventsSource } from '../../shared/events-source.js';
import { EVENTS_LAYOUT } from './events.layout.js';

export const eventsArchipelago = archipelago<EventsRegion, ElementTypes, ProducedEventsKeys>()(
  {
    id: 'events',
    layout: EVENTS_LAYOUT,
    islands: [
      { slot: 'events-header', element: 'x-events-header', bind: ['events', 'myRsvps', 'me'] },
      {
        slot: 'event-filters',
        element: 'x-event-filters',
        bind: ['filter', 'events', 'me'],
        writes: { 'filter-changed': 'filter' },
      },
      {
        slot: 'event-list',
        element: 'x-event-list',
        bind: ['events', 'filter', 'me', 'myRsvps', 'selectedEventId', 'eventsLoading'],
        writes: { 'event-selected': 'selectedEventId' },
      },
      {
        slot: 'event-detail',
        element: 'x-event-detail',
        bind: ['events', 'selectedEventId', 'me', 'myRsvps', 'rsvp', 'attendees'],
        // ASKS, DOES NOT WRITE. Answered by the `events` source in the page and in the lagoon alike.
        intents: { 'event-rsvp': 'event-rsvp' },
        on: { 'member-open': (id, { host }) => host.navigate('/member/' + encodeURIComponent(String(id))) },
      },
    ],
    sources: { events: eventsSource },
  } as const,
  { ownership: true, wiring: true, produced: true },
);
