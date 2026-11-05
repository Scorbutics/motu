// The vocabulary the profile region's evidence speaks, in ONE module both sides import.
//
// WHY THIS FILE EXISTS RATHER THAN TWO COPIES. The island's scenarios and the region's flows need
// the same member and the same calendar; writing them twice produces a third copy of the app's
// vocabulary that nobody diffs, and the first thing that drifts is the one nothing renders. So the
// rows live here and both sides import THIS, with a RELATIVE specifier — `@/` does not resolve in
// the plain-node loaders that read evidence files, and that failure is silent rather than loud.
//
// TYPED WITH `import type` AGAINST THE APP'S OWN TYPES. It erases at runtime, so the loaders are
// unaffected, and a renamed field fails the build here instead of quietly previewing last month's
// shape. That is the whole reason to type a fixture at all.
//
// The dates are FIXED rather than computed from today. Evidence has the opposite requirement to the
// database seed: the seed moves with the viewer so a live demo is never stale, and evidence stands
// still so a visual baseline and a flow assertion mean the same thing next month.
import type { Calendar, DayAvailability, Timeslot } from './availability-types.js';
import type { MemberRow } from './member-types.js';
import { calendarFrom, type TimeslotRow } from './availability-source.js';

// THREE REAL ROWS, COPIED WHOLE FROM `supabase/seed.sql`, one per availability state the seed can
// produce for them. The first version of this file built each member from pieces of several rows —
// one person's name and email with another's number and joining date, and a status the real person
// did not have — so the lagoon showed a member who exists nowhere and a flow asserted on someone
// else's membership number. Each row below is the seed's own, and each calendar below is one the
// seed's rules (`supabase/seeds/timeslots.sql`) actually give that member. The ids are the sandbox's
// (`idFor('8000', member_no)` in `roots/app/scripts/sandbox-data.mjs`).

/** Active, even number: publishes availability. seed.sql line 79. */
export const DENNIS: MemberRow = {
  id: '00000000-0000-4000-8000-000000702564',
  firstname: 'Dennis',
  surname: 'Shaw',
  email: 'dennis.shaw@example.org',
  status: 'active',
  plan: 'premium',
  chapter: 'Northwest coastal chapter',
  member_no: '702564',
  joined: '2022-10-15',
};

/** Active, member_no ending in 6: every slot taken — the fully-booked state. seed.sql line 21. */
export const RICH: MemberRow = {
  id: '00000000-0000-4000-8000-000000702506',
  firstname: 'Rich',
  surname: 'Stroustrup',
  email: 'rich.stroustrup@example.org',
  status: 'active',
  plan: 'standard',
  chapter: 'South chapter',
  member_no: '702506',
  joined: '2025-03-08',
};

/** Suspended: publishes nothing, whatever the number. seed.sql line 85. */
export const GUIDO: MemberRow = {
  id: '00000000-0000-4000-8000-000000702570',
  firstname: 'Guido',
  surname: 'Clarke',
  email: 'guido.clarke@example.org',
  status: 'suspended',
  plan: 'standard',
  chapter: 'Northwest coastal chapter',
  member_no: '702570',
  joined: '2023-03-04',
};

/**
 * Rows built the way the BACKEND hands them over, then run through the application's own
 * `calendarFrom`.
 *
 * NOT A HAND-WRITTEN `Calendar`. Writing the grouped shape directly would mean the evidence and the
 * screen agree with each other while both disagree with the source — the exact self-consistency that
 * passes every check and describes an application that does not exist. Going through the real
 * function means a change to the grouping shows up here as a changed screen.
 */
function rows(spec: [day: string, hour: number, kind: Timeslot['kind'], taken: boolean][]): TimeslotRow[] {
  return spec.map(([day, hour, kind, taken], i) => ({
    id: `slot-${i}`,
    starts_at: `${day}T${String(hour).padStart(2, '0')}:00:00+00:00`,
    minutes: kind === 'workshop' ? 60 : kind === 'mentoring' ? 45 : 30,
    kind,
    taken,
  }));
}

/**
 * DENNIS'S CALENDAR, exactly as `supabase/seeds/timeslots.sql` lays it out with `current_date` =
 * Monday 2026-09-07: the seed's full 21 days, weekdays only, his away days removed, the far
 * afternoons thinned, a third of the slots taken. The same shape the page gets — a hand-cut single
 * week was a calendar the app never serves.
 */
