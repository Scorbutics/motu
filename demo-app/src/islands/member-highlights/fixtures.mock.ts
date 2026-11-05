// Lagoon scenarios for x-member-highlights.
//
// Every state is the club's own rules over the seed on a pinned day (`shared/club-evidence.ts`) —
// none of these numbers is typed here. The empty one is the island rendering from defaults alone,
// which is what the page shows before the club's numbers arrive.
//
// No fixtures: this island calls nothing.
import type { Fixture, Scenario } from '@motu/runtime/mock';
import { CLUB, FIRST_YEAR, NEXT_WEEK } from '../../shared/club-evidence.js';

void FIRST_YEAR;
void NEXT_WEEK;

export const fixtures: Fixture[] = [];

export const scenarios: Scenario[] = [
  { name: 'the shape before the numbers', seed: {} },
  { name: 'the club today', seed: { overview: CLUB } },
  { name: 'the club in its first year', seed: { overview: FIRST_YEAR } },
];
