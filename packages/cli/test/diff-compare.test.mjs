// `motu diff`'s comparison, driven as the pure function it is.
//
// The incident it exists for: a merge made one slot render ANOTHER island's content, and every check
// was byte-identical between the right merge and the wrong one. A replayed flow sees the slot's text
// change. What is pinned here is what an agent then has to account for: one finding per change (not
// per step it shows in), an id that is the change itself, and the place the texts differ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareTraces, aroundDifference } from '../src/commands/diff.mjs';

const step = (over = {}) => ({ ok: true, error: null, keys: { q: 'a' }, surface: { table: 'Ada Lovelace' }, calls: ['POST S.search 200'], ...over });
const trace = (flows, slots = { table: { element: 'x-table', writes: {}, bind: ['q'], reads: [] } }) => ({
  regions: { members: { flows } },
  declarations: { members: { slots, flows: Object.keys(flows) } },
});

test('the same trace twice is no finding at all', () => {
  const t = trace({ search: [step(), step()] });
  assert.deepEqual(compareTraces(t, t), []);
});

test('a slot rendering another island’s text is one finding, naming the slot and both texts, wherever it shows', () => {
  const base = trace({ a: [step()], b: [step(), step()] });
  const head = trace({ a: [step({ surface: { table: 'Notes' } })], b: [step(), step({ surface: { table: 'Notes' } })] });
  const f = compareTraces(base, head);
  assert.equal(f.length, 1);
  assert.equal(f[0].kind, 'render');
  assert.equal(f[0].subject, 'table');
  assert.equal(f[0].before, 'Ada Lovelace');
  assert.equal(f[0].after, 'Notes');
  assert.deepEqual(f[0].where, [{ flow: 'a', step: 1 }, { flow: 'b', step: 2 }]);
});

test('the id is the change: stable across runs, different when the change differs', () => {
  const base = trace({ a: [step()] });
  const one = compareTraces(base, trace({ a: [step({ keys: { q: 'b' } })] }))[0].id;
  const again = compareTraces(base, trace({ a: [step({ keys: { q: 'b' } })] }))[0].id;
  const other = compareTraces(base, trace({ a: [step({ keys: { q: 'c' } })] }))[0].id;
  assert.equal(one, again);
  assert.notEqual(one, other);
});

test('a call made twice is not the same as a call made once', () => {
  const f = compareTraces(trace({ a: [step()] }), trace({ a: [step({ calls: ['POST S.search 200', 'POST S.search 200'] })] }));
  assert.deepEqual(f.map((x) => [x.kind, x.before, x.after]), [['calls', '×1', '×2']]);
});

test('declarations: a slot given another element, and a flow removed', () => {
  const base = trace({ a: [step()], gone: [step()] });
  const head = trace({ a: [step()] }, { table: { element: 'x-notes', writes: {}, bind: ['q'], reads: [] } });
  const kinds = compareTraces(base, head).map((x) => `${x.kind}:${x.subject}`);
  assert.ok(kinds.includes('declaration:slot table · element'), kinds.join(', '));
  assert.ok(kinds.includes('declaration:flow "gone"'), kinds.join(', '));
});

test('a long render is cut around where it differs, not from the start', () => {
  const row = (n) => `Row ${n} `.repeat(1);
  const a = Array.from({ length: 60 }, (_, i) => row(i)).join('') + 'streak 123 days ' + 'tail '.repeat(40);
  const b = a.replace('123', '130');
  const [x, y] = aroundDifference(a, b);
  assert.ok(x.includes('123') && y.includes('130'));
  assert.ok(x.startsWith('…') && x.length < a.length);
});
