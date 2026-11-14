// Lagoon scenarios for x-calendar-days.
//
// Every calendar here is one the seed actually gives a real member (see `profile-evidence.ts`), run
// through the app's own `calendarFrom` — no hand-built days. They render differently by
// construction: no days, every day booked, days with free times, and one of them picked.
//
// No fixtures: this island calls nothing. Everything it draws is a function of its two region keys.
import type { Fixture, Scenario } from '@motu/runtime/mock';
import { OPEN_CALENDAR, FULL_CALENDAR, NO_CALENDAR, FIRST_OPEN_DAY } from '../../shared/profile-evidence.js';

export const fixtures: Fixture[] = [];

export const scenarios: Scenario[] = [
  // Defaults alone: the route has not resolved, there is no calendar yet.
  { name: 'no calendar yet', seed: {} },
  { name: 'days to pick from', seed: { calendar: OPEN_CALENDAR, selectedDay: null } },
  { name: 'a day picked', seed: { calendar: OPEN_CALENDAR, selectedDay: FIRST_OPEN_DAY } },
  // Days exist, nothing free — every chip shown and refused, which is not the same as no days.
  { name: 'every day booked', seed: { calendar: FULL_CALENDAR, selectedDay: null } },
  // A resolved calendar with no days — a different sentence from "no calendar yet" above.
  { name: 'publishes nothing', seed: { calendar: NO_CALENDAR, selectedDay: null } },
  // `loading` is the island's own prop (the page passes it), not a region key: this one exists for
  // the island alone. The others seed only region keys, so each is also a what-if in the region —
  // which is why they must NOT spell out `loading: false` (the default): it made all four
  // unreachable there.
  { name: 'loading skeleton', seed: { loading: true } },
];
