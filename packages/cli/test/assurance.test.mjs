// `motu assurance` — one row per declared thing and the strongest evidence that holds it
// (docs/proposals/constraint-loop.md, item 3). Shaped on shlink's manage-servers region.
import test from 'node:test';
import assert from 'node:assert/strict';
import { assuranceRows, summarize } from '../src/lib/assurance.mjs';

const region = {
  islands: [
    { slot: 'search', element: 'x-search', writes: { 'term-change': 'term' } },
    { slot: 'list', element: 'x-list', bind: ['term'] },
    { slot: 'later', element: 'x-later', planned: true, writes: { e: 'k' } },
  ],
};
const row = (rows, kind, subject) => rows.find((r) => r.kind === kind && r.subject === subject);

test('no flows: slots and writes are static, the shared key is static, nothing claims runtime', () => {
  const rows = assuranceRows(region, []);
  assert.equal(row(rows, 'slot', 'search').level, 'static');
  assert.equal(row(rows, 'write', 'search · term-change → term').level, 'static');
  assert.equal(row(rows, 'key', 'term').level, 'static');
  assert.ok(!rows.some((r) => r.subject.includes('later')), 'a planned island is not yet a declared thing to hold');
});

test('emit-only drives a write at runtime·emit, and says the handler is never driven', () => {
  const flows = [{ name: 'f', steps: [{ emit: { slot: 'search', event: 'term-change', detail: 'a' }, expectRender: { list: 'A' } }] }];
  const rows = assuranceRows(region, flows);
  const w = row(rows, 'write', 'search · term-change → term');
  assert.equal(w.level, 'runtime·emit');
  assert.match(w.missing, /handler is never driven/);
  // The reader's render asserted as the key moves: the coupling is shown.
  assert.equal(row(rows, 'key', 'term').level, 'runtime');
  assert.equal(row(rows, 'slot', 'list').missing, null);
  // A pure producer has no coupling to show — no noise about it.
  assert.equal(row(rows, 'slot', 'search').level, 'static');
});

test('a click that moves the key holds the write and the key by the path a person takes', () => {
  const flows = [{ name: 'f', steps: [{ click: 'Search', expect: { term: 'a' }, expectRender: { list: 'A' } }] }];
  const rows = assuranceRows(region, flows);
  assert.equal(row(rows, 'write', 'search · term-change → term').level, 'runtime·user');
  assert.equal(row(rows, 'key', 'term').level, 'runtime·user');
});

test('a reader asserted only on a seed, never as the key moves, does not show the coupling', () => {
  const flows = [{ name: 'f', seed: { term: 'a' }, steps: [{ expectRender: { list: 'A' } }] }];
  const rows = assuranceRows(region, flows);
  assert.equal(row(rows, 'slot', 'list').level, 'runtime');
  assert.match(row(rows, 'slot', 'list').missing, /coupling is not shown/);
  assert.equal(row(rows, 'key', 'term').level, 'static');
});

test('a key nobody else reads is unchecked; calls are static until a step says which it makes', () => {
  const lonely = { islands: [{ slot: 'a', element: 'x-a', writes: { e: 'k' } }] };
  assert.equal(row(assuranceRows(lonely, []), 'key', 'k').level, 'unchecked');
  const flows = [{ name: 'f', steps: [{ expectRender: { a: 'x' } }, { expectRender: { a: 'y' }, expectCalls: [] }] }];
  const calls = row(assuranceRows(lonely, flows), 'calls', 'flow "f"');
  assert.equal(calls.level, 'runtime');
  assert.match(calls.missing, /1\/2 step/);
  assert.equal(summarize(assuranceRows(lonely, [])).weakest, 'unchecked');
});
