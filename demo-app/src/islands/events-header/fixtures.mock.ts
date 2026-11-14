// Lagoon scenarios for x-events-header. The calendar and the members are the seed's on the evidence
// day (`shared/events-evidence.ts`); nothing here is typed by hand. No fixtures: it calls nothing.
import type { Fixture, Scenario } from '@motujs/runtime/mock';
import { UPCOMING, DENNIS, RICH, rsvpsOf } from '../../shared/events-evidence.js';

export const fixtures: Fixture[] = [];

export const scenarios: Scenario[] = [
  { name: 'before the calendar arrives', seed: {} },
  { name: 'a member going to several', seed: { events: UPCOMING, myRsvps: rsvpsOf(DENNIS), me: DENNIS } },
  { name: 'a member with nothing booked', seed: { events: UPCOMING, myRsvps: [], me: RICH } },
  { name: 'a guest', seed: { events: UPCOMING, myRsvps: [], me: null } },
  { name: 'a member, and nothing planned', seed: { events: [], myRsvps: [], me: DENNIS } },
  // While the calendar loads, the header does not claim a member booked nothing (found in the lagoon's
  // `slow-backend` world: it used to say « nothing booked yet » to someone going to four events).
  { name: 'a member, while the calendar loads', seed: { events: [], myRsvps: [], me: DENNIS, eventsLoading: true } },
];