export const OPEN_CALENDAR: Calendar = calendarFrom(
  String(DENNIS.id),
  rows([
    ['2026-09-07', 9, 'intro', true],
    ['2026-09-07', 11, 'workshop', false],
    ['2026-09-07', 14, 'intro', false],
    ['2026-09-07', 16, 'mentoring', false],
    ['2026-09-08', 9, 'intro', false],
    ['2026-09-08', 11, 'workshop', true],
    ['2026-09-08', 14, 'intro', true],
    ['2026-09-08', 16, 'mentoring', false],
    ['2026-09-10', 9, 'intro', true],
    ['2026-09-10', 11, 'workshop', false],
    ['2026-09-10', 14, 'intro', false],
    ['2026-09-10', 16, 'mentoring', false],
    ['2026-09-11', 9, 'intro', false],
    ['2026-09-11', 11, 'workshop', true],
    ['2026-09-11', 14, 'intro', true],
    ['2026-09-11', 16, 'mentoring', false],
    ['2026-09-14', 9, 'intro', false],
    ['2026-09-14', 11, 'workshop', true],
    ['2026-09-14', 14, 'intro', true],
    ['2026-09-14', 16, 'mentoring', false],
    ['2026-09-15', 9, 'intro', false],
    ['2026-09-15', 11, 'workshop', false],
    ['2026-09-15', 14, 'intro', false],
    ['2026-09-15', 16, 'mentoring', true],
    ['2026-09-16', 9, 'intro', true],
    ['2026-09-16', 11, 'workshop', false],
    ['2026-09-16', 14, 'intro', false],
    ['2026-09-16', 16, 'mentoring', false],
    ['2026-09-18', 9, 'intro', false],
    ['2026-09-18', 11, 'workshop', false],
    ['2026-09-18', 14, 'intro', false],
    ['2026-09-18', 16, 'mentoring', true],
    ['2026-09-22', 9, 'intro', true],
    ['2026-09-22', 11, 'workshop', false],
    ['2026-09-22', 14, 'intro', false],
    ['2026-09-22', 16, 'mentoring', false],
    ['2026-09-23', 9, 'intro', false],
    ['2026-09-23', 11, 'workshop', true],
    ['2026-09-24', 9, 'intro', false],
    ['2026-09-24', 11, 'workshop', false],
    ['2026-09-24', 14, 'intro', false],
    ['2026-09-24', 16, 'mentoring', true],
  ]),
);

/**
 * RICH'S CALENDAR under the same rules: his number ends in 6, so every slot is taken. Days exist and
 * nothing is free — a different screen from "publishes nothing", and distinguishing the two is what
 * the hero's scenarios are for.
 */
export const FULL_CALENDAR: Calendar = calendarFrom(
  String(RICH.id),
  rows([
    ['2026-09-07', 9, 'intro', true],
    ['2026-09-07', 11, 'workshop', true],
    ['2026-09-07', 14, 'intro', true],
    ['2026-09-07', 16, 'mentoring', true],
    ['2026-09-08', 9, 'intro', true],
    ['2026-09-08', 11, 'workshop', true],
    ['2026-09-08', 14, 'intro', true],
    ['2026-09-08', 16, 'mentoring', true],
    ['2026-09-09', 9, 'intro', true],
    ['2026-09-09', 11, 'workshop', true],
    ['2026-09-09', 14, 'intro', true],
    ['2026-09-09', 16, 'mentoring', true],
    ['2026-09-11', 9, 'intro', true],
    ['2026-09-11', 11, 'workshop', true],
    ['2026-09-11', 14, 'intro', true],
    ['2026-09-11', 16, 'mentoring', true],
    ['2026-09-15', 9, 'intro', true],
    ['2026-09-15', 11, 'workshop', true],
    ['2026-09-15', 14, 'intro', true],
    ['2026-09-15', 16, 'mentoring', true],
    ['2026-09-16', 9, 'intro', true],
    ['2026-09-16', 11, 'workshop', true],
    ['2026-09-16', 14, 'intro', true],
    ['2026-09-16', 16, 'mentoring', true],
    ['2026-09-17', 9, 'intro', true],
    ['2026-09-17', 11, 'workshop', true],
    ['2026-09-17', 14, 'intro', true],
    ['2026-09-17', 16, 'mentoring', true],
    ['2026-09-21', 9, 'intro', true],
    ['2026-09-21', 11, 'workshop', true],
    ['2026-09-23', 9, 'intro', true],
    ['2026-09-23', 11, 'workshop', true],
    ['2026-09-24', 9, 'intro', true],
    ['2026-09-24', 11, 'workshop', true],
    ['2026-09-24', 14, 'intro', true],
    ['2026-09-24', 16, 'mentoring', true],
    ['2026-09-25', 9, 'intro', true],
    ['2026-09-25', 11, 'workshop', true],
  ]),
);

/** Publishes nothing at all — every odd number and every suspended member, so it is navigable. */
export const NO_CALENDAR: Calendar = calendarFrom(String(GUIDO.id), []);

/** The first day of `OPEN_CALENDAR` that has anything free — what the region opens on. */
export const FIRST_OPEN_DAY: string = OPEN_CALENDAR.firstOpenDate ?? '';

/** That day, whole. Handy for a flow that wants to name a slot on it. */
export const FIRST_OPEN: DayAvailability | undefined = OPEN_CALENDAR.days.find((d) => d.date === FIRST_OPEN_DAY);

/** A free slot on the opening day — the one a flow picks. */
export const A_FREE_SLOT: Timeslot | undefined = FIRST_OPEN?.slots.find((s) => !s.taken);
