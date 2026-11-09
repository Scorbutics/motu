// Unit tests for the events source and the seed port that stands in for Postgres.
//
// Every case is a branch that renders to a plausible screen whichever way it goes: a refusal shown as
// a generic failure, the slower of two persona switches winning, a double-click RSVPing twice. A
// region flow drives the source through the screen; this drives it directly, over a hand-made port.
//
// Run with the host's own runner: `pnpm --filter demo-app test`.
import { deepStrictEqual, strictEqual, ok } from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createEventsSource, refusalOf, type EventsPort } from '../src/shared/events-source.js';
import { seedEventsPort } from '../src/shared/seed-events-port.js';
import { EVENT_TEMPLATES, eventIdOf, seedEvents, seedRsvps } from '../src/shared/events-seed.js';
import { CHAPTERS, memberIdOf } from '../src/shared/chapter-types.js';
import { PERSONAS } from '../src/shared/personas.js';
import { SEED_MEMBERS } from '../src/shared/seed-members.generated.js';
import type { ClubEvent } from '../src/shared/event-types.js';
import type { MemberRow } from '../src/shared/member-types.js';

const NOW = '2026-11-08T12:00:00.000Z';
const tick = () => new Promise((r) => setTimeout(r, 0));
const member = (no: string) => SEED_MEMBERS.find((m) => m.member_no === no) as MemberRow;
const DENNIS = member('702564');
const KAREN = member('702524');

function event(id: string, over: Partial<ClubEvent> = {}): ClubEvent {
  return { id, title: id, kind: 'meetup', chapter: null, startsAt: '2026-11-10T18:00:00.000Z', minutes: 60, venue: 'v', capacity: 10, going: 0, host: null, blurb: '', ...over };
}

/** A port whose answers the test releases by hand, so the ORDER they land in is the test's choice. */
function manualPort() {
  const pending: { method: string; arg: string; resolve: (v: unknown) => void; reject: (e: Error) => void }[] = [];
  const call = (method: string, arg: string, ..._rest: unknown[]) => new Promise<never>((resolve, reject) => pending.push({ method, arg, resolve: resolve as (v: unknown) => void, reject }));
  const port: EventsPort = {
    upcoming: (from) => call('upcoming', from),
    rsvpsOf: (id, from) => call('rsvpsOf', id, from),
    attendees: (id) => call('attendees', id),
    rsvp: (e) => call('rsvp', e),
    cancel: (e) => call('cancel', e),
  };
  const take = (method: string, arg?: string) => {
    const i = pending.findIndex((p) => p.method === method && (arg === undefined || p.arg === arg));
    if (i < 0) throw new Error(`no pending ${method}(${arg ?? ''}) — have ${pending.map((p) => `${p.method}(${p.arg})`).join(', ')}`);
    return pending.splice(i, 1)[0]!;
  };
  return { port, take, pending };
}

describe('refusalOf', () => {
  it('reads the guard trigger’s reason out of the database message', () => {
    strictEqual(refusalOf(new Error('rsvp_refused:full')), 'full');
    strictEqual(refusalOf(new Error('new row violates … rsvp_refused:suspended')), 'suspended');
    strictEqual(refusalOf(new Error('rsvp_refused:started')), 'started');
  });
  it('calls anything else a failure rather than guessing', () => {
    strictEqual(refusalOf(new Error('duplicate key value violates unique constraint')), 'failed');
    strictEqual(refusalOf('network down'), 'failed');
  });
});

