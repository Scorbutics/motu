// The lane pool's two pure halves: how many lanes, and a result surviving the trip between processes.
// The pool itself is exercised against a real project (one lane vs four, verdicts compared).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { laneCount, serializeResult, deserializeResult } from '../src/lib/check-workers.mjs';

test('one lane when there is little to drive, whatever the machine', () => {
  assert.equal(laneCount({}, 0), 1);
  assert.equal(laneCount({}, 5), 1);
  assert.equal(laneCount({ jobs: 'auto' }, 3), 1);
});

test('auto is at least one and at most four lanes', () => {
  const n = laneCount({}, 50);
  assert.ok(n >= 1 && n <= 4, `auto gave ${n}`);
});

test('--jobs is honoured, and never exceeds the targets', () => {
  assert.equal(laneCount({ jobs: '3' }, 50), 3);
  assert.equal(laneCount({ jobs: '8' }, 2), 2);
  assert.equal(laneCount({ jobs: '0' }, 10), 1);
  assert.equal(laneCount({ jobs: 'nonsense' }, 10), 1);
});

test('a result crosses the process boundary with its verdict intact', () => {
  const findings = [
    { level: 'ok', check: 'region-flow', msg: '3 step(s)' },
    { level: 'warn', check: 'render-coverage', msg: 'w' },
    { level: 'error', check: 'null-island', msg: 'e' },
  ];
  const r = { kebab: 'actions', tag: undefined, report: { findings }, cached: null, runtimeRan: true };
  const back = deserializeResult(JSON.parse(JSON.stringify(serializeResult(r))));
  assert.equal(back.kebab, 'actions');
  assert.equal(back.errors.length, 1);
  assert.equal(back.warns.length, 1);
  assert.equal(back.runtimeRan, true);
  assert.deepEqual(back.report.findings, findings);
});
