// Lagoon scenarios for x-profile-hero.
//
// FOUR STATES, AND EACH IS REACHABLE BY CLICKING A REAL ROW. The seed gives every ACTIVE member with
// an even number availability, books out every one whose number ends in 6, and gives odd numbers and
// suspended members none — so neither "fully booked" nor "publishes nothing" is a state only a
// fixture can produce, and each scenario below is a real member in the state the seed puts them in. An empty state nobody can navigate to is an empty state nobody
// believes — and the one people ship broken.
//
// They render differently by construction: `data-flow` fails a scenario set whose members look the
// same, because fake evidence is worse than none.
//
// No fixtures: this island calls nothing. Everything it draws is a function of its two region keys.
import type { Fixture, Scenario } from '@motu/runtime/mock';
import { EVIDENCE_DAY } from '../../shared/club-evidence.js';
import { DENNIS, RICH, GUIDO, OPEN_CALENDAR, FULL_CALENDAR, NO_CALENDAR } from '../../shared/profile-evidence.js';

export const fixtures: Fixture[] = [];

export const scenarios: Scenario[] = [
  // The state it is first seen in, and the one an island MUST have: `default-props` requires it to
  // render from defaults alone, before any member id has resolved.
  { name: 'no member yet', seed: {} },
  { name: 'has availability', seed: { member: DENNIS, calendar: OPEN_CALENDAR, asOf: EVIDENCE_DAY } },
  // Days exist, nothing free. A DIFFERENT screen from the next one, and confusing the two is the
  // bug this pair exists to keep visible.
  { name: 'fully booked', seed: { member: RICH, calendar: FULL_CALENDAR, asOf: EVIDENCE_DAY } },
  { name: 'publishes nothing', seed: { member: GUIDO, calendar: NO_CALENDAR, asOf: EVIDENCE_DAY } },
  // The shape before the data. `loading` is the island's own prop, not a region key.
  { name: 'loading skeleton', seed: { loading: true } },
];
