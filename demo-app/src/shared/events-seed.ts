// The club's calendar of events, and who has said they are going — the demo's seed, written once.
//
// THE SAME DATA IN THREE PLACES, FROM ONE DESCRIPTION. `supabase/seeds/events.sql` is GENERATED from
// this module (`pnpm --filter @demo-app/app seed:club`); the sandbox build and the lagoon answer from
// it directly. A test regenerates the SQL and fails when the committed file differs, so the live app
// and the sandbox cannot quietly show two different calendars.
//
// DATES MOVE WITH TODAY, for the reason `timeslots.sql` gives: a demo recorded in November that
// lists events "last April" is visibly broken. But they move BY WEEKDAY (see `EventTemplate.weekday`):
// the SQL computes the next such weekday from `current_date`; this module computes the same from the
// UTC date it is handed — never from a clock of its own.
//
// WHO IS GOING is a pure function of the member and the event (a hash, never `Math.random()`), so the
// list is the same for every visitor and every reset. The four sign-in personas are taken OUT of the
// hash and placed by hand, because their screens are the ones a demo walks through.
import { CHAPTERS, memberIdOf } from './chapter-types.js';
import type { ClubEvent, EventKind } from './event-types.js';
import { mix } from './gamification.js';
import type { MemberRow } from './member-types.js';
import { PERSONA_NUMBERS } from './personas.js';

export interface EventTemplate {
  title: string;
  kind: EventKind;
  /** `null` is a whole-club event. */
  chapter: string | null;
  /**
   * WHEN, AS A WEEKDAY: the `weekday` (0 Sunday … 6 Saturday) of the `week`-th week from today. Week 0
   * is the next such weekday (today included); -1 is the one before that.
   *
   * NOT A DAY OFFSET, and that was a finding: offsets from today put "Saturday garden morning" on a
   * Wednesday, and a chapter that "meets Tuesdays" held its meetup on a Saturday — right on one date,
   * wrong on every other. A fresh-eyes review of the rendered screens caught it; no check could,
   * because nothing contradicted itself. Now an event named for a day IS on that day, whatever today is.
   */
  weekday: number;
  week: number;
  /** UTC hour and minute it starts. A chapter meetup starts when the chapter says it meets. */
  at: [number, number];
  minutes: number;
  capacity: number;
  /** Where. Absent means the chapter's usual venue. */
  venue?: string;
  host: string;
  /** No season and no month in titles or blurbs: the calendar moves with today, the words would not. */
  blurb: string;
  /** Out of 100: how likely a member of the pool is to have RSVPed. 0 is an event nobody has booked yet. */
  pull: number;
  /** Personas going, by membership number. */
  personas?: string[];
}

const DENNIS = '702564';
const GUIDO = '702504';
const RICH = '702506';

const SUN = 0, MON = 1, TUE = 2, WED = 3, THU = 4, FRI = 5, SAT = 6;

