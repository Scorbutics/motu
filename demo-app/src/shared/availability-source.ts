// The availability SOURCE: a member id in, a calendar out.
//
// Same deal as `members-source`: it lives beside the islands rather than in the app root, because
// both the page and anything previewing the region have to reach the same code; and it takes its
// backend as a PORT, so production hands it Supabase and a test hands it a hand-made object. It
// imports nothing from motu and would survive motu being deleted.
//
// THIS FILE IS WHERE THE CALENDAR'S ACTUAL THINKING LIVES, and that is deliberate. Grouping slots
// into days, counting free against taken, deciding which day opens first, clamping the horizon —
// every one of those is a branch that renders to the same screen whichever way it goes, which is
// precisely the class no flow and no snapshot can distinguish. So it is here, in one place, behind
// a two-method port, where a unit test can drive it directly. `availability-source.test.ts` is that
// test, and it exists for the branches below rather than for a coverage number.
import type { Calendar, DayAvailability, SlotKind, Timeslot } from './availability-types.js';
import { emptyCalendar } from './availability-types.js';

/** A row as the backend has it. Snake-cased, because that is what the table is called. */
export interface TimeslotRow {
  id: string;
  starts_at: string;
  minutes: number;
  kind: string;
  taken: boolean;
}

/**
 * What the source needs from a backend, and nothing more.
 *
 * One method. Naming Supabase here would put the vendor in every test and every preview, which is
 * the coupling this interface exists to refuse.
 */
export interface AvailabilityPort {
  /** This member's slots at or after `fromISO`, in time order. */
  forMember(memberId: string, fromISO: string): Promise<TimeslotRow[]>;
}

/** How far ahead the calendar looks. The table holds 21 days; the UI commits to two weeks of it. */
export const HORIZON_DAYS = 14;

/** The kinds the UI can render. A row outside this set is data the app does not understand. */
const KINDS: SlotKind[] = ['intro', 'mentoring', 'workshop'];

/**
 * The UTC calendar date of an instant, as `YYYY-MM-DD`.
 *
 * DELIBERATELY UTC RATHER THAN LOCAL. Grouping by the viewer's local day would make the day a slot
 * belongs to a function of the machine reading it — so a snapshot taken in Paris and one taken in
 * CI disagree about which chip a 23:00 slot sits under, and the diff is a timezone rather than a
 * change. The demo's slots are seeded at 09:00–16:00 UTC, comfortably inside a single day either
 * way; a product with genuinely global availability would carry the member's timezone on the row
 * and group by THAT, which is a schema decision rather than a formatting one.
 */
export function utcDate(iso: string): string {
  return iso.slice(0, 10);
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * `Mon 8 Sep` and `Monday`, formatted by hand rather than by `Intl`.
 *
 * `toLocaleDateString` reads the runtime's locale, which is the same non-determinism as grouping by
 * local time: the chip says "8 sept." in one environment and "Sep 8" in another, and a visual
 * baseline then fails for a reason that is not a change. One language, chosen, is honest about what
 * this demo is.
 */
function labelsFor(date: string): { label: string; weekday: string } {
  const at = new Date(`${date}T00:00:00Z`);
  const weekday = WEEKDAYS[at.getUTCDay()] ?? '';
  return { label: `${weekday.slice(0, 3)} ${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]}`, weekday };
}

/** A row the UI can render, or `null` when the backend sent something this app does not know. */
function toSlot(row: TimeslotRow): Timeslot | null {
  if (!row || typeof row.starts_at !== 'string' || row.starts_at === '') return null;
  // An unknown `kind` is DROPPED rather than rendered with an empty label. The table constrains the
  // column, so reaching this means the schema moved underneath the app — and a slot whose purpose
  // the UI cannot name is worse than one slot fewer.
  if (!KINDS.includes(row.kind as SlotKind)) return null;
  const minutes = Number(row.minutes);
  return {
    id: String(row.id),
    startsAt: row.starts_at,
    minutes: Number.isFinite(minutes) && minutes > 0 ? Math.floor(minutes) : 30,
    kind: row.kind as SlotKind,
    taken: row.taken === true,
  };
}

/**
 * Rows into a calendar: grouped by day, counted, ordered, and clamped to the horizon.
 *
 * Exported separately from the source so the grouping can be tested without a port at all, and so
 * anything holding rows already (a fixture, a recorded capture) can produce the same shape the app
 * renders rather than a second hand-built one.
 */
export function calendarFrom(memberId: string, rows: TimeslotRow[], horizon = HORIZON_DAYS): Calendar {
  const byDate = new Map<string, DayAvailability>();
  for (const row of rows ?? []) {
    const slot = toSlot(row);
    if (!slot) continue;
    const date = utcDate(slot.startsAt);
    let day = byDate.get(date);
    if (!day) {
      day = { date, ...labelsFor(date), free: 0, taken: 0, slots: [] };
      byDate.set(date, day);
    }
    day.slots.push(slot);
    if (slot.taken) day.taken += 1;
    else day.free += 1;
  }

  // SORT EXPLICITLY. The port promises time order and the demo's port delivers it, but a Map's
  // insertion order is then load-bearing on a promise made by someone else's code — and a calendar
  // whose days arrive shuffled renders wrong rather than failing, which is the worst shape of bug.
  const days = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(0, Math.max(0, horizon));
  for (const day of days) day.slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  // The first day with something actually bookable — NOT simply the first day. A day whose slots are
  // all taken is a day the calendar shows and the user cannot use, so opening on it would present a
  // list of disabled buttons as the resting state.
  const firstOpen = days.find((d) => d.free > 0);
  return {
    memberId,
    days,
    firstOpenDate: firstOpen ? firstOpen.date : null,
    freeCount: days.reduce((n, d) => n + d.free, 0),
  };
}

/** The application's own availability source. */
export function availabilitySource(port: AvailabilityPort) {
  return {
    async calendar(memberId: string, now: Date = new Date()): Promise<Calendar> {
      // No member, no question to ask. Returning the empty calendar rather than throwing is what
      // lets the profile render its designed empty state while a route is still resolving.
      if (!memberId) return emptyCalendar('');
      // FROM THE START OF TODAY, not from this instant. Asking from `now` drops a slot at 09:00
      // once the clock passes it, so a calendar opened in the afternoon silently loses the morning
      // and the day's counts stop matching what a colleague sees an hour earlier.
      const fromISO = `${now.toISOString().slice(0, 10)}T00:00:00.000Z`;
      const rows = await port.forMember(memberId, fromISO);
      return calendarFrom(memberId, rows ?? []);
    },
  };
}

export type AvailabilitySource = ReturnType<typeof availabilitySource>;
