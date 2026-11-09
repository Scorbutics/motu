import type { ClubEvent, RsvpState } from '../../shared/event-types.js';
import { IDLE_RSVP, RSVP_REFUSAL_TEXT } from '../../shared/event-types.js';
import type { MemberRow } from '../../shared/member-types.js';
import { DateBlock, EventOwner, KindPill, timeRange } from '../club/event-bits.js';

export interface MyEventsProps {
  /** Every upcoming event. */
  events?: ClubEvent[];
  /** The ones the signed-in member is going to. */
  myRsvps?: string[];
  /** Who is signed in. A guest has no events to list. */
  me?: MemberRow | null;
  /** Where a cancellation stands. */
  rsvp?: RsvpState | null;
  /** The first answer has not arrived. */
  eventsLoading?: boolean;
  /** Take an RSVP back. The SAME intent the events page sends — answered by the same source. */
  onRsvp?: (detail: { eventId: string; going: boolean }) => void;
  /** Go and find something to do. */
  onBrowse?: () => void;
}

/**
 * Your upcoming events, soonest first, each with a way to say you can no longer make it.
 *
 * Cancelling here and on the events page is ONE intent answered by ONE source, so the two screens
 * cannot disagree about whether you are going: whichever you use, the list is refetched from the
 * backend and both read the same answer.
 */
export function MyEvents({ events = [], myRsvps = [], me = null, rsvp, eventsLoading = false, onRsvp, onBrowse }: MyEventsProps) {
  const mine = events.filter((e) => myRsvps.includes(e.id));
  const state = rsvp ?? IDLE_RSVP;
  return (
    <section className="cl-panel cl-block cl-mine" aria-label="Your events">
      <div className="cl-panel__top">
        <h2 className="cl-lg">Your events</h2>
        {onBrowse ? (
          <button type="button" className="cl-mine__browse" onClick={() => onBrowse()}>
            All events &rsaquo;
          </button>
        ) : null}
      </div>
      {!me ? (
        <p className="cl-empty">Members see the events they are going to here.</p>
      ) : eventsLoading && events.length === 0 ? (
        <p className="cl-empty">Loading your events…</p>
      ) : mine.length === 0 ? (
        <p className="cl-empty">Nothing booked yet. The events page has what is on across every chapter.</p>
      ) : (
        <ul className="cl-mine__list">
          {mine.map((e) => {
            const pending = state.pending === e.id;
            const refused = state.error?.eventId === e.id ? state.error.reason : null;
            return (
              <li key={e.id} className="cl-mine__row">
                <DateBlock iso={e.startsAt} compact />
                <span className="cl-mine__main">
                  <strong>{e.title}</strong>
                  <span className="cl-mine__meta">
                    <KindPill kind={e.kind} />
                    <EventOwner chapter={e.chapter} />
                    <span>{timeRange(e.startsAt, e.minutes)}</span>
                  </span>
                  <span className="cl-mine__venue">{e.venue}</span>
                  {refused ? <span className="cl-evd__refused">{RSVP_REFUSAL_TEXT[refused]}</span> : null}
                </span>
                <button type="button" className="cl-btn cl-btn--plain cl-mine__cancel" disabled={pending} onClick={() => onRsvp?.({ eventId: e.id, going: false })}>
                  {pending ? 'Saving…' : 'Cancel'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
