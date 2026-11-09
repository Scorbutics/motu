// The sandbox's backend: the same ports, answered in the browser.
//
// WHAT THIS IS. The public sandbox has no server, so the ports that `supabase-port.ts` answers with
// PostgREST are answered here from the committed seed. Everything above the port — the sources, the
// transport, the islands, the regions — is the same code the real app runs. This file is the only
// thing that differs, which is the same swap the lagoon makes and the same seam the design is built
// around.
//
// WHAT IT MUST MATCH, because a sandbox that behaves differently from the app is a demo of something
// else: the filters (`ilike` substrings on email/names, exact on status/plan), the order (surname
// then firstname), the paging (`range` inclusive), `byId` answering null for a missing row, and the
// timeslot rules in `supabase/seeds/timeslots.sql`. If one of those changes, change it here too.
import type { AvailabilityPort, MembersPort, TimeslotRow } from 'demo-app';
import { SEED_MEMBERS, seedMembersPort, seedEventsPort } from 'demo-app';
import type { EventsPort, RsvpStore } from 'demo-app';

type Row = Record<string, unknown>;

/** A tick of latency, so loading states render as they do against a real backend. */
const LATENCY_MS = 120;
const settle = <T,>(value: T): Promise<T> => new Promise((r) => setTimeout(() => r(value), LATENCY_MS));

/**
 * The members half lives in `demo-app` (`seed-members-port.ts`), because the lagoon answers the
 * members region with the same rows and the same filter — one implementation, so the sandbox and the
 * preview cannot disagree about who is in the directory.
 */
export function browserMembersPort(): MembersPort {
  return seedMembersPort(SEED_MEMBERS, LATENCY_MS);
}

const HOURS = [9, 11, 14, 16] as const;
const MINUTES: Record<number, number> = { 9: 30, 11: 60, 14: 30, 16: 45 };
const KIND: Record<number, string> = { 9: 'intro', 11: 'workshop', 14: 'intro', 16: 'mentoring' };
const DAY_MS = 86_400_000;

/**
 * `supabase/seeds/timeslots.sql`, run at the moment of asking. Generated from today (UTC, like the
 * database's `current_date`) so the calendar never drifts into the past, and keyed only on member_no
 * and the day offset so it is the same calendar for every visitor on a given day.
 */
function timeslotsFor(member: Row): TimeslotRow[] {
  const no = Number(member.member_no);
  // Same rules as the SQL seed: even numbers publish, suspended members do not, and a member_no
  // ending in 6 is fully booked.
  if (no % 2 !== 0 || member.status !== 'active') return [];
  const booked = no % 10 === 6;
  const today = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
  const out: TimeslotRow[] = [];
  for (let d = 0; d <= 20; d++) {
    const day = today + d * DAY_MS;
    const dow = new Date(day).getUTCDay();
    if (dow < 1 || dow > 5) continue;
    if ((Math.floor(no / 2) + d) % 4 === 0) continue;
    for (const h of HOURS) {
      if (d > 10 && h >= 14 && (no + d) % 2 === 0) continue;
      const startsAt = new Date(day + h * 3_600_000).toISOString();
      out.push({ id: `${member.id}@${startsAt}`, starts_at: startsAt, minutes: MINUTES[h]!, kind: KIND[h]!, taken: booked || (no + d * 7 + h) % 3 === 0 });
    }
  }
  return out;
}

export function browserAvailabilityPort(): AvailabilityPort {
  return {
    async forMember(memberId, fromISO) {
      const member = SEED_MEMBERS.find((m) => m.id === memberId) as Row | undefined;
      return settle(member ? timeslotsFor(member).filter((s) => s.starts_at >= fromISO).slice(0, 400) : []);
    },
  };
}

/**
 * The events half, from the seed — and the sandbox's ONE write. RSVPs are kept in this browser's
 * localStorage, so a visitor who says yes sees it on the next page and the next visit, and nobody
 * else does: there is no server for it to go to. Guarded, because storage can be blocked (private
 * windows, previews) and the page must still work, merely forgetting on reload.
 */
const RSVP_KEY = 'motu-club:rsvps';
const rsvpStore: RsvpStore = {
  load() {
    try {
      const raw = localStorage.getItem(RSVP_KEY);
      const rows = raw ? (JSON.parse(raw) as unknown) : null;
      return Array.isArray(rows) ? (rows as [string, string][]) : null;
    } catch {
      return null;
    }
  },
  save(rows) {
    try {
      localStorage.setItem(RSVP_KEY, JSON.stringify(rows));
    } catch {
      /* storage refused: the RSVP holds until reload */
    }
  },
};

export function browserEventsPort(): EventsPort {
  return seedEventsPort({ members: SEED_MEMBERS, now: () => new Date().toISOString(), latencyMs: LATENCY_MS, store: rsvpStore });
}
