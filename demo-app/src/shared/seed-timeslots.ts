// A member's bookable slots, by the seed's rules — `supabase/seeds/timeslots.sql`, run at the moment
// of asking. Shared by the sandbox build (`roots/app/src/lib/browser-port.ts`) and the lagoon's
// profile SCREEN, which opens any member the URL names and must show the calendar the app would.
//
// Same rules as the SQL: even member numbers publish, suspended members do not, a number ending in 6
// is fully booked; weekdays only, 21 days from `today`, holes keyed on who and when — never random.
import type { TimeslotRow } from './availability-source.js';
import type { MemberRow } from './member-types.js';

const HOURS = [9, 11, 14, 16] as const;
const MINUTES: Record<number, number> = { 9: 30, 11: 60, 14: 30, 16: 45 };
const KIND: Record<number, string> = { 9: 'intro', 11: 'workshop', 14: 'intro', 16: 'mentoring' };
const DAY_MS = 86_400_000;

/** `today` is a UTC date (`YYYY-MM-DD`) — the database's `current_date`. */
export function seedTimeslots(member: MemberRow, today: string): TimeslotRow[] {
  const no = Number(member.member_no);
  if (no % 2 !== 0 || member.status !== 'active') return [];
  const booked = no % 10 === 6;
  const [y, m, d] = today.slice(0, 10).split('-').map(Number);
  const start = Date.UTC(y!, (m ?? 1) - 1, d ?? 1);
  const out: TimeslotRow[] = [];
  for (let off = 0; off <= 20; off++) {
    const day = start + off * DAY_MS;
    const dow = new Date(day).getUTCDay();
    if (dow < 1 || dow > 5) continue;
    if ((Math.floor(no / 2) + off) % 4 === 0) continue;
    for (const h of HOURS) {
      if (off > 10 && h >= 14 && (no + off) % 2 === 0) continue;
      const startsAt = new Date(day + h * 3_600_000).toISOString();
      out.push({ id: `${member.id}@${startsAt}`, starts_at: startsAt, minutes: MINUTES[h]!, kind: KIND[h]!, taken: booked || (no + off * 7 + h) % 3 === 0 });
    }
  }
  return out;
}
