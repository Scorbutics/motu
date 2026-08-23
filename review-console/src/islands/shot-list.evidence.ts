// Lagoon EVIDENCE for shot-list.
import type { Scenario } from '@motu/runtime/mock';
import { SHOTS, SHOTS_ALL_GREEN } from '../shared/review-evidence.js';

export const scenarios: Scenario[] = [
  { name: 'no shots', seed: { shots: [] } },
  { name: 'loading', seed: { shots: [], busy: true } },
  // The review case: something changed, and it must sort above the settled rows.
  { name: 'one changed, some new', seed: { shots: SHOTS } },
  { name: 'everything accepted', seed: { shots: SHOTS_ALL_GREEN } },
];