describe('createEventsSource', () => {
  it('the slower of two persona switches does not win', async () => {
    const { port, take } = manualPort();
    const src = createEventsSource(port, { now: () => NOW });
    src.applyInputs({ me: DENNIS });
    src.applyInputs({ me: KAREN });
    // Karen's answer lands first, Dennis's — the stale one — second.
    take('rsvpsOf', String(KAREN.id)).resolve([]);
    await tick();
    take('rsvpsOf', String(DENNIS.id)).resolve(['e1', 'e2']);
    await tick();
    deepStrictEqual(src.getState().myRsvps, []);
  });

  it('a guest who presses RSVP is told to sign in, and nothing is sent', async () => {
    const { port, pending } = manualPort();
    const src = createEventsSource(port, { now: () => NOW });
    src.applyInputs({ me: null });
    await src.setGoing('e1', true);
    deepStrictEqual(src.getState().rsvp.error, { eventId: 'e1', reason: 'signed-out' });
    ok(!pending.some((p) => p.method === 'rsvp'));
  });

  it('a second press while one is on its way is ignored, not queued', async () => {
    const { port, take, pending } = manualPort();
    const src = createEventsSource(port, { now: () => NOW });
    src.applyInputs({ me: DENNIS });
    take('rsvpsOf').resolve([]);
    const first = src.setGoing('e1', true);
    strictEqual(src.getState().rsvp.pending, 'e1');
    void src.setGoing('e1', true);
    strictEqual(pending.filter((p) => p.method === 'rsvp').length, 1);
    take('rsvp').resolve(undefined);
    await tick();
    take('upcoming').resolve([]);
    take('rsvpsOf').resolve(['e1']);
    await first;
    deepStrictEqual(src.getState().rsvp, { pending: null, error: null });
    deepStrictEqual(src.getState().myRsvps, ['e1']);
  });

  it('a refusal is kept with its reason, and the list is refetched anyway', async () => {
    const { port, take } = manualPort();
    const src = createEventsSource(port, { now: () => NOW });
    src.applyInputs({ me: DENNIS });
    take('rsvpsOf').resolve([]);
    const done = src.setGoing('full-one', true);
    take('rsvp').reject(new Error('rsvp_refused:full'));
    await tick();
    // The count is the backend's — refetched even though nothing changed, because a refusal for
    // "full" means the screen's count was stale.
    take('upcoming').resolve([event('full-one', { going: 10 })]);
    take('rsvpsOf').resolve([]);
    await done;
    deepStrictEqual(src.getState().rsvp.error, { eventId: 'full-one', reason: 'full' });
    strictEqual(src.getState().events[0]?.going, 10);
  });

  it('switching persona clears a refusal addressed to the previous one', async () => {
    const { port, take } = manualPort();
    const src = createEventsSource(port, { now: () => NOW });
    src.applyInputs({ me: KAREN });
    take('rsvpsOf').resolve([]);
    const done = src.setGoing('e1', true);
    take('rsvp').reject(new Error('rsvp_refused:suspended'));
    await tick();
    take('upcoming').resolve([]);
    take('rsvpsOf').resolve([]);
    await done;
    strictEqual(src.getState().rsvp.error?.reason, 'suspended');
    src.applyInputs({ me: DENNIS });
    strictEqual(src.getState().rsvp.error, null);
  });

  it('attendees follow the selected event, and a stale answer is dropped', async () => {
    const { port, take } = manualPort();
    const src = createEventsSource(port, { now: () => NOW });
    src.applyInputs({ me: null, selectedEventId: 'a' });
    src.applyInputs({ me: null, selectedEventId: 'b' });
    take('attendees', 'b').resolve([{ id: 'x', name: 'B person', initials: 'BP', chapter: null }]);
    await tick();
    take('attendees', 'a').resolve([{ id: 'y', name: 'A person', initials: 'AP', chapter: null }]);
    await tick();
    deepStrictEqual(src.getState().attendees.map((a) => a.name), ['B person']);
  });
});

describe('seedEventsPort — the stand-in for the guard trigger', () => {
  const port = () => seedEventsPort({ members: SEED_MEMBERS, now: () => NOW });
  const PORTFOLIO = eventIdOf(EVENT_TEMPLATES.findIndex((t) => t.title === 'Portfolio review night'));
  const AGM = eventIdOf(0);
  const BOARD_GAMES = eventIdOf(EVENT_TEMPLATES.findIndex((t) => t.title === 'Board games night'));

  it('lists only what has not started, in time order, with counts', async () => {
    const list = await port().upcoming(NOW);
    ok(list.length > 10);
    ok(!list.some((e) => e.id === AGM));
    deepStrictEqual(list.map((e) => e.startsAt), [...list.map((e) => e.startsAt)].sort());
    strictEqual(list.find((e) => e.id === PORTFOLIO)?.going, 16);
  });

  it('refuses in the trigger’s order: started, suspended, full', async () => {
    const p = port();
    await p.rsvp(AGM, String(DENNIS.id)).then(() => ok(false), (e: Error) => strictEqual(refusalOf(e), 'started'));
    await p.rsvp(BOARD_GAMES, String(KAREN.id)).then(() => ok(false), (e: Error) => strictEqual(refusalOf(e), 'suspended'));
    await p.rsvp(PORTFOLIO, String(DENNIS.id)).then(() => ok(false), (e: Error) => strictEqual(refusalOf(e), 'full'));
  });

  it('counts only upcoming RSVPs as yours — the past AGM is not "booked"', async () => {
    const ids = await port().rsvpsOf(String(DENNIS.id), NOW);
    ok(!ids.includes(AGM));
    strictEqual(ids.length, 4);
  });

  it('a yes then a no leaves the count where it started', async () => {
    const p = port();
    const before = (await p.upcoming(NOW)).find((e) => e.id === BOARD_GAMES)!.going;
    await p.rsvp(BOARD_GAMES, String(DENNIS.id));
    strictEqual((await p.upcoming(NOW)).find((e) => e.id === BOARD_GAMES)!.going, before + 1);
    ok((await p.rsvpsOf(String(DENNIS.id), NOW)).includes(BOARD_GAMES));
    await p.cancel(BOARD_GAMES, String(DENNIS.id));
    strictEqual((await p.upcoming(NOW)).find((e) => e.id === BOARD_GAMES)!.going, before);
  });
});

