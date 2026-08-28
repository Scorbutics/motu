// Lagoon EVIDENCE for lagoon-filter — the page's one control, in each state it can be in.
//
// A CONTROLLED CONTROL. The region holds `query` and `show`, not the component, so every state here
// is reachable by seeding — which is also what lets a flow, a link or the lens put the page into any
// of them without typing.
import type { Scenario } from '@motu/runtime/mock';

export const fixtures = [];
export const roles: string[] = [];

export const scenarios: Scenario[] = [
  {
    // The state a visitor lands in: an empty field and every kind listed. `seed: {}` is the
    // component's own defaults, which is the state a region that has never been written holds.
    name: 'nothing typed, everything shown',
    seed: {},
  },
  {
    // MID-SEARCH. The field carries a value and the thumb has not moved — the two keys are
    // independent, and this is the state that proves it: typing does not reset the segment.
    name: 'a search in progress',
    seed: { query: 'motu' },
  },
  {
    // NARROWED. The thumb has moved AND a query is standing, which is the combination the two-key
    // model exists for; a single `{ query, show }` object would make either change a write of both.
    name: 'narrowed to groups, with a query standing',
    seed: { query: 'product', show: 'groups' },
  },
];
