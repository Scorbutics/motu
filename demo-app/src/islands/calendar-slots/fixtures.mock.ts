// Lagoon scenarios for x-calendar-slots.
//
// Every calendar here is one the seed's rules give a real member (`profile-evidence.ts`): Dennis's
// open calendar and Rich's booked-out one. Nothing is invented to make a frame render.
//
// They render differently by construction — no day, a day with free times, the same day with one
// picked, and a day where everything is taken — because `data-flow` fails a scenario set whose
// members look the same.
//
// No fixtures: this island calls nothing. Everything it draws is a function of its three region keys.
import type { Fixture, Scenario } from '@motu/runtime/mock';
import { A_FREE_SLOT, FIRST_OPEN_DAY, FULL_CALENDAR, OPEN_CALENDAR } from '../../shared/profile-evidence.js';

export const fixtures: Fixture[] = [];

/** Rich's first day: slots exist, every one taken. */
const FULL_DAY = FULL_CALENDAR.days[0]?.date ?? null;

export const scenarios: Scenario[] = [
  // The page's resting state, and what `default-props` requires: nothing chosen, nothing to list.
  { name: 'no day picked', seed: {} },
  { name: 'a day with free times', seed: { calendar: OPEN_CALENDAR, selectedDay: FIRST_OPEN_DAY, selectedSlot: null } },
  { name: 'a free time picked', seed: { calendar: OPEN_CALENDAR, selectedDay: FIRST_OPEN_DAY, selectedSlot: A_FREE_SLOT ?? null } },
  // Taken slots are listed disabled, never hidden — a different screen from "no day picked".
  { name: 'every time taken', seed: { calendar: FULL_CALENDAR, selectedDay: FULL_DAY, selectedSlot: null } },
];
