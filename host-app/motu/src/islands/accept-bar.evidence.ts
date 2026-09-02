// Lagoon EVIDENCE for accept-bar.
//
// Written before the restyle onto motu's kit, so the states its three buttons can be in are on
// record. The interesting one is DISABLED: three greyed buttons is what the bar looks like most of
// the time, and it was the state nothing had ever previewed.
//
// Every scenario names a repo. Without one the bar renders nothing at all — correct, and the reason
// `lagoon-render` warns — and a scenario that renders nothing cannot take part in `data-flow`, which
// compares outputs and has none to compare.
import type { Scenario } from '@motu/runtime/mock';
import { SELECTED, SHOTS, SHOTS_ALL_GREEN } from '../shared/review-evidence.js';

const REPO = 'acme/example-app';

export const scenarios: Scenario[] = [
  // Work waiting, nothing picked — only "accept all" can fire, and the two narrow scopes say what
  // they would need.
  { name: 'work waiting, nothing picked', seed: { repo: REPO, shots: SHOTS, busy: false } },
  // A shot picked: all three scopes are live, and the narrow ones name what they would accept.
  { name: 'a shot picked', seed: { repo: REPO, shots: SHOTS, shot: SELECTED, busy: false } },
  // Settled: every button off. The count says zero rather than the bar disappearing — a bar that
  // vanishes when there is nothing to do reads as a bar that failed to load.
  { name: 'nothing to accept', seed: { repo: REPO, shots: SHOTS_ALL_GREEN, shot: SELECTED, busy: false } },
  // A project the host has answered for with nothing. Crossed with a picked shot on purpose: the two
  // narrow buttons still name an island they can no longer accept, which is the state worth seeing.
  { name: 'the project has no shots', seed: { repo: REPO, shots: [], shot: SELECTED, busy: false } },
  // Mid-accept. Everything off and the bar says why, rather than looking merely disabled.
  { name: 'working', seed: { repo: REPO, shots: SHOTS, shot: SELECTED, busy: true } },
];
