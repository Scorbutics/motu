// The events SOURCE: who is signed in -> the club's upcoming events, which of them you are going to,
// and what happens when you press RSVP.
//
// It is the application's object, not motu's — plain functions and a subscription, no React, no
// vendor. The page installs it over the Supabase port; the lagoon installs the SAME object over the
// seed through `channelFrom`; the unit tests drive it over a hand-made port. Only the port differs, so
// RSVPing in the lagoon runs exactly the logic it runs in the app: the pending state, the refusal
// mapping, the refetch, and the generation guard.
//
// WHY RSVP IS AN INTENT RATHER THAN AN ISLAND'S WRITE. Whether you are going is the BACKEND's answer
// — the event may have filled a second ago, or your membership may be suspended — so the button asks
// and this source answers: it calls the port, then REFETCHES. An island that wrote `myRsvps` itself
// would be claiming a result only the database can give, and would show you a seat you do not have.
import type { Source } from '@motu/types';
import { firstString, type MemberRow } from './member-types.js';
import { IDLE_RSVP, type Attendee, type ClubEvent, type RsvpRefusal, type RsvpState } from './event-types.js';

/** What the source needs from the world. Postgres in the app; the seed in the sandbox and lagoon. */
export interface EventsPort {
  /** Every event starting at or after `fromIso`, in time order, with its RSVP count. */
  upcoming(fromIso: string): Promise<ClubEvent[]>;
  /**
   * The ids of the events this member is going to that start at or after `fromIso`. UPCOMING ONLY:
   * "you are going to 4" on one page and "5 booked" on another — a past event counted by one of them
   * — is the bug this argument exists to make impossible.
   */
  rsvpsOf(memberId: string, fromIso: string): Promise<string[]>;
  /** Who is going to one event, in the order they said so. */
  attendees(eventId: string): Promise<Attendee[]>;
  /** Say yes. Rejects with a message containing `rsvp_refused:<reason>` when the club says no. */
  rsvp(eventId: string, memberId: string): Promise<void>;
  /** Take it back. */
  cancel(eventId: string, memberId: string): Promise<void>;
}

/** The region keys this source consumes and produces — the slice of a region it touches. */
export interface EventsSourceRegion {
  /** The signed-in member, or null for a guest. HOST-FED (the session). */
  me: MemberRow | null;
  /** The event whose attendees to load. Written by an island in the events region; absent elsewhere. */
  selectedEventId: string | null;
  events: ClubEvent[];
  myRsvps: string[];
  rsvp: RsvpState;
  attendees: Attendee[];
  eventsLoading: boolean;
}

export type EventsKeys = 'events' | 'myRsvps' | 'rsvp' | 'attendees' | 'eventsLoading';

export interface EventsSourceOptions {
  /** The instant "upcoming" is measured from. Injected, so a test and the evidence can pin it. */
  now: () => string;
}

/** The refusal an error carries — the database's guard trigger names it; anything else is a failure. */
export function refusalOf(err: unknown): RsvpRefusal {
  const message = err instanceof Error ? err.message : String(err);
  const m = /rsvp_refused:(full|suspended|started)/.exec(message);
  return (m?.[1] as RsvpRefusal | undefined) ?? 'failed';
}

const EMPTY: Pick<EventsSourceRegion, EventsKeys> = {
  events: [],
  myRsvps: [],
  rsvp: IDLE_RSVP,
  attendees: [],
  eventsLoading: true,
};

/**
 * A port, or something that makes one. The FACTORY form is for a stand-in that holds state: the lagoon
 * installs this source once per view and once per flow, and a single in-memory port shared by all of
 * them would carry one flow's RSVP into the next. Production hands a port — Postgres is the state.
 */
export type EventsPortLike = EventsPort | (() => EventsPort);

