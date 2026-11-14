import type { ReactNode } from 'react';
import type { MotuFit } from '@motujs/core';
import type { Calendar, DayAvailability, Timeslot } from '../../shared/availability-types.js';
import { SLOT_KIND_LABELS } from '../../shared/availability-types.js';

export interface CalendarSlotsProps {
  /** The member's published calendar. READ, never written: the host feeds it from the source. */
  calendar?: Calendar;
  /**
   * The day whose times are listed (`YYYY-MM-DD`). READ, NEVER WRITTEN — `calendar-days` owns the
   * choice of day, and this list moving it "helpfully" would be the second writer the region refuses.
   */
  selectedDay?: string | null;
  /** The slot picked so far. The whole `Timeslot`, so a reader that does not bind `calendar` can show it. */
  selectedSlot?: Timeslot | null;
  /** A free time was picked. The region stores it as `selectedSlot`. */
  onSlotSelected?: (slot: Timeslot) => void;
  /** Injected footprint, for the fit axis. */
  fit?: MotuFit;
}

/** `09:00`, in UTC — the same clock the source groups days by (`availability-source.ts`). */
function timeOf(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '—';
  return `${String(at.getUTCHours()).padStart(2, '0')}:${String(at.getUTCMinutes()).padStart(2, '0')}`;
}

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="cl-cs cl-block" aria-label="Times">
      <h2 className="cl-lg cl-cs__title">{title}</h2>
      {children}
    </section>
  );
}

/**
 * The times on the chosen day, and the one control that picks a slot.
 *
 * FOUR STATES, ALL DESIGNED: no day chosen yet (the page's resting state), a day the calendar does
 * not hold, a day whose every slot is taken, and a day with free times. Taken slots are shown
 * DISABLED, never hidden — the table keeps them for the same reason (see `Timeslot.taken`).
 *
 * It renders from DEFAULTS ALONE: every prop optional, and the calendar is PROBED rather than
 * trusted, so a key holding something of another shape renders the empty state, not a crash.
 */
export function CalendarSlots({ calendar, selectedDay, selectedSlot, onSlotSelected, fit }: CalendarSlotsProps) {
  void fit;
  const days: DayAvailability[] = Array.isArray(calendar?.days) ? calendar.days : [];

  if (!selectedDay) {
    return (
      <Shell title="Times">
        <p className="cl-cs__note">Pick a day to see its times.</p>
      </Shell>
    );
  }

  const day = days.find((d) => d.date === selectedDay);
  if (!day || !Array.isArray(day.slots) || day.slots.length === 0) {
    return (
      <Shell title="Times">
        <p className="cl-cs__note">No times published for {day?.label ?? selectedDay}.</p>
      </Shell>
    );
  }

  const free = day.slots.filter((s) => !s.taken).length;
  return (
    <Shell title={`Times on ${day.label}`}>
      <p className={`cl-cs__count${free === 0 ? ' cl-cs__count--full' : ''}`}>
        {free === 0 ? `Every time on ${day.weekday} is taken` : `${free} of ${day.slots.length} free`}
      </p>
      <ul className="cl-cs__list">
        {day.slots.map((slot) => {
          const picked = selectedSlot?.id === slot.id;
          const kind = SLOT_KIND_LABELS[slot.kind] ?? slot.kind;
          return (
            <li key={slot.id}>
              <button
                type="button"
                className={`cl-btn cl-cs__slot${picked ? ' cl-cs__slot--picked' : ''}`}
                disabled={slot.taken}
                aria-pressed={picked}
                aria-label={`${timeOf(slot.startsAt)}, ${kind}, ${slot.minutes} minutes${slot.taken ? ', taken' : ''}`}
                onClick={() => onSlotSelected?.(slot)}
              >
                <span className="cl-cs__time">{timeOf(slot.startsAt)}</span>
                <span className="cl-cs__kind">{kind}</span>
                <span className="cl-cs__mins">{slot.minutes} min</span>
                {slot.taken ? <span className="cl-cs__taken">Taken</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </Shell>
  );
}
