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
    // A QUERY THAT MATCHES NOTHING is still a query: the field holds it, and what the LIST does with
    // it is the list's business. The control has one job and this is the far end of it.
    name: 'a query that will find nothing',
    seed: { query: 'zzzz' },
  },
];
