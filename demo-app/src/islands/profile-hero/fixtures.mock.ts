// Lagoon scenarios for x-profile-hero.
//
// FOUR STATES, AND EACH IS REACHABLE BY CLICKING A REAL ROW. The seeded directory gives every member
// with an even number availability and every odd one none, so "publishes nothing" is not a state
// that only a fixture can produce. An empty state nobody can navigate to is an empty state nobody
// believes — and the one people ship broken.
//
// They render differently by construction: `data-flow` fails a scenario set whose members look the
// same, because fake evidence is worse than none.
//
// No fixtures: this island calls nothing. Everything it draws is a function of its two region keys.
import type { Fixture, Scenario } from '@motu/runtime/mock';
import { ADA, RASMUS, OPEN_CALENDAR, FULL_CALENDAR, NO_CALENDAR } from '../../shared/profile-evidence.js';

export const fixtures: Fixture[] = [];

export const scenarios: Scenario[] = [
  // The state it is first seen in, and the one an island MUST have: `default-props` requires it to
  // render from defaults alone, before any member id has resolved.
  { name: 'no member yet', seed: {} },
  { name: 'has availability', seed: { member: ADA, calendar: OPEN_CALENDAR } },
  // Days exist, nothing free. A DIFFERENT screen from the next one, and confusing the two is the
  // bug this pair exists to keep visible.
  { name: 'fully booked', seed: { member: RASMUS, calendar: FULL_CALENDAR } },
  { name: 'publishes nothing', seed: { member: RASMUS, calendar: NO_CALENDAR } },
  // The shape before the data. `loading` is the island's own prop, not a region key.
  { name: 'loading skeleton', seed: { loading: true } },
];
