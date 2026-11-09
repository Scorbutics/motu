// How an event is written down, once: its date block, its time range, its kind pill, its fill meter.
// The events page, the detail panel, My club and the chapter pages all draw these, and two copies of
// "how a date looks" would put the 11th on a Tuesday on one screen and a Wednesday on the other.
//
// EVERYTHING IS FORMATTED IN UTC, like the profile calendar: the seed places events at UTC hours, and
// formatting in the viewer's zone would make the lagoon's evidence render differently per machine.
import type { ClubEvent, EventKind } from '../../shared/event-types.js';
import { EVENT_KIND_LABELS, spotsLeft } from '../../shared/event-types.js';
import { shortChapter } from '../../shared/gamification.js';
import { chapterColor } from './club-bits.js';

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...opts });
const DAY = fmt({ day: 'numeric' });
const MONTH = fmt({ month: 'short' });
const WEEKDAY = fmt({ weekday: 'short' });
const LONG = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
const HM = fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export function dateParts(iso: string) {
  const d = new Date(iso);
  return { day: DAY.format(d), month: MONTH.format(d), weekday: WEEKDAY.format(d) };
}

/** "Wednesday 11 November". */
export const longDate = (iso: string) => LONG.format(new Date(iso));

/** "18:00–19:30". */
export function timeRange(iso: string, minutes: number): string {
  const start = new Date(iso);
  return `${HM.format(start)}–${HM.format(new Date(start.getTime() + minutes * 60_000))}`;
}

/** The calendar-page block: weekday over a big day number over the month. */
export function DateBlock({ iso, compact = false }: { iso: string; compact?: boolean }) {
  const p = dateParts(iso);
  return (
    <span className={`cl-date-block${compact ? ' cl-date-block--compact' : ''}`} aria-hidden="true">
      <span className="cl-date-block__wd">{p.weekday}</span>
      <span className="cl-lg cl-date-block__d">{p.day}</span>
      <span className="cl-date-block__m">{p.month}</span>
    </span>
  );
}

export function KindPill({ kind }: { kind: EventKind }) {
  return <span className={`cl-lg cl-kind cl-kind--${kind}`}>{EVENT_KIND_LABELS[kind]}</span>;
}

/** Whose event: a chapter's square and short name, or the club's gold for a whole-club event. */
export function EventOwner({ chapter }: { chapter: string | null }) {
  return (
    <span className="cl-chap">
      <span className="cl-chap__dot" style={{ background: chapter ? chapterColor(chapter) : 'var(--cl-gold)' }} />
      <span className="cl-chap__name">{chapter ? shortChapter(chapter) : 'Whole club'}</span>
    </span>
  );
}

/** "12 of 20 going" over a bar; red once full. */
export function FillMeter({ event }: { event: ClubEvent }) {
  const pct = Math.min(100, Math.round((event.going / event.capacity) * 100));
  const full = spotsLeft(event) === 0;
  return (
    <span className={`cl-fill${full ? ' cl-fill--full' : ''}`}>
      <span className="cl-bar" role="img" aria-label={`${event.going} of ${event.capacity} places taken`}>
        <span className="cl-seg" style={{ width: `${pct}%` }} />
      </span>
      <small>{full ? 'Full' : `${event.going} of ${event.capacity} going`}</small>
    </span>
  );
}

export function CheckIcon({ size = 14 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12.5l5 5L20 6.5" />
    </svg>
  );
}

export function CalendarIcon({ size = 30, stroke = '#FBF3E2' }: { size?: number; stroke?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}
