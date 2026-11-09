// An `EventsPort` answered from the seed, in memory — what the sandbox build and the lagoon use.
//
// WHAT IT MUST MATCH, because it stands in for Postgres: the events migration's guard trigger (refuse
// a started event, a suspended member, a full event — in that order), the primary key (an RSVP twice
// is an error), and the port's own contract (time order, counts, attendees in the order they said
// yes). `supabase-port.ts` is the real one; if a rule changes there, change it here too. The unit
// tests drive both rule sets through `events-source`.
import { CHAPTERS } from './chapter-types.js';
import type { Attendee, ClubEvent } from './event-types.js';
import type { EventsPort } from './events-source.js';
import { seedEvents, seedRsvps } from './events-seed.js';
import { firstString, type MemberRow } from './member-types.js';

/** Where the RSVPs live between calls. Memory by default; the sandbox hands in localStorage. */
export interface RsvpStore {
  load(): [string, string][] | null;
  save(rows: [string, string][]): void;
}

export interface SeedEventsPortOptions {
  members: readonly MemberRow[];
  /** The instant the port treats as now: what "started" and "upcoming" are measured against. */
  now: () => string;
  latencyMs?: number;
  store?: RsvpStore;
}

const refuse = (reason: string) => new Error(`rsvp_refused:${reason}`);

export function seedEventsPort({ members, now, latencyMs = 0, store }: SeedEventsPortOptions): EventsPort {
  const settle = <T,>(value: T): Promise<T> =>
    latencyMs > 0 ? new Promise((r) => setTimeout(() => r(value), latencyMs)) : Promise.resolve(value);
  const fail = (err: Error): Promise<never> =>
    latencyMs > 0 ? new Promise((_, j) => setTimeout(() => j(err), latencyMs)) : Promise.reject(err);

  // The calendar is generated for the day the port is first asked, like `current_date` at seed time.
  const events = seedEvents(now().slice(0, 10), members);
  let rows: [string, string][] = store?.load() ?? seedRsvps(members);
  const byId = new Map(members.map((m) => [String(m.id), m]));
  const persist = () => store?.save(rows);

  const goingTo = (eventId: string) => rows.filter(([e]) => e === eventId).length;
  const withCount = (e: ClubEvent): ClubEvent => ({ ...e, going: goingTo(e.id) });

  return {
    async upcoming(fromIso) {
      return settle(events.filter((e) => e.startsAt >= fromIso).sort((a, b) => a.startsAt.localeCompare(b.startsAt)).map(withCount));
    },
    async rsvpsOf(memberId, fromIso) {
      const upcoming = new Set(events.filter((e) => e.startsAt >= fromIso).map((e) => e.id));
      return settle(rows.filter(([e, m]) => m === memberId && upcoming.has(e)).map(([e]) => e));
    },
    async attendees(eventId) {
      const who: Attendee[] = [];
      for (const [e, m] of rows) {
        if (e !== eventId) continue;
        const row = byId.get(m);
        if (!row) continue;
        const first = firstString(row, ['firstname']) ?? '';
        const last = firstString(row, ['surname']) ?? '';
        who.push({ id: m, name: `${first} ${last}`.trim(), initials: `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase(), chapter: firstString(row, ['chapter']) ?? null });
      }
      return settle(who);
    },
    async rsvp(eventId, memberId) {
      const ev = events.find((e) => e.id === eventId);
      if (!ev) return fail(refuse('missing'));
      if (ev.startsAt <= now()) return fail(refuse('started'));
      if (byId.get(memberId)?.status === 'suspended') return fail(refuse('suspended'));
      if (rows.some(([e, m]) => e === eventId && m === memberId)) return fail(new Error('duplicate key value violates unique constraint "event_rsvps_pkey"'));
      if (goingTo(eventId) >= ev.capacity) return fail(refuse('full'));
      rows = [...rows, [eventId, memberId]];
      persist();
      return settle(undefined);
    },
    async cancel(eventId, memberId) {
      rows = rows.filter(([e, m]) => !(e === eventId && m === memberId));
      persist();
      return settle(undefined);
    },
  };
}

/** Chapter names in the order the club lists them — what the event filters offer. */
export const CHAPTER_NAMES = CHAPTERS.map((c) => c.name);
