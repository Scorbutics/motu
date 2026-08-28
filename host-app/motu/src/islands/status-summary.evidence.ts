// Lagoon EVIDENCE for status-summary.
//
// It had none, and it is about to be restyled onto motu's kit — so the states it can be in were
// written down first. A restyle with no scenario is a change nobody can look at before or after.
//
// THE EMPTY STATE IS DELIBERATELY ABSENT, and `input-coverage` will say so. This island renders
// NOTHING when there are no shots — three zeroes above an empty list is a readout about nothing — and
// `data-flow` requires EVERY scenario to render something, because a blank output cannot be compared
// with anything. So the state exists, is intentional (`lagoon-render` warns about it, correctly), and
// cannot be evidenced here. Adding a scenario for it turns a warning into a false `data-flow` error
// reading "scenarios rendered identically", which is not what went wrong.
//
// RELATIVE import — an aliased one is loaded by the checks with a plain node import() and fails
// silently, taking every scenario with it.
import type { Scenario } from '@motu/runtime/mock';
import { SHOTS, SHOTS_ALL_GREEN } from '../shared/review-evidence.js';

export const scenarios: Scenario[] = [
  // The reason to open the screen: a number that says how much is waiting on you.
  { name: 'work waiting', seed: { shots: SHOTS } },
  { name: 'everything settled', seed: { shots: SHOTS_ALL_GREEN } },
];
