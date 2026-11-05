// The sandbox's backend: the same three ports, answered in the browser.
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
import type { AvailabilityPort, MemberCriteria, MembersPort, TimeslotRow } from 'demo-app';
import data from './sandbox-data.generated.json';

type Row = Record<string, string | null>;
const MEMBERS = data.members as Row[];

const CONTAINS: (keyof MemberCriteria)[] = ['email', 'firstname', 'surname'];
const EXACT: (keyof MemberCriteria)[] = ['status', 'plan'];

/** A tick of latency, so loading states render as they do against a real backend. */
const settle = <T,>(value: T): Promise<T> => new Promise((r) => setTimeout(() => r(value), 120));

const bySurname = (a: Row, b: Row) =>
  String(a.surname).localeCompare(String(b.surname)) || String(a.firstname).localeCompare(String(b.firstname));

export function browserMembersPort(): MembersPort {
  return {
    async search(criteria, first, perPage) {
      const rows = MEMBERS.filter((m) => {
        for (const key of CONTAINS) {
          const v = criteria[key];
          if (typeof v === 'string' && v.trim() !== '' && !String(m[key] ?? '').toLowerCase().includes(v.trim().toLowerCase())) return false;
        }
        for (const key of EXACT) {
          const v = criteria[key];
          if (typeof v === 'string' && v !== '' && m[key] !== v) return false;
        }
        return true;
      }).sort(bySurname);
      return settle({ rows: rows.slice(first, first + perPage), total: rows.length });
    },
    async byId(id) {
      return settle(MEMBERS.find((m) => m.id === id) ?? null);
    },
  };
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
  if (no % 2 !== 0) return [];
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
      out.push({ id: `${member.id}@${startsAt}`, starts_at: startsAt, minutes: MINUTES[h]!, kind: KIND[h]!, taken: (no + d * 7 + h) % 3 === 0 });
    }
  }
  return out;
}

export function browserAvailabilityPort(): AvailabilityPort {
  return {
    async forMember(memberId, fromISO) {
      const member = MEMBERS.find((m) => m.id === memberId);
      return settle(member ? timeslotsFor(member).filter((s) => s.starts_at >= fromISO).slice(0, 400) : []);
    },
  };
}
