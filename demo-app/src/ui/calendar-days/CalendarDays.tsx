import type { MotuFit } from '@motujs/core';
import type { Calendar, DayAvailability } from '../../shared/availability-types.js';

export interface CalendarDaysProps {
  /** The member's published availability. READ: the days and their counts come from the source. */
  calendar?: Calendar | null;
  /** The day currently picked (`YYYY-MM-DD`), or nothing yet. This island is the one that moves it. */
  selectedDay?: string | null;
  /** The shape is known before the data is. */
  loading?: boolean;
  /** A day was picked. Emitted as `day-selected`; the region stores it as `selectedDay`. */
  onDaySelected?: (date: string) => void;
  /** Injected footprint, for the fit axis. */
  fit?: MotuFit;
}

/** `Mon 8 Sep` → `8 Sep`, so the accessible name can lead with the whole weekday instead. */
function dayMonth(label: string): string {
  return label.split(' ').slice(1).join(' ');
}

function DayChip({ day, on, onPick }: { day: DayAvailability; on: boolean; onPick?: (date: string) => void }) {
  const free = Number.isFinite(day.free) ? day.free : 0;
  // A BOOKED-OUT DAY IS SHOWN, NEVER HIDDEN, and cannot be picked: it is a day the member works, and
  // dropping it would make the calendar look emptier than it is. Picking it would open a list of
  // nothing but disabled slots, so the chip refuses instead.
  const booked = free === 0;
  const count = booked ? 'Booked' : `${free} free`;
  return (
    <button
      type="button"
      className={`cl-btn cl-cd__day${on ? ' cl-cd__day--on' : ''}${booked ? ' cl-cd__day--booked' : ''}`}
      aria-pressed={on}
      aria-label={`${day.weekday} ${dayMonth(day.label)}, ${booked ? 'fully booked' : count}`}
      disabled={booked || !onPick}
      onClick={() => {
        if (!on) onPick?.(day.date);
      }}
    >
      <span className="cl-lg cl-cd__label">{day.label}</span>
      <span className="cl-cd__count">{count}</span>
    </button>
  );
}

/**
 * The day picker of a member's calendar: one chip per published day, each with its own free count.
 *
 * IT OWNS THE CHOICE OF DAY AND NOTHING ELSE. The counts are the source's (`DayAvailability.free`),
 * never recomputed here, so a chip saying "2 free" and the slot list beside it cannot disagree. It
 * does not pick a day on its own when nothing is selected: an island that wrote its key on mount
 * would be moving region state nobody asked to move.
 *
 * Renders from DEFAULTS ALONE: no calendar is the designed "nothing published" state.
 */
export function CalendarDays({ calendar, selectedDay = null, loading = false, onDaySelected, fit }: CalendarDaysProps) {
  void fit;
  if (loading) {
    return (
      <section className="cl-card cl-cd" aria-busy="true" aria-label="Loading days">
        <div className="cl-table__head cl-lg cl-cd__head">Pick a day</div>
        <div className="cl-cd__grid">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="cl-skel cl-cd__skel" />
          ))}
        </div>
      </section>
    );
  }

  // PROBED, NOT TRUSTED: a key holding something of another shape renders the empty state.
  const days: DayAvailability[] = Array.isArray(calendar?.days) ? calendar.days : [];
  const free = typeof calendar?.freeCount === 'number' && Number.isFinite(calendar.freeCount) ? calendar.freeCount : 0;
  const picked = days.find((d) => d.date === selectedDay);
  // NO CALENDAR AND AN EMPTY ONE ARE DIFFERENT STATES. `null` is the page's resting seed while the
  // route resolves; a calendar with no days is a member who publishes nothing.
  const resolved = calendar != null && typeof calendar === 'object';

  let note: string;
  if (!resolved) note = 'No calendar yet';
  else if (days.length === 0) note = 'No days published';
  else if (free === 0) note = 'Every day is booked';
  else if (picked) note = `${picked.weekday} ${dayMonth(picked.label)} picked`;
  else note = 'No day picked yet';

  return (
    <section className="cl-card cl-cd" aria-label="Pick a day">
      <div className="cl-table__head cl-lg cl-cd__head">
        <span>Pick a day</span>
        <small className="cl-cd__note">{note}</small>
      </div>
      {days.length === 0 ? (
        <p className="cl-cd__empty">
          {resolved ? 'This member publishes no days to choose from.' : 'The days appear once a member is chosen.'}
        </p>
      ) : (
        <div className="cl-cd__grid" role="group" aria-label="Days">
          {days.map((day) => (
            <DayChip key={day.date} day={day} on={day.date === selectedDay} onPick={onDaySelected} />
          ))}
        </div>
      )}
    </section>
  );
}
