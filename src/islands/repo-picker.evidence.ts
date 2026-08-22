// Lagoon EVIDENCE for repo-picker.
//
// RELATIVE import — an aliased one is loaded by the checks with a plain node import() and fails
// silently, taking every scenario with it.
import type { Scenario } from '@motu/runtime/mock';
import { REPOS } from '../shared/review-evidence.js';

export const scenarios: Scenario[] = [
  // The state the console opens in before the host answers — and the one a fresh host stays in.
  { name: 'nothing published yet', seed: { repos: [] } },
  { name: 'three projects', seed: { repos: REPOS } },
  { name: 'one selected', seed: { repos: REPOS, value: 'Scorbutics/motu' } },
];