export function createEventsSource(portLike: EventsPortLike, { now }: EventsSourceOptions) {
  const port: EventsPort = typeof portLike === 'function' ? portLike() : portLike;
  let state = EMPTY;
  let me: string | null = null;
  let selected: string | null = null;
  // One counter per thing that can race. Switching persona twice quickly must not let the slower
  // answer put the first persona's RSVPs on the second persona's screen; clicking two events quickly
  // must not show the first one's attendees under the second one's title.
  let listGen = 0;
  let mineGen = 0;
  let whoGen = 0;
  let disposed = false;
  const listeners = new Set<() => void>();

  /** A NEW object on change and the SAME one otherwise, so `useSyncExternalStore` can trust it. */
  const set = (next: Partial<typeof state>) => {
    if (disposed) return;
    state = { ...state, ...next };
    listeners.forEach((l) => l());
  };

  const loadEvents = async () => {
    const mine = ++listGen;
    try {
      const events = await port.upcoming(now());
      if (mine === listGen) set({ events, eventsLoading: false });
    } catch (err) {
      console.error('events: list failed', err);
      if (mine === listGen) set({ eventsLoading: false });
    }
  };

  const loadMine = async () => {
    const mine = ++mineGen;
    if (!me) {
      set({ myRsvps: [] });
      return;
    }
    try {
      const ids = await port.rsvpsOf(me, now());
      if (mine === mineGen) set({ myRsvps: ids });
    } catch (err) {
      console.error('events: rsvps failed', err);
    }
  };

  const loadAttendees = async () => {
    const mine = ++whoGen;
    if (!selected) {
      set({ attendees: [] });
      return;
    }
    try {
      const who = await port.attendees(selected);
      if (mine === whoGen) set({ attendees: who });
    } catch (err) {
      console.error('events: attendees failed', err);
      if (mine === whoGen) set({ attendees: [] });
    }
  };

  const api = {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getState: () => state,

    /**
     * Say yes or take it back, then ask again — the counts, your list and the attendees are whatever
     * the backend now says, never what the button assumed.
     *
     * ONE AT A TIME. A second press while the first is on its way is ignored rather than queued: the
     * button is disabled while `pending`, and a double-click that slipped through must not RSVP twice.
     */
    async setGoing(eventId: string, going: boolean) {
      if (state.rsvp.pending) return;
      if (!me) {
        set({ rsvp: { pending: null, error: { eventId, reason: 'signed-out' } } });
        return;
      }
      set({ rsvp: { pending: eventId, error: null } });
      try {
        if (going) await port.rsvp(eventId, me);
        else await port.cancel(eventId, me);
        set({ rsvp: IDLE_RSVP });
      } catch (err) {
        set({ rsvp: { pending: null, error: { eventId, reason: refusalOf(err) } } });
      }
      await Promise.all([loadEvents(), loadMine(), eventId === selected ? loadAttendees() : Promise.resolve()]);
    },

    /** The page's half of what an island asks the host for. The lagoon's channel installs this too. */
    intents: {
      'event-rsvp': (detail: unknown) => {
        const { eventId, going } = (detail ?? {}) as { eventId?: string; going?: boolean };
        if (typeof eventId === 'string') void api.setGoing(eventId, going !== false);
      },
    },

    /** The region keys this source consumes — declared once, for the page and the lagoon alike. */
    inputs: ['me', 'selectedEventId'] as const,
    applyInputs(values: Partial<EventsSourceRegion>) {
      const nextMe = firstString((values.me ?? {}) as MemberRow, ['id']) ?? null;
      const nextSel = (values.selectedEventId as string | null | undefined) ?? null;
      if (nextMe !== me) {
        me = nextMe;
        // A different person: their list, and no stale refusal addressed to the previous one.
        set({ rsvp: IDLE_RSVP });
        void loadMine();
      }
      if (nextSel !== selected) {
        selected = nextSel;
        void loadAttendees();
      }
    },

    /** First load. Separate from `create` so constructing the source never starts a request. */
    start() {
      void loadEvents();
      void loadMine();
      return api;
    },

    dispose() {
      disposed = true;
      listGen++;
      mineGen++;
      whoGen++;
      listeners.clear();
    },
  };
  return api;
}

export type EventsSource = ReturnType<typeof createEventsSource>;

/** The source, as a region refers to it. */
export const eventsSource: Source<EventsSourceRegion, EventsKeys, [EventsPortLike, EventsSourceOptions]> = {
  create: (port, opts) => createEventsSource(port, opts).start(),
  produces: ['events', 'myRsvps', 'rsvp', 'attendees', 'eventsLoading'],
};
