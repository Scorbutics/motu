// Lagoon scenarios for x-weekly-quest.
//
// Every state is the club's own rules over the seed on a pinned day (`shared/club-evidence.ts`) —
// none of these numbers is typed here. The empty one is the island rendering from defaults alone,
// which is what the page shows before the club's numbers arrive.
//
// No fixtures: this island calls nothing.
import type { Fixture, Scenario } from '@motujs/runtime/mock';
import { CLUB, FIRST_YEAR, NEXT_WEEK } from '../../shared/club-evidence.js';

void FIRST_YEAR;
void NEXT_WEEK;

export const fixtures: Fixture[] = [];

export const scenarios: Scenario[] = [
  { name: 'no quest yet', seed: {} },
  { name: 'the quest this week', seed: { overview: CLUB } },
  { name: 'the quest next week', seed: { overview: NEXT_WEEK } },
];
