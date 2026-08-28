// Lagoon EVIDENCE for lagoon-groups — the composed card.
import type { Scenario } from '@motu/runtime/mock';
import { GROUPS } from '../shared/index-evidence.js';

export const fixtures = [];
export const roles: string[] = [];

export const scenarios: Scenario[] = [
  {
    // NO CARD AT ALL, which is a render worth pinning precisely because it renders nothing: the
    // component returns null rather than an empty "Composed" heading, and a heading over nothing is
    // what it looked like before somebody decided otherwise.
    name: 'no galleries, so no card',
    seed: {},
  },
  {
    name: 'the galleries this host serves',
    seed: { groups: GROUPS },
  },
  {
    // One gallery, one member — the singular again, and the case where "+" joins nothing.
    name: 'one gallery with a single member',
    seed: { groups: [{ name: 'product', members: [{ repo: 'Scorbutics/motu-host-app' }] }] },
  },
];
