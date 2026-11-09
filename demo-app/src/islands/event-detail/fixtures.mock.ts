// Lagoon scenarios for x-event-detail — every state the RSVP button can be in, each a real member and
// a real event from the seed: going, not going, full, refused for a suspended membership, on its way,
// and a guest. These are the states a person meets; the region's flows prove the source moves between
// them. No fixtures: it calls nothing.
import type { Fixture, Scenario } from '@motu/runtime/mock';
import { UPCOMING, DENNIS, RICH, KAREN, COASTAL_WALK, PORTFOLIO, BOARD_GAMES, BUDGETING, attendeesOf, rsvpsOf } from '../../shared/events-evidence.js';

export const fixtures: Fixture[] = [];

const open = (id: string) => ({ events: UPCOMING, selectedEventId: id, attendees: attendeesOf(id) });

export const scenarios: Scenario[] = [
  // An empty calendar renders this same prompt, so it is seeded here rather than as a duplicate state.
  { name: 'nothing picked', seed: { events: [], me: DENNIS, myRsvps: [] } },
  { name: 'going', seed: { ...open(COASTAL_WALK.id), me: DENNIS, myRsvps: rsvpsOf(DENNIS) } },
  { name: 'not going yet', seed: { ...open(BOARD_GAMES.id), me: RICH, myRsvps: rsvpsOf(RICH) } },
  { name: 'full', seed: { ...open(PORTFOLIO.id), me: RICH, myRsvps: rsvpsOf(RICH), rsvp: { pending: null, error: { eventId: PORTFOLIO.id, reason: 'full' } } } },
  { name: 'refused: suspended', seed: { ...open(BOARD_GAMES.id), me: KAREN, myRsvps: [], rsvp: { pending: null, error: { eventId: BOARD_GAMES.id, reason: 'suspended' } } } },
  { name: 'saving', seed: { ...open(BOARD_GAMES.id), me: RICH, myRsvps: [], rsvp: { pending: BOARD_GAMES.id, error: null } } },
  { name: 'nobody going yet', seed: { ...open(BUDGETING.id), me: DENNIS, myRsvps: rsvpsOf(DENNIS) } },
  { name: 'a guest', seed: { ...open(BOARD_GAMES.id), me: null, myRsvps: [] } },
];
