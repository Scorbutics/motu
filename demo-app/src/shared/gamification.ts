// The club's game: XP, levels, streaks, the Chapter Cup, the weekly quest and what was unlocked.
//
// NO BACKEND HOLDS ANY OF THIS — the members table has names, plans, chapters and joining dates, and
// nothing else. So every number here is a PURE, DETERMINISTIC function of a member row and a date:
//
//   - the same row and the same day give the same XP in the app, the sandbox and the lagoon, so the
//     preview and the page can never disagree about who is winning;
//   - "today" is an argument (`asOf`), never `new Date()` inside a rule, so evidence pinned to a date
//     renders the same screen next month and a test can walk the calendar;
//   - variety between members comes from a hash of their member number — stable for life, like a
//     temperament — and never from `Math.random()`.
//
// The rules are meant to be legible, because a person will read the screen and ask "why is she level
// 12?": XP grows with every day of membership, at a pace that changes month to month (some months a
// member is busy, some months not), premium members earn a fifth more, and a suspended membership
// stops earning a year in.
import { firstString, type MemberRow } from './member-types.js';

const DAY_MS = 86_400_000;

/** A calendar day as a UTC day number. Rules count whole days, never hours. */
export function dayNumber(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Math.floor(Date.UTC(y!, (m ?? 1) - 1, d ?? 1) / DAY_MS);
}

