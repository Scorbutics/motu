// `blank: 'why'` — a scenario that renders nothing on purpose. Both directions are asserted: an
// undeclared empty render still fails, and a declared one that renders something fails too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgeRenders } from '../src/lib/data-flow.mjs';

const sc = (name, blank) => (blank === undefined ? { name } : { name, blank });

test('an undeclared empty render is still refused', () => {
  const r = judgeRenders(['<p>Frozen</p>', ''], [sc('frozen'), sc('not frozen')]);
  assert.equal(r.differentiates, false);
  assert.deepEqual(r.empty, ['not frozen']);
});

test('a DECLARED empty render is an answer, and counts as distinct', () => {
  const r = judgeRenders(['<p>Frozen</p>', ''], [sc('frozen'), sc('not frozen', 'silent when nothing is frozen')]);
  assert.equal(r.differentiates, true);
  assert.deepEqual(r.empty, []);
  assert.equal(r.distinctOutputs, 2);
});

test('a declared-blank scenario that renders something fails — the declaration is checked', () => {
  const r = judgeRenders(['<p>Frozen</p>', '<p>oops</p>'], [sc('frozen'), sc('not frozen', 'silent')]);
  assert.equal(r.differentiates, false);
  assert.deepEqual(r.blankButRendered, ['not frozen']);
});

test('an empty reason is no declaration', () => {
  const r = judgeRenders(['<p>x</p>', ''], [sc('a'), sc('b', '   ')]);
  assert.deepEqual(r.empty, ['b']);
});

test('all blank is still not data flowing', () => {
  const r = judgeRenders(['', ''], [sc('a', 'closed'), sc('b', 'closed too')]);
  assert.equal(r.differentiates, false);
});

test('several declared-blank scenarios are one expected render, not duplicates', () => {
  const r = judgeRenders(['A', '', '', 'B'], [{ name: 'a' }, { name: 'b', blank: 'x' }, { name: 'c', blank: 'y' }, { name: 'd' }]);
  assert.equal(r.differentiates, true);
  assert.equal(r.distinctOutputs, 3);
  assert.equal(r.comparedCount, 3);
});
