// Declared FLOWS for My club.
//
// The events source is installed over the seed, pinned to the evidence morning — the same object the
// page installs over Postgres — so cancelling here runs the same logic it runs on the events page.
// Every assertion is on an island other than the one driven, or on what a host-fed key does to
// several islands at once.
import type { RegionScenario } from '@motujs/runtime/mock';
import { CHAPTERS } from '../../shared/chapter-types.js';
import { CLUB, EVIDENCE_DAY } from '../../shared/club-evidence.js';
import { COASTAL_WALK, DENNIS, GUIDO } from '../../shared/events-evidence.js';

/**
 * What the page establishes (`motu/home-region.ts`), with the host-fed keys as the page feeds them on
 * the evidence day. No source key: the source produces those in every flow.
 */
const SEED = {
  me: null,
  asOf: EVIDENCE_DAY,
  overview: CLUB,
  chapters: CHAPTERS,
  selectedEventId: null,
};

export const scenarios: RegionScenario[] = [
  {
    // COVERAGE: every slot renders its own island — including the two borrowed from the directory.
    name: 'each slot renders its own island',
    seed: { ...SEED, me: DENNIS },
    steps: [
      {
        expectRender: {
          'my-standing': 'Welcome back',
          'my-events': 'Coastal walk and talk',
          'my-chapter': 'Next chapter event',
          'home-quest': 'Weekly quest',
          'home-cup': 'Chapter Cup',
        },
      },
    ],
  },
  {
    // THE SESSION MOVES THE WHOLE PAGE: a different member, a different chapter panel, a different
    // list of events — three islands, one host-fed key, and the source re-asked for the new person.
    name: 'acting as another member changes the page',
    seed: { ...SEED, me: DENNIS },
    steps: [
      { provide: { me: GUIDO }, expectRender: { 'my-chapter': 'South chapter', 'my-events': 'Saturday garden morning' } },
    ],
  },
  {
    // CANCELLING HERE REACHES THE HEADER. Dennis is going to four events on the evidence morning;
    // cancelling the coastal walk makes three — counted by `my-standing`, which only sees it because
    // the source asked the port again.
    name: 'cancelling an RSVP is counted in the standing',
    seed: { ...SEED, me: DENNIS },
    steps: [
      { expectRender: { 'my-standing': '4 events booked' } },
      { emit: { slot: 'my-events', event: 'event-rsvp', detail: { eventId: COASTAL_WALK.id, going: false } }, expectRender: { 'my-standing': '3 events booked' } },
    ],
  },
];