/** The ISO date (`YYYY-MM-DD`) of a day number. */
export function isoOf(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** Today, as the app means it: the UTC date. The only place a clock is read. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** A 32-bit integer mix. Not cryptographic — it only has to spread member numbers apart. */
export function mix(n: number): number {
  let h = (n ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

const numberOf = (m: MemberRow) => Number(firstString(m, ['member_no', 'memberNo'])) || 0;
const isActive = (m: MemberRow) => m.status !== 'suspended';
const isPremium = (m: MemberRow) => m.plan === 'premium';

/** XP needed to REACH a level. Level 1 is free; each level costs 1,000 more than the one before. */
export function xpForLevel(level: number): number {
  return 500 * (level - 1) * level;
}

/**
 * A member's RANK, named by level: what the card and the profile call where someone stands. Every
 * member starts a Rookie on the day they join.
 */
export function rankOf(level: number): string {
  if (level >= 14) return 'Legend';
  if (level >= 11) return 'Veteran';
  if (level >= 7) return 'Regular';
  if (level >= 3) return 'Member';
  return 'Rookie';
}

/** The level an XP total reaches. */
export function levelOf(xp: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}

/** A member's XP per day during one calendar month: 10 to 55, their busy and quiet months. */
function paceIn(no: number, monthIndex: number): number {
  return 10 + (mix(no * 131 + monthIndex) % 10) * 5;
}

const monthIndexOf = (day: number) => {
  const iso = isoOf(day);
  return Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
};

/**
 * A member's XP at the end of a day.
 *
 * Every day of membership earns that month's pace, premium ×1.2. A suspended membership stopped
 * earning a year after joining — it keeps its history, it does not keep growing. Before the joining
 * date there is nothing.
 */
export function xpOn(m: MemberRow, day: number): number {
  const joinedIso = firstString(m, ['joined']);
  if (!joinedIso) return 0;
  const joined = dayNumber(joinedIso);
  const last = isActive(m) ? day : Math.min(day, joined + 365);
  if (last <= joined) return 0;
  const no = numberOf(m);
  let xp = 0;
  // Walk month by month: a segment of days, each at that month's pace.
  for (let d = joined + 1; d <= last; ) {
    const month = monthIndexOf(d);
    const nextMonth = dayNumber(`${Math.floor((month + 1) / 12)}-${String(((month + 1) % 12) + 1).padStart(2, '0')}-01`);
    const end = Math.min(last, nextMonth - 1);
    xp += (end - d + 1) * paceIn(no, month);
    d = end + 1;
  }
  return Math.round(xp * (isPremium(m) ? 1.2 : 1));
}

/** Whether a member broke their streak on a day. Each member keeps their own rhythm. */
function breaksOn(no: number, day: number): boolean {
  const rhythm = 6 + (mix(no) % 55); // a break every ~6 to ~60 days
  return mix(no * 7919 + day) % rhythm === 0;
}

/**
 * Consecutive active days up to and including `day`. Zero for a suspended membership, and for the
 * two in five members who simply are not playing (a stable trait, from their number).
 */
export function streakOn(m: MemberRow, day: number): number {
  if (!isActive(m)) return 0;
  const no = numberOf(m);
  if (mix(no + 17) % 5 < 2) return 0;
  const joined = dayNumber(firstString(m, ['joined']) ?? isoOf(day));
  let streak = 0;
  for (let d = day; d > joined && streak < 400; d--) {
    if (breaksOn(no, d)) break;
    streak++;
  }
  return streak;
}

/** Everything a members-table row shows about the game. */
export interface MemberStats {
  xp: number;
  level: number;
  /** Progress through the current level, 0–100. */
  progress: number;
  streak: number;
  /** A streak of two weeks or more burns hot. */
  hot: boolean;
}

export function memberStats(m: MemberRow, asOf: string): MemberStats {
  const day = dayNumber(asOf);
  const xp = xpOn(m, day);
  const level = levelOf(xp);
  const from = xpForLevel(level);
  const to = xpForLevel(level + 1);
  const streak = streakOn(m, day);
  return { xp, level, progress: Math.floor(((xp - from) / (to - from)) * 100), streak, hot: streak >= 14 };
}

// ------------------------------------------------------------------------------------ the club ----

/** Member-count milestones — what the "grow the club" quest aims at next. */
export const CLUB_MILESTONES = [0, 10, 25, 50, 100, 150, 200, 300, 500, 800, 1200];

/** The member count the club is growing towards. */
export function nextMilestone(members: number): number {
  return CLUB_MILESTONES.find((m) => m > members) ?? members;
}

/** The club's XP is its members' XP together, in ten-thousands — a number a header has room for. */
export const CLUB_XP_UNIT = 10_000;

/** Club XP needed to REACH a club level. */
export function clubXpForLevel(level: number): number {
  return 25 * level * (level - 1);
}

export interface ClubLevel {
  level: number;
  /** The club's XP: every member's, together, in units of `CLUB_XP_UNIT`. */
  xp: number;
  /** The club XP that reaches the next level. */
  next: number;
  /**
   * `xp / next`, 0–100 — the bar reads the way its label does ("1,231 / 1,400 XP" is 88% full), not
   * the share of the current level's band, which would draw a short bar under a label that is nearly there.
   */
  progress: number;
}

export function clubLevel(xp: number): ClubLevel {
  let level = 1;
  while (clubXpForLevel(level + 1) <= xp) level++;
  const next = clubXpForLevel(level + 1);
  return { level, xp, next, progress: Math.min(100, Math.round((xp / next) * 100)) };
}

export interface Quest {
  title: string;
  progress: number;
  goal: number;
  /** Whole days until the quest week ends (Monday, UTC). */
  daysLeft: number;
  reward: string;
}

export interface Scorer {
  id: string;
  name: string;
  /** "Grace A." — what a podium has room for. */
  short: string;
  initials: string;
  xp: number;
}

export interface CupEntry {
  chapter: string;
  /** "North", for a bar with no room for "chapter". */
  short: string;
  points: number;
}

export type UnlockKind = 'streak' | 'level' | 'anniversary';

export interface Unlock {
  kind: UnlockKind;
  /** Days before `asOf` it happened: 0 today, 1 yesterday. */
  daysAgo: number;
  id: string;
  name: string;
  text: string;
}

/** The whole club's game state on a day — what the members page shows around its table. */
export interface ClubOverview {
  asOf: string;
  members: number;
  premium: number;
  standard: number;
  chapters: number;
  founded: number | null;
  /** Members who joined in the 365 days up to `asOf`. */
  newThisYear: number;
  activeStreaks: number;
  club: ClubLevel;
  quest: Quest;
  highScores: Scorer[];
  cup: CupEntry[];
  unlocks: Unlock[];
}

const nameOf = (m: MemberRow) =>
  [firstString(m, ['firstname']), firstString(m, ['surname'])].filter(Boolean).join(' ') || firstString(m, ['email']) || '—';
const idOf = (m: MemberRow) => firstString(m, ['id']) ?? String(numberOf(m));
export const shortChapter = (chapter: string) => chapter.replace(/\s+chapter$/i, '');

/** The quest of the week: one of three, rotating by ISO week, each measured on the real club. */
function questOf(day: number, o: { activeStreaks: number; premium: number; members: number }): Quest {
  // Day 0 (1970-01-01) was a Thursday; Monday-based weeks start 3 days later.
  const week = Math.floor((day + 3) / 7);
  const daysLeft = 7 - ((day + 3) % 7);
  const roundUp = (n: number, step: number) => Math.max(step, Math.ceil((n + 1) / step) * step);
  const pool: Quest[] = [
    { title: `Reach ${roundUp(o.activeStreaks, 25)} active streaks`, progress: o.activeStreaks, goal: roundUp(o.activeStreaks, 25), daysLeft, reward: 'chapter badge' },
    { title: `Bring premium to ${roundUp(o.premium, 20)} members`, progress: o.premium, goal: roundUp(o.premium, 20), daysLeft, reward: 'gold frame' },
    { title: `Grow the club to ${nextMilestone(o.members)} members`, progress: o.members, goal: nextMilestone(o.members), daysLeft, reward: 'club level-up' },
  ];
  return pool[week % pool.length]!;
}

/** Most recent first, then the rarer kind first. */
const KIND_RANK: Record<UnlockKind, number> = { anniversary: 0, streak: 1, level: 2 };
const STREAK_MILESTONES = [7, 14, 30, 60, 100, 200];

function unlocksOf(rows: readonly MemberRow[], day: number, window = 7): Unlock[] {
  const out: Unlock[] = [];
  for (const m of rows) {
    if (!isActive(m)) continue;
    const joinedIso = firstString(m, ['joined']);
    for (let ago = 0; ago < window; ago++) {
      const d = day - ago;
      const streak = streakOn(m, d);
      if (STREAK_MILESTONES.includes(streak)) {
        out.push({ kind: 'streak', daysAgo: ago, id: idOf(m), name: nameOf(m), text: `hit a ${streak}-day streak.` });
      }
      const level = levelOf(xpOn(m, d));
      if (level > levelOf(xpOn(m, d - 1)) && level >= 5) {
        out.push({ kind: 'level', daysAgo: ago, id: idOf(m), name: nameOf(m), text: `reached Level ${level}.` });
      }
      if (joinedIso && isoOf(d).slice(5) === joinedIso.slice(5, 10) && d > dayNumber(joinedIso)) {
        const years = Number(isoOf(d).slice(0, 4)) - Number(joinedIso.slice(0, 4));
        out.push({ kind: 'anniversary', daysAgo: ago, id: idOf(m), name: nameOf(m), text: `celebrates ${years} year${years === 1 ? '' : 's'} in the club.` });
      }
    }
  }
  return out.sort((a, b) => a.daysAgo - b.daysAgo || KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.name.localeCompare(b.name));
}

/** Days the podium looks back over. A rolling window, so the podium is never empty on the 1st. */
export const HIGH_SCORE_DAYS = 30;

/**
 * The feed's few lines: the newest of each kind first, so three lines are three different stories,
 * then the rest by recency.
 */
function pickUnlocks(all: Unlock[], n: number): Unlock[] {
  const firsts: Unlock[] = [];
  for (const kind of ['anniversary', 'streak', 'level'] as UnlockKind[]) {
    const u = all.find((x) => x.kind === kind);
    if (u) firsts.push(u);
  }
  const rest = all.filter((u) => !firsts.includes(u));
  return [...firsts, ...rest].slice(0, n).sort((a, b) => a.daysAgo - b.daysAgo || KIND_RANK[a.kind] - KIND_RANK[b.kind]);
}

/**
 * The club on a day, from every member row.
 *
 * High scores are the XP earned in the last 30 days, so the podium moves; the Chapter Cup is THIS
 * SEASON's (since 1 January), summed over each chapter's members, in hundreds.
 */
export function clubOverview(allRows: readonly MemberRow[], asOf: string): ClubOverview {
  const day = dayNumber(asOf);
  // THE CLUB AS IT STOOD THAT DAY: a member who joins next week is not in today's club, and counting
  // them would put a future member on today's podium.
  const rows = allRows.filter((m) => {
    const joined = firstString(m, ['joined']);
    return !joined || dayNumber(joined) <= day;
  });
  const windowStart = day - HIGH_SCORE_DAYS;
  const seasonStart = dayNumber(`${asOf.slice(0, 4)}-01-01`) - 1;

  const premium = rows.filter(isPremium).length;
  const chapters = new Map<string, number>();
  let founded: number | null = null;
  let newThisYear = 0;
  let activeStreaks = 0;
  let totalXp = 0;
  const scorers: Scorer[] = [];

  for (const m of rows) {
    const chapter = firstString(m, ['chapter']);
    if (chapter) chapters.set(chapter, (chapters.get(chapter) ?? 0) + Math.max(0, xpOn(m, day) - xpOn(m, seasonStart)));
    const joined = firstString(m, ['joined']);
    if (joined) {
      const year = Number(joined.slice(0, 4));
      if (founded === null || year < founded) founded = year;
      const ago = day - dayNumber(joined);
      if (ago >= 0 && ago < 365) newThisYear++;
    }
    if (streakOn(m, day) > 0) activeStreaks++;
    totalXp += xpOn(m, day);
    const first = firstString(m, ['firstname']) ?? '';
    const last = firstString(m, ['surname']) ?? '';
    scorers.push({
      id: idOf(m),
      name: nameOf(m),
      short: last ? `${first} ${last[0]}.` : first,
      initials: `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase(),
      xp: Math.max(0, xpOn(m, day) - xpOn(m, windowStart)),
    });
  }

  const cup = [...chapters]
    .map(([chapter, xp]) => ({ chapter, short: shortChapter(chapter), points: Math.round(xp / 100) }))
    .sort((a, b) => b.points - a.points || a.chapter.localeCompare(b.chapter));
  const highScores = scorers.sort((a, b) => b.xp - a.xp || a.name.localeCompare(b.name)).slice(0, 3);
  const members = rows.length;

  return {
    asOf,
    members,
    premium,
    standard: members - premium,
    chapters: chapters.size,
    founded,
    newThisYear,
    activeStreaks,
    club: clubLevel(Math.round(totalXp / CLUB_XP_UNIT)),
    quest: questOf(day, { activeStreaks, premium, members }),
    highScores,
    cup,
    unlocks: pickUnlocks(unlocksOf(rows, day), 3),
  };
}

/** "today", "yesterday", "3 days ago". */
export function agoLabel(daysAgo: number): string {
  return daysAgo <= 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago`;
}