export const EVENT_TEMPLATES: EventTemplate[] = [
  { title: 'General meeting', kind: 'meetup', chapter: null, weekday: TUE, week: -1, at: [18, 30], minutes: 90, capacity: 80, venue: 'Main hall, North Street library', host: '702598', pull: 22, personas: [DENNIS, GUIDO], blurb: 'The season in numbers, the budget, and a vote on the next quests.' },
  { title: 'Lightning talks', kind: 'talk', chapter: 'East chapter', weekday: WED, week: -1, at: [18, 30], minutes: 75, capacity: 30, host: '702633', pull: 55, blurb: 'Five minutes each, no slides over ten. Sign up at the door.' },
  { title: 'Newcomers\u2019 welcome evening', kind: 'social', chapter: null, weekday: WED, week: 0, at: [18, 0], minutes: 120, capacity: 40, venue: 'The cellar, Old Town brewing society', host: '702528', pull: 9, personas: [RICH], blurb: 'Joined this year? Come and meet a member from every chapter. First round is on the club.' },
  { title: 'Coastal walk and talk', kind: 'social', chapter: 'Northwest coastal chapter', weekday: SAT, week: 0, at: [10, 0], minutes: 150, capacity: 20, venue: 'Meet at the coastguard station car park', host: DENNIS, pull: 40, personas: [DENNIS], blurb: 'Six kilometres along the cliff path, with a stop at the lookout. Boots, not trainers.' },
  { title: 'Portfolio review night', kind: 'workshop', chapter: null, weekday: FRI, week: 0, at: [18, 0], minutes: 120, capacity: 16, venue: 'East market hall, mezzanine', host: '702665', pull: 100, blurb: 'Bring one piece of work and get three honest opinions on it. Sixteen seats, and it always fills.' },
  { title: 'Chapter meetup', kind: 'meetup', chapter: 'North chapter', weekday: TUE, week: 0, at: [19, 0], minutes: 90, capacity: 30, host: '702598', pull: 48, blurb: 'The usual: news from the board, then the floor is open.' },
  { title: 'Board games night', kind: 'social', chapter: 'Harbour chapter', weekday: MON, week: 1, at: [18, 0], minutes: 180, capacity: 24, host: '702584', pull: 50, blurb: 'Bring a game you can teach in ten minutes. Tea, biscuits and fierce rivalries.' },
  { title: 'Mentoring circle', kind: 'workshop', chapter: 'Northwest coastal chapter', weekday: THU, week: 1, at: [19, 0], minutes: 90, capacity: 12, venue: 'Online \u2014 link sent the day before', host: '702575', pull: 25, personas: [DENNIS], blurb: 'Three mentors, nine questions. Bring the one you have been putting off asking.' },
  { title: 'Saturday garden morning', kind: 'social', chapter: 'South chapter', weekday: SAT, week: 1, at: [10, 0], minutes: 180, capacity: 25, host: '702630', pull: 38, personas: [GUIDO], blurb: 'Beds to clear and a compost heap to turn. Gloves provided; lunch from the greenhouse kitchen.' },
  { title: 'Reading group: the club\u2019s first ten years', kind: 'talk', chapter: 'University chapter', weekday: TUE, week: 1, at: [17, 30], minutes: 90, capacity: 20, host: '702516', pull: 52, blurb: 'Two founders read from the old minutes book, and take questions after.' },
  { title: 'Chapter meetup', kind: 'meetup', chapter: 'West chapter', weekday: FRI, week: 1, at: [18, 0], minutes: 90, capacity: 20, host: '702667', pull: 60, blurb: 'Small table, long agenda: the next calendar and who is running what.' },
  { title: 'Intro to public speaking', kind: 'workshop', chapter: 'Old town chapter', weekday: THU, week: 2, at: [19, 30], minutes: 120, capacity: 14, host: '702708', pull: 30, personas: [RICH], blurb: 'A safe room to stand up and talk for two minutes. Everyone goes once; nobody is graded.' },
  { title: 'Harbour lights photo walk', kind: 'social', chapter: 'Harbour chapter', weekday: SUN, week: 2, at: [16, 0], minutes: 120, capacity: 18, venue: 'Meet under the harbour clock', host: '702727', pull: 35, blurb: 'Blue hour on the quay. Phones are cameras too.' },
  { title: 'Inter-chapter quiz', kind: 'social', chapter: null, weekday: FRI, week: 2, at: [18, 30], minutes: 150, capacity: 64, venue: 'Main hall, North Street library', host: '702633', pull: 18, personas: [GUIDO, DENNIS], blurb: 'Eight chapters, eight tables, one trophy. Points count towards the Chapter Cup.' },
  { title: 'Chapter meetup', kind: 'meetup', chapter: 'East chapter', weekday: WED, week: 2, at: [18, 30], minutes: 90, capacity: 30, host: '702633', pull: 42, blurb: 'Planning the next round of workshops. Ideas welcome; volunteers more so.' },
  { title: 'Budgeting for a chapter', kind: 'workshop', chapter: null, weekday: TUE, week: 3, at: [18, 0], minutes: 90, capacity: 30, venue: 'Online \u2014 link sent the day before', host: '702710', pull: 0, blurb: 'For chapter leads and anyone who wants to be one: how the club splits its budget, and how to ask for more.' },
  { title: 'Chapter meetup', kind: 'meetup', chapter: 'Northwest coastal chapter', weekday: THU, week: 3, at: [19, 0], minutes: 90, capacity: 25, host: '702507', pull: 30, personas: [DENNIS], blurb: 'The in-person one. Car shares organised on the chapter thread.' },
  { title: 'Garden lights social', kind: 'social', chapter: 'South chapter', weekday: SAT, week: 3, at: [17, 0], minutes: 180, capacity: 35, host: '702630', pull: 44, blurb: 'Something warm to drink, a playlist the chapter voted on, and the greenhouse strung with lights.' },
  { title: 'How the Chapter Cup is scored', kind: 'talk', chapter: null, weekday: WED, week: 4, at: [18, 30], minutes: 60, capacity: 50, venue: 'Online \u2014 link sent the day before', host: '702598', pull: 8, blurb: 'Season points, explained by the people who argue about them. Twenty minutes of questions.' },
  { title: 'Reading list meetup', kind: 'meetup', chapter: 'University chapter', weekday: TUE, week: 4, at: [17, 30], minutes: 120, capacity: 20, host: '702641', pull: 35, blurb: 'Everyone brings one book for the next term\u2019s list, and the chapter votes. Cake provided.' },
];

