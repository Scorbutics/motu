// Lagoon scenarios for x-event-list: loading, the whole calendar, one member's chapter with their
// RSVPs marked, and a filter that matches nothing. No fixtures: it calls nothing.
import type { Fixture, Scenario } from '@motujs/runtime/mock';
import { UPCOMING, DENNIS, COASTAL_WALK, rsvpsOf } from '../../shared/events-evidence.js';

export const fixtures: Fixture[] = [];

export const scenarios: Scenario[] = [
  { name: 'nothing yet', seed: {} },
  { name: 'loading', seed: { eventsLoading: true, events: [] } },
  { name: 'the whole calendar', seed: { events: UPCOMING, me: null, myRsvps: [], eventsLoading: false } },
  {
    name: 'a member on their chapter, going to some',
    seed: { events: UPCOMING, me: DENNIS, myRsvps: rsvpsOf(DENNIS), filter: { scope: 'mine', kind: null }, selectedEventId: COASTAL_WALK.id, eventsLoading: false },
  },
  { name: 'nothing matches', seed: { events: UPCOMING, me: null, filter: { scope: 'club', kind: 'talk' }, eventsLoading: false } },
];
