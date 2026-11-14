// Lagoon scenarios for x-my-standing. The level, rank and streak are the club's rules over each
// persona's seed row on the evidence day — the same numbers the directory shows them with.
import type { Fixture, Scenario } from '@motujs/runtime/mock';
import { CLUB, EVIDENCE_DAY } from '../../shared/club-evidence.js';
import { DENNIS, GUIDO, KAREN, rsvpsOf } from '../../shared/events-evidence.js';

export const fixtures: Fixture[] = [];

export const scenarios: Scenario[] = [
  { name: 'a guest', seed: {} },
  { name: 'a premium regular', seed: { me: DENNIS, asOf: EVIDENCE_DAY, overview: CLUB, myRsvps: rsvpsOf(DENNIS) } },
  { name: 'on a hot streak', seed: { me: GUIDO, asOf: EVIDENCE_DAY, overview: CLUB, myRsvps: rsvpsOf(GUIDO) } },
  { name: 'suspended', seed: { me: KAREN, asOf: EVIDENCE_DAY, overview: CLUB, myRsvps: [] } },
];