/** The fixed id of the n-th event, shared by the SQL and the sandbox. */
export const eventIdOf = (n: number) => `00000000-0000-4000-9000-${String(n + 1).padStart(12, '0')}`;

const DAY_MS = 86_400_000;

/**
 * Days from today to an event's date: the next `weekday` (today counts), plus whole weeks. The SQL
 * generator writes the same arithmetic over `current_date` (`club-seed-sql.ts`), so the two agree.
 */
export function dayOffsetOf(t: Pick<EventTemplate, 'weekday' | 'week'>, todayIso: string): number {
  const [y, m, d] = todayIso.slice(0, 10).split('-').map(Number);
  const dow = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1)).getUTCDay();
  return ((t.weekday - dow + 7) % 7) + 7 * t.week;
}

/** The instant an event starts, given today's UTC date. */
export function startsAtOf(t: EventTemplate, todayIso: string): string {
  const [y, m, d] = todayIso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1) + dayOffsetOf(t, todayIso) * DAY_MS + (t.at[0] * 60 + t.at[1]) * 60_000).toISOString();
}

const venueOf = (t: EventTemplate) => t.venue ?? CHAPTERS.find((c) => c.name === t.chapter)?.venue ?? 'To be announced';

/**
 * Who is going to each event: `[eventId, memberId]` pairs.
 *
 * The pool is the event's chapter (every active member, for a club-wide event). Suspended members are
 * never in it — the database refuses their RSVPs, so the seed must not hold one. The personas are
 * placed by hand; everyone else by hash, capped at capacity, in membership-number order so the cap
 * cuts the same rows every time.
 */
export function seedRsvps(members: readonly MemberRow[]): [string, string][] {
  const personas = new Set<string>(PERSONA_NUMBERS);
  const active = members.filter((m) => m.status === 'active');
  const out: [string, string][] = [];
  EVENT_TEMPLATES.forEach((t, i) => {
    const pool = active.filter((m) => !personas.has(String(m.member_no)) && (t.chapter === null || m.chapter === t.chapter));
    const named = (t.personas ?? []).map(memberIdOf);
    const room = t.capacity - named.length;
    const picked = pool
      .filter((m) => mix(Number(m.member_no) * 31 + i * 977) % 100 < t.pull)
      .sort((a, b) => String(a.member_no).localeCompare(String(b.member_no)))
      .slice(0, Math.max(0, room))
      .map((m) => String(m.id));
    for (const id of [...named, ...picked]) out.push([eventIdOf(i), id]);
  });
  return out;
}

/**
 * The events as the backend stores them, for a day: what `events.sql` inserts once `current_date` is
 * that day. `going` is left at 0 — counting is the port's job, over whatever RSVPs exist by then.
 */
export function seedEvents(todayIso: string, members: readonly MemberRow[]): ClubEvent[] {
  const nameOf = (no: string) => {
    const m = members.find((x) => String(x.member_no) === no);
    return m ? `${m.firstname} ${m.surname}` : '';
  };
  return EVENT_TEMPLATES.map((t, i) => ({
    id: eventIdOf(i),
    title: t.title,
    kind: t.kind,
    chapter: t.chapter,
    startsAt: startsAtOf(t, todayIso),
    minutes: t.minutes,
    venue: venueOf(t),
    capacity: t.capacity,
    going: 0,
    host: { id: memberIdOf(t.host), name: nameOf(t.host) },
    blurb: t.blurb,
  }));
}

/** For the SQL generator: the template's venue resolved, without needing the member rows. */
export { venueOf };