describe('the seed', () => {
  const byNo = new Map(SEED_MEMBERS.map((m) => [String(m.member_no), m]));

  it('every host and chapter lead is a real, active member', () => {
    for (const t of EVENT_TEMPLATES) strictEqual(byNo.get(t.host)?.status, 'active', `host ${t.host} of ${t.title}`);
    for (const c of CHAPTERS) {
      const lead = SEED_MEMBERS.find((m) => m.id === c.leadId);
      strictEqual(lead?.status, 'active', `lead of ${c.name}`);
      strictEqual(lead?.chapter, c.name, `lead of ${c.name} belongs to it`);
    }
  });

  it('every chapter name is one members already carry', () => {
    const names = new Set(SEED_MEMBERS.map((m) => m.chapter));
    for (const c of CHAPTERS) ok(names.has(c.name), c.name);
    for (const t of EVENT_TEMPLATES) ok(t.chapter === null || names.has(t.chapter), t.title);
  });

  it('never overfills, never seats a suspended member, never RSVPs twice', () => {
    const rows = seedRsvps(SEED_MEMBERS);
    const seen = new Set<string>();
    for (const [e, m] of rows) {
      ok(!seen.has(`${e}/${m}`), 'duplicate');
      seen.add(`${e}/${m}`);
      ok(SEED_MEMBERS.find((x) => x.id === m)?.status !== 'suspended');
    }
    EVENT_TEMPLATES.forEach((t, i) => ok(rows.filter(([e]) => e === eventIdOf(i)).length <= t.capacity, t.title));
  });

  it('places each persona exactly where the template says', () => {
    const rows = seedRsvps(SEED_MEMBERS);
    for (const p of PERSONAS) {
      const expected = EVENT_TEMPLATES.flatMap((t, i) => ((t.personas ?? []).includes(p.memberNo) ? [eventIdOf(i)] : []));
      deepStrictEqual(rows.filter(([, m]) => m === memberIdOf(p.memberNo)).map(([e]) => e), expected, p.name);
      strictEqual(byNo.get(p.memberNo) && `${byNo.get(p.memberNo)!.firstname} ${byNo.get(p.memberNo)!.surname}`, p.name);
    }
  });
});

describe('the calendar is a calendar, whatever today is', () => {
  // The fresh-eyes review found "Saturday garden morning" on a Wednesday: dates were day offsets from
  // today, right on one date and wrong on the other six. Walk a whole week of "todays".
  const days = ['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14'];
  it('every event lands on its own weekday, and only past events are in the past', () => {
    for (const today of days) {
      const events = seedEvents(today, SEED_MEMBERS);
      EVENT_TEMPLATES.forEach((t, i) => {
        const at = new Date(events[i]!.startsAt);
        strictEqual(at.getUTCDay(), t.weekday, `${t.title} on ${today}`);
        strictEqual(events[i]!.startsAt.slice(0, 10) < today, t.week < 0, `${t.title} past/future on ${today}`);
      });
    }
  });
  it('an event named for a day is on that day', () => {
    const names = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    for (const t of EVENT_TEMPLATES) {
      const named = names.findIndex((n) => t.title.toLowerCase().includes(n));
      if (named >= 0) strictEqual(t.weekday, named, t.title);
    }
  });
});
