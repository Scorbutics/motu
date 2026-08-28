// Lagoon EVIDENCE for corpus-filter — what this control can be while somebody looks at it.
//
// A SCENARIO SEEDS THE ISLAND'S OWN PROPS, not the region's keys: a lone island is mounted through a
// synthesised config whose binds are same-named, so these are `value` and `unacceptedCount` — the
// names in the component — while the region speaks of `filter` and `unacceptedCount`.
import type { Scenario } from '@motu/runtime/mock';
import { CORPUS_UNACCEPTED } from '../shared/corpus-evidence.js';

export const fixtures = [];

export const roles: string[] = [];

export const scenarios: Scenario[] = [
  // The default. `seed: {}` MEANS the empty state — the lanes reset between scenarios, so this is not
  // whichever one ran before it.
  { name: 'everything, nothing accepted yet', seed: {} },
  // Narrowed, with something behind the number. Renders differently from the first: the pressed
  // choice moves and the count is non-zero, which is what `data-flow` asks of a scenario set.
  {
    name: 'narrowed to what is unaccepted',
    seed: { value: 'unaccepted', unacceptedCount: CORPUS_UNACCEPTED },
  },
  // Narrowed with NOTHING behind it — the good outcome, and the one a reader most needs to tell apart
  // from the bad one. A zero here means every state is known, not that the instrument is broken.
  {
    name: 'narrowed with everything accepted',
    seed: { value: 'unaccepted', unacceptedCount: 0 },
  },
];
