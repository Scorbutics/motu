// Lagoon EVIDENCE for corpus-states — the three things this list can be.
//
// THE TWO EMPTIES ARE BOTH HERE, and that is the point of the set rather than padding: "nothing was
// ever recorded" and "everything recorded has been accepted" render different sentences and mean
// opposite things to whoever is reading. A component that collapsed them into one empty state would
// pass every check and tell somebody their instrument was broken when it was working.
import type { Scenario } from '@motu/runtime/mock';
import { CORPUS_REGION_ID, CORPUS_STATES } from '../shared/corpus-evidence.js';

export const fixtures = [];

export const roles: string[] = [];

export const scenarios: Scenario[] = [
  {
    name: 'a corpus with a finding in it',
    seed: { states: CORPUS_STATES, filter: 'all', regionId: CORPUS_REGION_ID },
  },
  {
    name: 'only what is unaccepted',
    seed: { states: CORPUS_STATES, filter: 'unaccepted', regionId: CORPUS_REGION_ID },
  },
  {
    // Nothing recorded at all: the instrument may never have run. `coverage.enabled` defaults to
    // false, so this is the ordinary first answer rather than an error.
    name: 'nothing recorded yet',
    seed: { states: [], filter: 'all', regionId: CORPUS_REGION_ID },
  },
  {
    // Recorded, and all of it known. The reassuring empty, and it must not read like the one above.
    name: 'everything accepted',
    seed: {
      states: CORPUS_STATES.map((s) => ({ ...s, accepted: true })),
      filter: 'unaccepted',
      regionId: CORPUS_REGION_ID,
    },
  },
];
