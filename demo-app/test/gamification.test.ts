// Unit tests for the club's game rules.
//
// Every number on the gamified members page comes from these functions, and every one of them renders
// as a plausible screen whichever way a branch goes — a suspended member still levelling up, a level
// bar past 100%, a podium in the wrong order. These pin the rules a person would ask about.
import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  agoLabel,
  clubLevel,
  clubOverview,
  dayNumber,
  isoOf,
  levelOf,
  rankOf,
  memberStats,
  streakOn,
  xpForLevel,
  xpOn,
} from '../src/shared/gamification.js';
import { SEED_MEMBERS } from '../src/shared/seed-members.generated.js';

const member = (over: Record<string, unknown> = {}) => ({
  id: 'm', firstname: 'Ada', surname: 'Test', member_no: '702564', status: 'active', plan: 'standard',
  chapter: 'North chapter', joined: '2022-01-01', ...over,
});

describe('levels', () => {
  it('level 1 is free and each level costs 1,000 more than the last', () => {
    strictEqual(xpForLevel(1), 0);
    strictEqual(xpForLevel(2), 1000);
    strictEqual(xpForLevel(3), 3000);
    strictEqual(levelOf(0), 1);
    strictEqual(levelOf(999), 1);
    strictEqual(levelOf(1000), 2);
  });
  it('progress through a level stays within 0–99', () => {
    for (const m of SEED_MEMBERS.slice(0, 60)) {
      const { progress } = memberStats(m, '2026-09-07');
      ok(progress >= 0 && progress < 100, `progress ${progress}`);
    }
  });
});

describe('xp', () => {
  it('is zero before joining and grows every day after', () => {
    const m = member();
    strictEqual(xpOn(m, dayNumber('2021-12-31')), 0);
    ok(xpOn(m, dayNumber('2022-06-01')) > xpOn(m, dayNumber('2022-05-31')));
  });
  it('earns a fifth more on premium', () => {
    const day = dayNumber('2024-01-01');
    strictEqual(xpOn(member({ plan: 'premium' }), day), Math.round(xpOn(member(), day) * 1.2));
  });
  it('stops a year after joining when the membership is suspended', () => {
    const m = member({ status: 'suspended' });
    strictEqual(xpOn(m, dayNumber('2025-01-01')), xpOn(m, dayNumber('2026-01-01')));
  });
  it('is the same on every call — no clock, no randomness', () => {
    deepStrictEqual(memberStats(member(), '2026-09-07'), memberStats(member(), '2026-09-07'));
  });
});

describe('streaks', () => {
  it('a suspended membership has none', () => {
    strictEqual(streakOn(member({ status: 'suspended' }), dayNumber('2026-09-07')), 0);
  });
  it('a running streak is one longer the next day, or broken to 0', () => {
    for (const m of SEED_MEMBERS.slice(0, 80)) {
      const d = dayNumber('2026-09-07');
      const a = streakOn(m, d);
      const b = streakOn(m, d + 1);
      ok(b === a + 1 || b === 0, `${String(m.member_no)}: ${a} then ${b}`);
    }
  });
});

describe('the club', () => {
  it('levels up on club XP, and the bar reads like its label', () => {
    deepStrictEqual(clubLevel(1231), { level: 7, xp: 1231, next: 1400, progress: 88 });
    strictEqual(clubLevel(0).level, 1);
    strictEqual(clubLevel(1400).level, 8);
  });
  it('counts the seed the way the directory does', () => {
    const o = clubOverview(SEED_MEMBERS, '2026-09-07');
    strictEqual(o.members, 240);
    strictEqual(o.premium + o.standard, 240);
    strictEqual(o.chapters, 8);
    strictEqual(o.founded, 2019);
  });
  it('ranks the podium and the cup highest first', () => {
    const o = clubOverview(SEED_MEMBERS, '2026-09-07');
    strictEqual(o.highScores.length, 3);
    ok(o.highScores[0]!.xp >= o.highScores[1]!.xp && o.highScores[1]!.xp >= o.highScores[2]!.xp);
    ok(o.cup.every((c, i) => i === 0 || o.cup[i - 1]!.points >= c.points));
    strictEqual(o.cup[0]!.short, o.cup[0]!.chapter.replace(/ chapter$/, ''));
  });
  it('the feed tells three different kinds of story when it can', () => {
    const kinds = new Set(clubOverview(SEED_MEMBERS, '2026-09-07').unlocks.map((u) => u.kind));
    strictEqual(kinds.size, 3);
  });
  it('the quest never shows as already complete', () => {
    for (let d = 0; d < 21; d++) {
      const { quest } = clubOverview(SEED_MEMBERS, isoOf(dayNumber('2026-09-07') + d));
      ok(quest.progress < quest.goal, `${quest.title}: ${quest.progress}/${quest.goal}`);
      ok(quest.daysLeft >= 1 && quest.daysLeft <= 7);
    }
  });
});

describe('rankOf', () => {
  it('names the level bands, and every member starts a Rookie', () => {
    deepStrictEqual([1, 2, 3, 6, 7, 10, 11, 13, 14, 20].map(rankOf), ['Rookie', 'Rookie', 'Member', 'Member', 'Regular', 'Regular', 'Veteran', 'Veteran', 'Legend', 'Legend']);
  });
});

describe('agoLabel', () => {
  it('says it the way a feed does', () => {
    deepStrictEqual([0, 1, 4].map(agoLabel), ['today', 'yesterday', '4 days ago']);
  });
});
