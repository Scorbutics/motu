// Lagoon EVIDENCE for repo-picker.
//
// RELATIVE import — an aliased one is loaded by the checks with a plain node import() and fails
// silently, taking every scenario with it.
import type { Scenario } from '@motu/runtime/mock';
import { REPOS, SHOTS, SHOTS_ALL_GREEN } from '../shared/review-evidence.js';

export const scenarios: Scenario[] = [
  // The state the console opens in before the host answers — and the one a fresh host stays in.
  { name: 'nothing published yet', seed: { repos: [] } },
  { name: 'three projects', seed: { repos: REPOS } },
  { name: 'one selected', seed: { repos: REPOS, value: 'Scorbutics/motu' } },
  // The two verdicts the selected row can carry. They are what makes the rail worth looking at rather
  // than merely clicking, so each gets a scenario of its own.
  { name: 'the selected project has work waiting', seed: { repos: REPOS, value: 'acme/example-app', shots: SHOTS } },
  { name: 'the selected project is settled', seed: { repos: REPOS, value: 'acme/example-app', shots: SHOTS_ALL_GREEN } },
  // A SELECTED PROJECT WITH NOTHING IN IT — twenty is in exactly this state on the real host. Neither
  // verdict may appear: "all settled" on a project that has published no shots would be a reassuring
  // sentence about nothing, which is worse than saying nothing at all.
  { name: 'the selected project has published nothing', seed: { repos: REPOS, value: 'twentyhq/twenty', shots: [] } },
];
