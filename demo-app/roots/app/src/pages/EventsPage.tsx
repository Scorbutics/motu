// The events page — the club's calendar, and the RSVP.
//
// NOTICE WHAT IS NOT HERE: no fetch, no list of events, no "am I going" state, no RSVP handler. The
// calendar, your RSVPs and the answer to pressing the button are the events SOURCE's, installed by the
// region binding; the filter and the open event are islands'. What the page does is the two things
// only a page can: say who is signed in (the app's session), and open the first event when the
// calendar arrives so the detail panel is never empty on a first visit.
import { useEffect, useRef } from 'react';
import type { MemberRow } from 'demo-app';
import { Events } from '../motu/events-region.js';

/** Feeds the session, and opens the soonest event once — a STARTING value, so `seed`, not `provide`. */
function EventsFeed({ me }: { me: MemberRow | null | undefined }) {
  const { events, selectedEventId } = Events.useRegion();
  const opened = useRef(false);
  useEffect(() => {
    // `undefined` is "still resolving": keep whoever was there rather than flashing a guest.
    if (me !== undefined) Events.provide('me', me);
  }, [me]);
  useEffect(() => {
    if (opened.current || selectedEventId || !events?.length) return;
    opened.current = true;
    Events.seed('selectedEventId', events[0]!.id);
  }, [events, selectedEventId]);
  return null;
}

export function EventsPage({ me }: { me: MemberRow | null | undefined }) {
  return (
    <Events.Region>
      <EventsFeed me={me} />
      <div className="cl-events cl-scope motu-root" data-motu-theme="motu">
        <Events.Island slot="events-header" />
        <div className="cl-events__body">
          <section className="cl-events__main cl-card" aria-label="Upcoming events">
            <div className="cl-card__tools">
              <Events.Island slot="event-filters" />
            </div>
            <Events.Island slot="event-list" />
          </section>
          <div className="cl-events__aside">
            <Events.Island slot="event-detail" />
          </div>
        </div>
      </div>
    </Events.Region>
  );
}
