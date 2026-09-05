// The vocabulary the calendar region speaks, typed once so both sides of every seam agree.
//
// These names come from the TABLE (`timeslots`: starts_at, minutes, kind, taken) rather than from
// anything a fixture invented. That direction matters: a fixture is free to make up a word, and
// nothing mechanical will ever contradict it — the checks compare the artifact to itself. Keeping
// the vocabulary anchored to the schema is what makes a renamed column fail the build here instead
// of previewing last month's shape.

/** What a slot is for. The same three the table's CHECK constraint allows, and no more. */
export type SlotKind = 'intro' | 'mentoring' | 'workshop';

/** Human labels for the kinds. Rendered by the calendar; kept here so two islands cannot disagree. */
export const SLOT_KIND_LABELS: Record<SlotKind, string> = {
  intro: 'Intro chat',
  mentoring: 'Mentoring',
  workshop: 'Workshop',
};

/** One bookable slot, as the source hands it to the islands. */
export interface Timeslot {
  id: string;
  /** ISO instant. The islands format it; they never parse it into their own notion of a day. */
  startsAt: string;
  minutes: number;
  kind: SlotKind;
  /** Already booked by someone else. Rendered disabled, never hidden — see the migration. */
  taken: boolean;
}

/**
 * One day of a member's availability.
 *
 * `free` and `taken` are counts rather than something each island recomputes: a day chip shows
 * "2 free" and the slot list shows the slots, and those two numbers disagreeing is exactly the
 * class of bug that survives when each island does its own arithmetic.
 */
export interface DayAvailability {
  /** `YYYY-MM-DD`, in UTC. See `availability-source` for why not local. */
  date: string;
  /** `Mon 8 Sep` — the day as a chip shows it. */
  label: string;
  /** `Monday`, for the accessible name; a three-letter chip is not something a screen reader reads. */
  weekday: string;
  free: number;
  taken: number;
  slots: Timeslot[];
}

/** A member's whole publishable calendar: the days, and whether there is anything at all. */
export interface Calendar {
  memberId: string;
  days: DayAvailability[];
  /** The first day holding at least one free slot, or `null` when the member is fully booked. */
  firstOpenDate: string | null;
  /** Total free slots across the horizon — the one number the profile header shows. */
  freeCount: number;
}

/** The empty calendar. A designed state: half the directory publishes no availability at all. */
export function emptyCalendar(memberId = ''): Calendar {
  return { memberId, days: [], firstOpenDate: null, freeCount: 0 };
}
