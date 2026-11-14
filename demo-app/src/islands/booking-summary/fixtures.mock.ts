// Lagoon scenarios for x-booking-summary.
//
// FOUR STATES, in the order a person reaches them on the profile: nobody resolved, a member and no
// day, a day and no time, a time. Each is the same evidence the region uses (`profile-evidence.ts`):
// Dennis, his opening day and the free slot on it the calendar would let you pick — not a slot
// invented to fill the card.
//
// No fixtures: this island calls nothing. Everything it draws is a function of its three region keys.
import type { Fixture, Scenario } from '@motu/runtime/mock';
import { A_FREE_SLOT, DENNIS, FIRST_OPEN_DAY, GUIDO } from '../../shared/profile-evidence.js';

export const fixtures: Fixture[] = [];

export const scenarios: Scenario[] = [
  // Defaults alone: the route has not resolved a member yet.
  { name: 'no member yet', seed: {} },
  { name: 'no day picked', seed: { member: DENNIS, selectedDay: null, selectedSlot: null } },
  { name: 'day picked, no time', seed: { member: DENNIS, selectedDay: FIRST_OPEN_DAY, selectedSlot: null } },
  // Suspended: the summary refuses rather than inviting a pick the calendar cannot offer.
  { name: 'suspended member', seed: { member: GUIDO, selectedDay: null, selectedSlot: null } },
  { name: 'time picked', seed: { member: DENNIS, selectedDay: FIRST_OPEN_DAY, selectedSlot: A_FREE_SLOT ?? null } },
];
