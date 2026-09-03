// Lagoon scenarios for x-member-card.
//
// FOUR STATES THAT RENDER DIFFERENTLY, which is a rule rather than a preference: `data-flow` fails a
// scenario set whose members look the same, because fake evidence is worse than none. Each of these
// changes something a person can see — the avatar, the ring, the quote, the meter.
//
// No fixtures: this island calls nothing. It is a projection of one region key, so its whole input is
// the seed.
import type { Fixture, Scenario } from '@motu/runtime/mock';
import { COMPLETE, EMPTY, OVERFLOWING, PARTIAL } from '../../shared/member-draft-evidence.js';

export const fixtures: Fixture[] = [];

export const scenarios: Scenario[] = [
  // The state it is first seen in. Dashed avatar, ghosted bio, 0% — designed, not accidental.
  { name: 'nothing filled in', seed: { draft: EMPTY } },
  { name: 'a name and a role', seed: { draft: PARTIAL } },
  { name: 'a complete profile', seed: { draft: COMPLETE } },
  // The one that catches layout bugs: long values in every field at once.
  { name: 'long values everywhere', seed: { draft: OVERFLOWING } },
];
