// Lagoon EVIDENCE for shot-list.
import type { Scenario } from '@motu/runtime/mock';
import { SHOTS, SHOTS_ALL_GREEN } from '../shared/review-evidence.js';

export const scenarios: Scenario[] = [
  // `busy` seeded BOTH ways: an empty list that is still loading and one that has finished are two
  // different sentences, and seeding the flag only one way leaves the second unproven.
  { name: 'no shots', seed: { shots: [], busy: false } },
  { name: 'loading', seed: { shots: [], busy: true } },
  // The review case: something changed, and it must sort above the settled rows.
  { name: 'one changed, some new', seed: { shots: SHOTS } },
  { name: 'everything accepted', seed: { shots: SHOTS_ALL_GREEN } },
];
