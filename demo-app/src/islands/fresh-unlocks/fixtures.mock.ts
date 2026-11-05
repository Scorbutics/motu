// Lagoon scenarios for x-fresh-unlocks.
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
  { name: 'a quiet week', seed: {} },
  { name: 'this week', seed: { overview: CLUB } },
  { name: 'the week after', seed: { overview: NEXT_WEEK } },
];
