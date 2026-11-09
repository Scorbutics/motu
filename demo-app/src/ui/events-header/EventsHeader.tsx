import type { ClubEvent } from '../../shared/event-types.js';
import { firstString, type MemberRow } from '../../shared/member-types.js';
import { CalendarIcon, dateParts } from '../club/event-bits.js';

export interface EventsHeaderProps {
  /** Every upcoming event. Absent renders the shape. */
  events?: ClubEvent[];
  /** The ids of the events the signed-in member is going to. */
  myRsvps?: string[];
  /** Who is signed in. Null or absent is a guest. */
  me?: MemberRow | null;
}

/**
 * The events page's header row: the title with the calendar's size beside it, and YOUR side of it —
 * how many you are going to and which is next. Drawn in the members header's blocks so the two pages
 * read as one app.
 */
export function EventsHeader({ events = [], myRsvps = [], me = null }: EventsHeaderProps) {
  const chapters = new Set(events.flatMap((e) => (e.chapter ? [e.chapter] : []))).size;
  const mine = events.filter((e) => myRsvps.includes(e.id));
  const next = mine[0];
  const first = me ? firstString(me, ['firstname']) : undefined;
  return (
    <header className="cl-head">
      <div className="cl-head__title cl-block">
        <CalendarIcon />
        <h1 className="cl-lg">Events</h1>
        <div className="cl-head__facts">
          {events.length ? `${events.length} upcoming · ${chapters} chapters` : 'What is on'}
          <br />
          <span className="cl-head__pill">Next 5 weeks</span>
        </div>
      </div>
      <div className="cl-head__club cl-block cl-evh__you">
        {me ? (
          <>
            <span className="cl-lg cl-evh__count">
              {mine.length === 0 ? `${first}, nothing booked yet` : `${first}, you're going to ${mine.length}`}
            </span>
            <small>
              {next
                ? `Next: ${next.title} · ${dateParts(next.startsAt).weekday} ${dateParts(next.startsAt).day} ${dateParts(next.startsAt).month}`
                : me.status === 'suspended'
                  ? 'A suspended membership cannot RSVP.'
                  : 'Pick an event and press RSVP.'}
            </small>
          </>
        ) : (
          <>
            <span className="cl-lg cl-evh__count">Browsing as a guest</span>
            <small>Switch to a member in the sidebar to RSVP.</small>
          </>
        )}
      </div>
    </header>
  );
}
