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

/** The member every piece of profile evidence is about. Columns as the `members` table spells them. */
export const ADA: MemberRow = {
  id: '11111111-1111-4111-8111-111111111111',
  firstname: 'Ada',
  surname: 'Berners-Lee',
  email: 'ada.bernerslee@example.org',
  status: 'active',
  plan: 'premium',
  chapter: 'Northwest coastal chapter',
  member_no: '702508',
  joined: '2025-10-27',
};

/** A second member, so a scenario set has something to differ BY. */
export const RASMUS: MemberRow = {
  id: '22222222-2222-4222-8222-222222222222',
  firstname: 'Rasmus',
  surname: 'Allen',
  email: 'rasmus.allen@example.org',
  status: 'suspended',
  plan: 'standard',
  chapter: 'North chapter',
  member_no: '702511',
  joined: '2019-02-19',
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

/** Three days, mixed free and taken — the ordinary calendar, and the one most states start from. */
export const OPEN_CALENDAR: Calendar = calendarFrom(
  String(ADA.id),
  rows([
    ['2026-09-07', 9, 'intro', true],
    ['2026-09-07', 11, 'workshop', false],
    ['2026-09-07', 14, 'intro', false],
    ['2026-09-08', 9, 'intro', false],
    ['2026-09-08', 16, 'mentoring', false],
    ['2026-09-10', 11, 'workshop', false],
    ['2026-09-10', 14, 'intro', true],
  ]),
);

/** Days exist and every slot is gone. Distinct from "publishes nothing" — a different screen. */
export const FULL_CALENDAR: Calendar = calendarFrom(
  String(RASMUS.id),
  rows([
    ['2026-09-07', 9, 'intro', true],
    ['2026-09-07', 11, 'workshop', true],
    ['2026-09-08', 14, 'intro', true],
  ]),
);

/** Publishes nothing at all. Half the seeded directory is in this state, so it is navigable. */
export const NO_CALENDAR: Calendar = calendarFrom(String(RASMUS.id), []);

/** The first day of `OPEN_CALENDAR` that has anything free — what the region opens on. */
export const FIRST_OPEN_DAY: string = OPEN_CALENDAR.firstOpenDate ?? '';

/** That day, whole. Handy for a flow that wants to name a slot on it. */
export const FIRST_OPEN: DayAvailability | undefined = OPEN_CALENDAR.days.find((d) => d.date === FIRST_OPEN_DAY);

/** A free slot on the opening day — the one a flow picks. */
export const A_FREE_SLOT: Timeslot | undefined = FIRST_OPEN?.slots.find((s) => !s.taken);
