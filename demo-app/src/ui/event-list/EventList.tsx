import type { ClubEvent, EventFilter } from '../../shared/event-types.js';
import { filterEvents } from '../../shared/event-types.js';
import { firstString, type MemberRow } from '../../shared/member-types.js';
import { CheckIcon, DateBlock, EventOwner, FillMeter, KindPill, timeRange } from '../club/event-bits.js';

export interface EventListProps {
  /** Every upcoming event, in time order. */
  events?: ClubEvent[];
  /** Which of them to show. Absent is all. */
  filter?: EventFilter | null;
  /** Who is signed in — their chapter is what the "mine" filter keeps. */
  me?: MemberRow | null;
  /** The events the signed-in member is going to: marked on their rows. */
  myRsvps?: string[];
  /** The event open in the detail panel. */
  selectedEventId?: string | null;
  /** The first answer has not arrived. */
  eventsLoading?: boolean;
  /** A row was picked. The region stores it; the detail panel reads it. */
  onSelect?: (eventId: string) => void;
}

const MONTH_HEAD = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'long', year: 'numeric' });

/**
 * The club's calendar, as a list: grouped by month, one row per event, the ones you are going to
 * marked. Picking a row opens it in the detail panel — the list itself never RSVPs, so there is one
 * place a person says yes, and it is the one that shows what they are saying yes to.
 */
export function EventList({ events = [], filter, me = null, myRsvps = [], selectedEventId = null, eventsLoading = false, onSelect }: EventListProps) {
  const chapter = me ? firstString(me, ['chapter']) ?? null : null;
  const shown = filterEvents(events, filter, chapter);

  if (eventsLoading && events.length === 0) {
    return (
      <div className="cl-evl" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="cl-evl__row cl-evl__row--skel">
            <span className="cl-skel cl-evl__skel-date" />
            <span className="cl-evl__main">
              <span className="cl-skel" style={{ width: '55%' }} />
              <span className="cl-skel" style={{ width: '35%' }} />
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (shown.length === 0) {
    return (
      <div className="cl-evl">
        <p className="cl-state">
          <strong>Nothing on</strong>
          {events.length === 0 ? 'No events are planned yet.' : 'No upcoming event matches these filters.'}
        </p>
      </div>
    );
  }

  const groups: { head: string; items: ClubEvent[] }[] = [];
  for (const e of shown) {
    const head = MONTH_HEAD.format(new Date(e.startsAt));
    const last = groups[groups.length - 1];
    if (last?.head === head) last.items.push(e);
    else groups.push({ head, items: [e] });
  }

  return (
    <div className="cl-evl">
      {groups.map((g) => (
        <section key={g.head} aria-label={g.head}>
          <h2 className="cl-lg cl-evl__month">{g.head}</h2>
          <ul className="cl-evl__list">
            {g.items.map((e) => {
              const going = myRsvps.includes(e.id);
              const on = e.id === selectedEventId;
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    className={`cl-evl__row${on ? ' cl-evl__row--on' : ''}${going ? ' cl-evl__row--going' : ''}`}
                    aria-pressed={on}
                    onClick={() => onSelect?.(e.id)}
                  >
                    <DateBlock iso={e.startsAt} />
                    <span className="cl-evl__main">
                      <span className="cl-evl__title">{e.title}</span>
                      <span className="cl-evl__meta">
                        <KindPill kind={e.kind} />
                        <EventOwner chapter={e.chapter} />
                        <span className="cl-evl__when">{timeRange(e.startsAt, e.minutes)}</span>
                      </span>
                    </span>
                    <span className="cl-evl__side">
                      {going ? (
                        <span className="cl-evl__going">
                          <CheckIcon /> Going
                        </span>
                      ) : null}
                      <FillMeter event={e} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
