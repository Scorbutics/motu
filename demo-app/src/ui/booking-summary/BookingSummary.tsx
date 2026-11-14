import type { MotuFit } from '@motujs/core';
import type { Timeslot } from '../../shared/availability-types.js';
import { SLOT_KIND_LABELS } from '../../shared/availability-types.js';
import type { MemberRow } from '../../shared/member-types.js';
import { firstString } from '../../shared/member-types.js';

export interface BookingSummaryProps {
  /** Whose time is being booked. Absent is a designed state: the route has not resolved yet. */
  member?: MemberRow | null;
  /** The day being looked at (`YYYY-MM-DD`, UTC). Chosen by the day island; READ here, never written. */
  selectedDay?: string | null;
  /** The time picked on it. Chosen by the slot island; READ here, never written. */
  selectedSlot?: Timeslot | null;
  /** Injected footprint, for the fit axis. */
  fit?: MotuFit;
}

// Formatted by hand, in UTC, for the reason `availability-source` gives: `Intl` reads the runtime's
// locale and timezone, and a summary that says a different day in CI than on a laptop is a diff that
// is not a change. The slots are grouped by UTC day, so they are named in UTC too.
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `Thursday 10 Sep`, or `undefined` for anything that is not a `YYYY-MM-DD`. */
function dayName(date: string | null | undefined): string | undefined {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  const at = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(at.getTime())) return undefined;
  return `${WEEKDAYS[at.getUTCDay()]} ${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]}`;
}

function hhmm(at: Date): string {
  return `${String(at.getUTCHours()).padStart(2, '0')}:${String(at.getUTCMinutes()).padStart(2, '0')}`;
}

/** PROBED, NOT TRUSTED: a key holding something of another shape is "nothing picked", not a crash. */
function asSlot(value: unknown): Timeslot | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const slot = value as Partial<Timeslot>;
  if (typeof slot.startsAt !== 'string' || Number.isNaN(new Date(slot.startsAt).getTime())) return undefined;
  if (!slot.kind || !(slot.kind in SLOT_KIND_LABELS)) return undefined;
  return slot as Timeslot;
}

/**
 * What has been picked so far, said back in full: whose time, which day, which slot.
 *
 * A PURE PROJECTION. It confirms a choice; it never makes one — the day and the slot belong to the
 * calendar islands beside it, so this component has no callback and claims no key. That is also why
 * there is no "Book" button: booking is not something this region declares yet, and a button that
 * does nothing is worse than none.
 *
 * FOUR STATES, IN THE ORDER A PERSON REACHES THEM: no member, a member and no day, a day and no time,
 * a time. A slot on a day OTHER than the one being looked at is not confirmed — the summary follows
 * the day the person is looking at, and says to pick a time on it.
 */
export function BookingSummary({ member, selectedDay, selectedSlot, fit }: BookingSummaryProps) {
  void fit;
  const firstName = firstString(member ?? {}, ['firstname']);
  const name = [firstName, firstString(member ?? {}, ['surname'])].filter(Boolean).join(' ');
  const day = dayName(selectedDay);
  const picked = asSlot(selectedSlot);
  const slot = picked && (!day || picked.startsAt.slice(0, 10) === selectedDay) ? picked : undefined;

  if (!name) {
    return (
      <section className="cl-bs cl-bs--idle" aria-label="Booking summary">
        <h2 className="cl-lg cl-bs__title">Your booking</h2>
        <p className="cl-bs__hint">Choose a member to book time with.</p>
      </section>
    );
  }

  // A SUSPENDED MEMBERSHIP CANNOT BE BOOKED (the seed publishes nothing for one), so inviting a pick
  // here would ask for something the calendar beside it can never offer.
  if (member?.status === 'suspended') {
    return (
      <section className="cl-bs cl-bs--idle" aria-label="Booking summary">
        <h2 className="cl-lg cl-bs__title">{firstName || name} can't be booked</h2>
        <p className="cl-bs__hint">A suspended membership takes no bookings.</p>
      </section>
    );
  }

  if (!slot) {
    return (
      <section className="cl-bs cl-bs--idle" aria-label="Booking summary">
        <h2 className="cl-lg cl-bs__title">Book time with {firstName || name}</h2>
        <p className="cl-bs__hint">
          {day ? `Pick a time on ${day}.` : `Pick a day in ${firstName || name}'s calendar to see their free times.`}
        </p>
      </section>
    );
  }

  const start = new Date(slot.startsAt);
  const end = new Date(start.getTime() + slot.minutes * 60_000);
  const slotDay = dayName(slot.startsAt.slice(0, 10)) ?? '';
  return (
    <section
      className="cl-bs cl-bs--picked"
      aria-label={`Booking summary: ${SLOT_KIND_LABELS[slot.kind]} with ${name}`}
    >
      <h2 className="cl-lg cl-bs__title">
        {SLOT_KIND_LABELS[slot.kind]} with {name}
      </h2>
      <dl className="cl-bs__facts">
        <div className="cl-bs__fact">
          <dt className="cl-label">Day</dt>
          <dd>{slotDay}</dd>
        </div>
        <div className="cl-bs__fact">
          <dt className="cl-label">Time</dt>
          <dd>
            {hhmm(start)}–{hhmm(end)} UTC
          </dd>
        </div>
        <div className="cl-bs__fact">
          <dt className="cl-label">Length</dt>
          <dd>{slot.minutes} min</dd>
        </div>
      </dl>
    </section>
  );
}
