import { useEffect, useRef } from 'react';
import type { Attendee, ClubEvent, RsvpState } from '../../shared/event-types.js';
import { IDLE_RSVP, RSVP_REFUSAL_TEXT, spotsLeft } from '../../shared/event-types.js';
import { firstString, type MemberRow } from '../../shared/member-types.js';
import { chapterColor } from '../club/club-bits.js';
import { CheckIcon, FillMeter, KindPill, longDate, timeRange } from '../club/event-bits.js';

export interface EventDetailProps {
  /** Every upcoming event — the panel shows the selected one of them. */
  events?: ClubEvent[];
  /** The event to show. Absent shows a prompt to pick one. */
  selectedEventId?: string | null;
  /** Who is signed in. A guest is told how to RSVP rather than offered a button that cannot work. */
  me?: MemberRow | null;
  /** The events the signed-in member is going to. */
  myRsvps?: string[];
  /** Where an RSVP stands: on its way, or refused and why. */
  rsvp?: RsvpState | null;
  /** Who is going to the selected event. */
  attendees?: Attendee[];
  /** Say yes, or take it back. An INTENT: the backend decides, and the answer comes back as keys. */
  onRsvp?: (detail: { eventId: string; going: boolean }) => void;
  /** Open a member's profile (the host, or someone going). */
  onOpenMember?: (memberId: string) => void;
}

const SHOWN_ATTENDEES = 14;

/**
 * One event, and the one button on the page that says "I'm going".
 *
 * The button's state is entirely the backend's: pending while the RSVP is on its way, "Going" once the
 * source has refetched and found you in the list, the refusal's own sentence when the club said no.
 * Nothing here assumes the yes — a full event is discovered by asking, which is what a real one is.
 *
 * On a phone the panel sits under the list, so picking a row scrolls it into view; on a wide screen it
 * is beside the list and stays where it is.
 */
export function EventDetail({ events = [], selectedEventId = null, me = null, myRsvps = [], rsvp, attendees = [], onRsvp, onOpenMember }: EventDetailProps) {
  const event = events.find((e) => e.id === selectedEventId) ?? null;
  const panel = useRef<HTMLElement>(null);
  const firstSelection = useRef(true);
  useEffect(() => {
    if (firstSelection.current) {
      firstSelection.current = false;
      return;
    }
    if (!selectedEventId || typeof window === 'undefined' || !window.matchMedia?.('(max-width: 899px)').matches) return;
    panel.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, [selectedEventId]);

  if (!event) {
    return (
      <aside className="cl-evd cl-evd--empty" ref={panel} aria-label="Event details">
        <p className="cl-state">
          <strong>Pick an event</strong>
          Choose one from the list to see who is going and to RSVP.
        </p>
      </aside>
    );
  }

  const state = rsvp ?? IDLE_RSVP;
  const going = myRsvps.includes(event.id);
  const pending = state.pending === event.id;
  const refusal = state.error?.eventId === event.id ? state.error.reason : null;
  const full = spotsLeft(event) === 0;
  const suspended = me?.status === 'suspended';
  const meId = me ? firstString(me, ['id']) : undefined;
  // YOU FIRST. You said yes a second ago, so you are last in arrival order — past the faces shown on a
  // busy event, which made "You're going" a claim the panel could not show. Then everyone else, as
  // they arrived.
  const faces = meId ? [...attendees.filter((a) => a.id === meId), ...attendees.filter((a) => a.id !== meId)] : attendees;

  let action;
  if (!me) {
    action = <p className="cl-evd__hint">Switch to a member in the sidebar to RSVP.</p>;
  } else if (going) {
    action = (
      <div className="cl-evd__going">
        <span className="cl-evd__yes">
          <CheckIcon size={16} /> You&rsquo;re going
        </span>
        <button type="button" className="cl-btn cl-btn--plain cl-lg cl-evd__btn" disabled={pending} onClick={() => onRsvp?.({ eventId: event.id, going: false })}>
          {pending ? 'Saving…' : 'Cancel RSVP'}
        </button>
      </div>
    );
  } else {
    // A FULL EVENT OFFERS NO RSVP. It used to say "Full — try anyway": a button inviting an action the
    // database refuses every time, which a fresh-eyes review rightly called out. Counts are refetched
    // after every RSVP on the page, so a place that frees up brings the button back.
    // Once the club has REFUSED for "full", its own sentence below says it — no second hint above it.
    action = full ? (
      refusal === 'full' ? null : <p className="cl-evd__hint">Every place is taken. One opens up when somebody cancels.</p>
    ) : (
      <button
        type="button"
        className="cl-btn cl-btn--red cl-lg cl-evd__btn cl-evd__btn--go"
        disabled={pending || refusal === 'suspended'}
        onClick={() => onRsvp?.({ eventId: event.id, going: true })}
      >
        {pending ? 'Saving…' : 'RSVP — I’m going'}
      </button>
    );
  }

  return (
    <aside className="cl-evd" ref={panel} aria-label="Event details" aria-busy={pending}>
      <div className="cl-evd__band" style={{ background: event.chapter ? chapterColor(event.chapter) : 'var(--cl-ox)' }}>
        <div className="cl-evd__kick">
          <KindPill kind={event.kind} />
          <span>{event.chapter ?? 'Whole club'}</span>
        </div>
        <h2 className="cl-lg cl-evd__title">{event.title}</h2>
        <p className="cl-evd__when">
          {longDate(event.startsAt)} · {timeRange(event.startsAt, event.minutes)}
        </p>
      </div>
      <div className="cl-evd__body">
        <dl className="cl-evd__facts">
          <div>
            <dt className="cl-label">Where</dt>
            <dd>{event.venue}</dd>
          </div>
          <div>
            <dt className="cl-label">Hosted by</dt>
            <dd>
              {event.host ? (
                <button type="button" className="cl-evd__link" onClick={() => onOpenMember?.(event.host!.id)}>
                  {event.host.name}
                </button>
              ) : (
                '—'
              )}
            </dd>
          </div>
        </dl>
        {event.blurb ? <p className="cl-evd__blurb">{event.blurb}</p> : null}
        <FillMeter event={event} />
        {action}
        {refusal ? (
          <p className="cl-evd__refused" role="alert">
            {RSVP_REFUSAL_TEXT[refusal]}
          </p>
        ) : suspended && !going ? (
          <p className="cl-evd__hint">This membership is suspended — the club will refuse an RSVP.</p>
        ) : null}
        <div className="cl-evd__who">
          <h3 className="cl-label">
            {attendees.length === 0 ? 'Nobody has said yes yet' : `${attendees.length} going`}
          </h3>
          {attendees.length ? (
            <ul className="cl-evd__faces">
              {faces.slice(0, SHOWN_ATTENDEES).map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    className={`cl-evd__face${a.id === meId ? ' cl-evd__face--me' : ''}`}
                    title={a.id === meId ? `${a.name} (you)` : a.name}
                    aria-label={a.id === meId ? `${a.name} (you)` : a.name}
                    style={{ background: a.chapter ? chapterColor(a.chapter) : undefined }}
                    onClick={() => onOpenMember?.(a.id)}
                  >
                    {a.initials}
                  </button>
                </li>
              ))}
              {attendees.length > SHOWN_ATTENDEES ? <li className="cl-evd__more">+{attendees.length - SHOWN_ATTENDEES}</li> : null}
            </ul>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
