// Unit tests for the availability source.
//
// WHY THESE EXIST AND WHAT THEY ARE NOT. motu checks COMPOSITION — that the calendar's islands are
// placed, that `selectedDay` reaches the island that reads it, that every declared state renders.
// It runs no typecheck and no test runner, and a green `motu check` says nothing whatever about
// whether the grouping below is correct. Every case here is a branch that renders to a
// plausible-looking screen whichever way it goes: a day sorted wrongly, a fully-booked day chosen
// as the opening one, a horizon off by one. A flow drives this source through the screen; this
// drives it directly, and both are wanted for the same reason `expectRender` is wanted as well as
// `expect`.
//
// Run with the host's own runner: `pnpm --filter demo-app test`.
import { deepStrictEqual, strictEqual } from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  availabilitySource,
  calendarFrom,
  utcDate,
  type AvailabilityPort,
  type TimeslotRow,
} from '../src/shared/availability-source.js';

let nextId = 0;
function row(startsAt: string, over: Partial<TimeslotRow> = {}): TimeslotRow {
  return { id: `s${nextId++}`, starts_at: startsAt, minutes: 30, kind: 'intro', taken: false, ...over };
}

describe('calendarFrom', () => {
  it('groups slots into days and counts free against taken', () => {
    const cal = calendarFrom('m1', [
      row('2026-09-07T09:00:00+00:00'),
      row('2026-09-07T11:00:00+00:00', { taken: true }),
      row('2026-09-08T09:00:00+00:00'),
    ]);
    strictEqual(cal.days.length, 2);
    strictEqual(cal.days[0]?.date, '2026-09-07');
    strictEqual(cal.days[0]?.free, 1);
    strictEqual(cal.days[0]?.taken, 1);
    strictEqual(cal.freeCount, 2);
  });

  it('orders days and slots even when the rows arrive shuffled', () => {
    // The port promises time order; this asserts the source does not DEPEND on that promise. A
    // calendar whose days arrive shuffled renders wrong rather than failing.
    const cal = calendarFrom('m1', [
      row('2026-09-09T16:00:00+00:00'),
      row('2026-09-07T14:00:00+00:00'),
      row('2026-09-07T09:00:00+00:00'),
    ]);
    deepStrictEqual(
      cal.days.map((d) => d.date),
      ['2026-09-07', '2026-09-09'],
    );
    deepStrictEqual(
      cal.days[0]?.slots.map((s) => s.startsAt.slice(11, 16)),
      ['09:00', '14:00'],
    );
  });

  it('opens on the first day with a FREE slot, not simply the first day', () => {
    // The whole point of `firstOpenDate`. Opening on a fully-taken day presents a list of disabled
    // buttons as the resting state, and renders perfectly while doing it.
    const cal = calendarFrom('m1', [
      row('2026-09-07T09:00:00+00:00', { taken: true }),
      row('2026-09-07T11:00:00+00:00', { taken: true }),
      row('2026-09-08T09:00:00+00:00'),
    ]);
    strictEqual(cal.days[0]?.date, '2026-09-07');
    strictEqual(cal.firstOpenDate, '2026-09-08');
  });

  it('has no open date when every slot in the horizon is taken', () => {
    const cal = calendarFrom('m1', [row('2026-09-07T09:00:00+00:00', { taken: true })]);
    strictEqual(cal.firstOpenDate, null);
    strictEqual(cal.freeCount, 0);
    // ...and the day is still THERE. "Fully booked" and "publishes nothing" are different screens.
    strictEqual(cal.days.length, 1);
  });

  it('is empty, not broken, for a member with no slots at all', () => {
    const cal = calendarFrom('m1', []);
    deepStrictEqual(cal.days, []);
    strictEqual(cal.firstOpenDate, null);
    strictEqual(cal.freeCount, 0);
  });

  it('clamps to the horizon in DAYS, not in slots', () => {
    // Six slots over three days with a horizon of two is two days and four slots — an implementation
    // that sliced the flat row list would keep three days here and be invisible on screen.
    const rows = ['2026-09-07', '2026-09-08', '2026-09-09'].flatMap((d) => [
      row(`${d}T09:00:00+00:00`),
      row(`${d}T11:00:00+00:00`),
    ]);
    const cal = calendarFrom('m1', rows, 2);
    strictEqual(cal.days.length, 2);
    strictEqual(cal.freeCount, 4);
  });

  it('drops a slot whose kind the application does not know', () => {
    // The table constrains `kind`, so reaching this means the schema moved underneath the app. One
    // slot fewer beats a slot whose purpose the UI cannot name.
    const cal = calendarFrom('m1', [row('2026-09-07T09:00:00+00:00', { kind: 'seance' }), row('2026-09-07T11:00:00+00:00')]);
    strictEqual(cal.days[0]?.slots.length, 1);
    strictEqual(cal.days[0]?.slots[0]?.kind, 'intro');
  });

  it('falls back to a sane duration rather than rendering NaN minutes', () => {
    const cal = calendarFrom('m1', [row('2026-09-07T09:00:00+00:00', { minutes: Number.NaN })]);
    strictEqual(cal.days[0]?.slots[0]?.minutes, 30);
  });
});

describe('availabilitySource', () => {
  function portReturning(rows: TimeslotRow[]) {
    const asked: { memberId: string; fromISO: string }[] = [];
    const port: AvailabilityPort = {
      async forMember(memberId, fromISO) {
        asked.push({ memberId, fromISO });
        return rows;
      },
    };
    return { port, asked };
  }

  it('asks from the START OF TODAY, so an afternoon visitor still sees the morning', () => {
    // The bug this pins: asking from `now` drops a 09:00 slot once the clock passes it, and the
    // day's counts then differ from what a colleague saw an hour earlier. Nothing on screen says so.
    const { port, asked } = portReturning([]);
    return availabilitySource(port)
      .calendar('m1', new Date('2026-09-07T15:42:00Z'))
      .then(() => {
        strictEqual(asked[0]?.fromISO, '2026-09-07T00:00:00.000Z');
      });
  });

  it('asks nothing at all without a member, and answers the empty calendar', async () => {
    let called = false;
    const port: AvailabilityPort = {
      async forMember() {
        called = true;
        return [];
      },
    };
    const cal = await availabilitySource(port).calendar('');
    strictEqual(called, false);
    strictEqual(cal.freeCount, 0);
  });

  it('survives a port that answers null instead of rows', async () => {
    const port = { forMember: async () => null as unknown as TimeslotRow[] };
    const cal = await availabilitySource(port).calendar('m1');
    deepStrictEqual(cal.days, []);
  });
});

describe('utcDate', () => {
  it('reads the day off the instant without going through local time', () => {
    strictEqual(utcDate('2026-09-07T23:30:00+00:00'), '2026-09-07');
  });
});
