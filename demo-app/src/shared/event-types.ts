// The vocabulary of the club's events, typed once so every seam agrees.
//
// Anchored to the TABLE (`events`: title, kind, chapter, starts_at, minutes, venue, capacity, host_id,
// blurb, and `event_rsvps`), the same direction `availability-types.ts` takes: a renamed column fails
// the build here instead of previewing last month's shape.

/** What an event is. The four the table's CHECK constraint allows, and no more. */
export type EventKind = 'meetup' | 'workshop' | 'social' | 'talk';

export const EVENT_KIND_LABELS: Record<EventKind, string> = {
  meetup: 'Meetup',
  workshop: 'Workshop',
  social: 'Social',
  talk: 'Talk',
};

/** One event, as the source hands it to the islands. */
export interface ClubEvent {
  id: string;
  title: string;
  kind: EventKind;
  /** The chapter that runs it, or `null` for a whole-club event. Spelled as `members.chapter`. */
  chapter: string | null;
  /** ISO instant. Islands format it; they never parse it into their own notion of a day. */
  startsAt: string;
  minutes: number;
  venue: string;
  capacity: number;
  /** RSVPs so far, everyone's. */
  going: number;
  host: { id: string; name: string } | null;
  blurb: string;
}

/** Someone who said they are going — what the detail panel shows. */
export interface Attendee {
  id: string;
  name: string;
  initials: string;
  chapter: string | null;
}

/**
 * Why an RSVP was refused. The database's guard trigger says which (see the events migration); the
 * source maps its message to one of these, so an island renders a sentence rather than an SQL error.
 */
export type RsvpRefusal = 'full' | 'suspended' | 'started' | 'signed-out' | 'failed';

export const RSVP_REFUSAL_TEXT: Record<RsvpRefusal, string> = {
  full: 'This event is full.',
  suspended: 'A suspended membership cannot RSVP.',
  started: 'This event has already started.',
  'signed-out': 'Sign in as a member to RSVP.',
  failed: 'The RSVP did not go through. Try again.',
};

/** Where an RSVP stands while the backend answers. One event at a time: the button that was pressed. */
export interface RsvpState {
  /** The event whose RSVP is on its way, or `null`. */
  pending: string | null;
  /** The last refusal, and which event it was for. Cleared by the next attempt. */
  error: { eventId: string; reason: RsvpRefusal } | null;
}

export const IDLE_RSVP: RsvpState = { pending: null, error: null };

/** What the event filter tabs pick: everything, the signed-in member's chapter, or the club-wide ones. */
export interface EventFilter {
  scope: 'all' | 'mine' | 'club';
  kind?: EventKind | null;
}

export const ALL_EVENTS: EventFilter = { scope: 'all', kind: null };

/** The events a filter keeps. One function, so the tabs' counts and the list cannot disagree. */
export function filterEvents(events: readonly ClubEvent[], filter: EventFilter | null | undefined, myChapter: string | null): ClubEvent[] {
  const f = filter ?? ALL_EVENTS;
  return events.filter((e) => {
    if (f.kind && e.kind !== f.kind) return false;
    if (f.scope === 'club') return e.chapter === null;
    if (f.scope === 'mine') return e.chapter === null || (myChapter !== null && e.chapter === myChapter);
    return true;
  });
}

/** Spots left. Never negative: a seed or a race can overfill, and "-1 spots" is not a sentence. */
export const spotsLeft = (e: ClubEvent) => Math.max(0, e.capacity - e.going);
