// Declared FLOWS for the events region — the RSVP coupling, as something that runs.
//
// THE SOURCE IS REAL HERE. The lagoon installs the app's own `eventsSource` over the seed port
// (pinned to the evidence morning), so these flows drive the same pending/refusal/refetch logic the
// page runs; only the port is the stand-in. The seeds hold no source key, so every number asserted
// below is one the source fetched.
//
// EVERY ASSERTION IS ON AN ISLAND OTHER THAN THE ONE DRIVEN. Pressing RSVP in the detail panel is
// asserted on the HEADER's count; picking a row is asserted on the DETAIL panel. A step asserting on
// the island it drove could pass by echoing its own stimulus.
import type { RegionScenario } from '@motu/runtime/mock';
import { ALL_EVENTS } from '../../shared/event-types.js';
import { BOARD_GAMES, COASTAL_WALK, DENNIS, KAREN, PORTFOLIO, RICH } from '../../shared/events-evidence.js';

/**
 * What the page establishes (`motu/events-region.ts`): the session and the two island-owned keys.
 * NOT the source's keys — the source is installed in every flow and produces them; seeding them here
 * would overwrite its first answer with an empty calendar.
 */
const SEED = {
  me: null,
  filter: ALL_EVENTS,
  selectedEventId: null,
};

export const scenarios: RegionScenario[] = [
  {
    // A SLOW CALENDAR, in the lagoon's `slow-backend` world: the page's own events source runs over a
    // port that answers after 4 s. What a member sees meanwhile is a state no seed can set (the source
    // produces `eventsLoading`), and it used to be a lie — « Dennis, nothing booked yet » to a member
    // going to four events. Asserted on the header, which the world does not drive.
    name: 'a slow calendar does not tell you that you booked nothing',
    world: 'slow-backend',
    seed: { ...SEED, me: DENNIS },
    steps: [{ expectRender: { 'events-header': 'Dennis, checking your bookings' } }],
  },
  {
    // COVERAGE: every slot renders its own island, in text only that island produces.
    name: 'each slot renders its own island',
    seed: { ...SEED, me: DENNIS },
    steps: [
      {
        expectRender: {
          'events-header': 'Dennis, you',
          'event-filters': 'Whole club',
          'event-list': 'Coastal walk and talk',
          'event-detail': 'Pick an event',
        },
      },
    ],
  },
  {
    // PICKING A ROW OPENS IT — the list writes `selectedEventId`, the detail panel reads it, and the
    // source loads who is going. Asserted on the panel's venue line, which only the panel draws.
    name: 'picking an event opens it in the detail panel',
    seed: { ...SEED, me: DENNIS },
    steps: [
      { emit: { slot: 'event-list', event: 'event-selected', detail: COASTAL_WALK.id }, expectRender: { 'event-detail': 'Meet at the coastguard station car park' } },
      { emit: { slot: 'event-list', event: 'event-selected', detail: BOARD_GAMES.id }, expectRender: { 'event-detail': 'Bring a game you can teach' } },
    ],
  },
  {
    // THE COUPLING: an RSVP in the panel reaches the HEADER. Rich starts the morning going to two
    // events (the welcome evening and the speaking workshop); saying yes to board games makes three —
    // a number only the source's refetch can produce, and only if the port took the RSVP. Step one
    // asserts the selection on the panel, not the header: picking an event does not move the count,
    // so asserting "going to 2" there was a constant, and `flow-mutation` said so.
    name: 'an RSVP is counted in the header',
    seed: { ...SEED, me: RICH },
    steps: [
      { emit: { slot: 'event-list', event: 'event-selected', detail: BOARD_GAMES.id }, expectRender: { 'event-detail': 'Bring a game you can teach' } },
      { emit: { slot: 'event-detail', event: 'event-rsvp', detail: { eventId: BOARD_GAMES.id, going: true } }, expectRender: { 'events-header': 'going to 3' } },
    ],
  },
  {
    // THE CLUB SAYS NO, and says why. The portfolio night is full in the seed; the port refuses as
    // the database's trigger does, and the source turns the refusal into the panel's sentence.
    name: 'a full event refuses the RSVP',
    seed: { ...SEED, me: DENNIS },
    steps: [
      { emit: { slot: 'event-list', event: 'event-selected', detail: PORTFOLIO.id }, expectRender: { 'event-detail': 'Every place is taken' } },
      { emit: { slot: 'event-detail', event: 'event-rsvp', detail: { eventId: PORTFOLIO.id, going: true } }, expectRender: { 'event-detail': 'This event is full.' } },
    ],
  },
  {
    // A SUSPENDED MEMBERSHIP IS REFUSED BY THE BACKEND, not hidden by the button: the button still
    // asks, and the refusal is the backend's sentence.
    name: 'a suspended membership is refused',
    seed: { ...SEED, me: KAREN },
    steps: [
      { emit: { slot: 'event-list', event: 'event-selected', detail: BOARD_GAMES.id }, expectRender: { 'event-detail': 'the club will refuse' } },
      { emit: { slot: 'event-detail', event: 'event-rsvp', detail: { eventId: BOARD_GAMES.id, going: true } }, expectRender: { 'event-detail': 'A suspended membership cannot RSVP.' } },
    ],
  },
  {
    // THE FILTERS DRIVE THE LIST. There is no whole-club meetup still to come, so this filter empties
    // the list — the one rendering that cannot be produced by a list ignoring its filter.
    name: 'a filter that matches nothing empties the list',
    seed: { ...SEED, me: DENNIS },
    steps: [{ emit: { slot: 'event-filters', event: 'filter-changed', detail: { scope: 'club', kind: 'meetup' } }, expectRender: { 'event-list': 'No upcoming event matches' } }],
  },
];
