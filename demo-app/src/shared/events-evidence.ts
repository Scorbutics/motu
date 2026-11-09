// The events and the signed-in members the lagoon's evidence speaks — ONE module, imported by the
// islands' scenarios and the regions' flows alike (relative specifiers only: plain node reads these).
//
// NOTHING HERE IS WRITTEN BY HAND. The calendar is the seed's (`events-seed.ts`) on the pinned
// evidence day; the counts and who-is-going are the seed's RSVPs; the members are seed rows. So a
// preview shows the club the app shows, and a renamed field fails the build here.
import type { Attendee, ClubEvent } from './event-types.js';
import { seedEvents, seedRsvps } from './events-seed.js';
import { firstString, type MemberRow } from './member-types.js';
import { SEED_MEMBERS } from './seed-members.generated.js';
import { EVIDENCE_DAY } from './club-evidence.js';

/** The instant the evidence is pinned to: the morning of the members page's evidence day. */
export const EVIDENCE_NOW = `${EVIDENCE_DAY}T08:00:00.000Z`;

export const member = (no: string): MemberRow => SEED_MEMBERS.find((m) => m.member_no === no) as MemberRow;

/** The four personas, as rows. */
export const DENNIS = member('702564');
export const GUIDO = member('702504');
export const RICH = member('702506');
export const KAREN = member('702524');

const RSVPS = seedRsvps(SEED_MEMBERS);

/** Every event still to come on the evidence morning, with the seed's counts — what the list shows. */
export const UPCOMING: ClubEvent[] = seedEvents(EVIDENCE_DAY, SEED_MEMBERS)
  .filter((e) => e.startsAt >= EVIDENCE_NOW)
  .map((e) => ({ ...e, going: RSVPS.filter(([id]) => id === e.id).length }));

export const rsvpsOf = (m: MemberRow): string[] => RSVPS.filter(([, id]) => id === m.id).map(([e]) => e).filter((e) => UPCOMING.some((u) => u.id === e));

/** The event a title names, so evidence reads as the screen does. */
export const eventTitled = (title: string, chapter?: string | null): ClubEvent =>
  UPCOMING.find((e) => e.title === title && (chapter === undefined || e.chapter === chapter)) as ClubEvent;

export function attendeesOf(eventId: string): Attendee[] {
  return RSVPS.filter(([e]) => e === eventId).map(([, id]) => {
    const m = SEED_MEMBERS.find((x) => x.id === id) as MemberRow;
    const first = firstString(m, ['firstname']) ?? '';
    const last = firstString(m, ['surname']) ?? '';
    return { id, name: `${first} ${last}`, initials: `${first[0]}${last[0]}`.toUpperCase(), chapter: firstString(m, ['chapter']) ?? null };
  });
}

export const COASTAL_WALK = eventTitled('Coastal walk and talk');
export const PORTFOLIO = eventTitled('Portfolio review night');
export const BOARD_GAMES = eventTitled('Board games night');
/** Nobody has said yes yet — a real state of the seed, not an edited row. */
export const BUDGETING = eventTitled('Budgeting for a chapter');

/** Sanity, at import: the evidence is only worth something if the seed still has these events. */
for (const [name, e] of Object.entries({ COASTAL_WALK, PORTFOLIO, BOARD_GAMES, BUDGETING })) {
  if (!e) throw new Error(`events-evidence: the seed no longer has the event behind ${name}`);
}
