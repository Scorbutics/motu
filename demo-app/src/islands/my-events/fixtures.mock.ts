// Lagoon scenarios for x-my-events: a guest, a member with nothing booked, a member going to several,
// and a cancellation on its way.
import type { Fixture, Scenario } from '@motu/runtime/mock';
import { UPCOMING, DENNIS, RICH, COASTAL_WALK, rsvpsOf } from '../../shared/events-evidence.js';

export const fixtures: Fixture[] = [];

export const scenarios: Scenario[] = [
  { name: 'a guest', seed: {} },
  { name: 'loading', seed: { events: [], myRsvps: [], me: DENNIS, eventsLoading: true } },
  { name: 'nothing booked', seed: { events: UPCOMING, myRsvps: [], me: RICH, eventsLoading: false } },
  { name: 'going to several', seed: { events: UPCOMING, myRsvps: rsvpsOf(DENNIS), me: DENNIS, eventsLoading: false } },
  { name: 'cancelling', seed: { events: UPCOMING, myRsvps: rsvpsOf(DENNIS), me: DENNIS, eventsLoading: false, rsvp: { pending: COASTAL_WALK.id, error: null } } },
];
