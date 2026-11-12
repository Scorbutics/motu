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

// ── constraint-loop item 1: a change either modifies the declaration or preserves behaviour ──────────

import { account, assertionClauses, relaxes } from '../src/commands/diff.mjs';

const withEvidence = (flows, evidence) => {
  const t = trace(flows);
  t.declarations.members.evidence = evidence;
  return t;
};
const narrowing = { emit: { slot: 's', event: 'e', detail: 'staging' }, expectRender: { list: { text: 'staging.example.com', notText: 'Main shlink' } } };

test('the evidence is spec: each step reads as clauses — expect keys, render text/notText, expectCalls', () => {
  assert.deepEqual(assertionClauses({ expect: { q: 'a' }, expectRender: { list: 'x', side: { notText: 'y' } }, expectCalls: ['GET /b', 'GET /a'] }), {
    'expect q': '"a"',
    'render list text': 'x',
    'render side notText': 'y',
    calls: '["GET /a","GET /b"]',
  });
});

test('a step that drops its notText WEAKENS the evidence — bench/evidence B7, said in so many words', () => {
  const base = withEvidence({ f: [step()] }, { f: [assertionClauses(narrowing)] });
  const weakened = { ...narrowing, expectRender: { list: { text: 'staging.example.com' } } };
  const head = withEvidence({ f: [step()] }, { f: [assertionClauses(weakened)] });
  const f = compareTraces(base, head);
  assert.equal(f.length, 1);
  assert.equal(f[0].kind, 'declaration');
  assert.equal(f[0].weakens, true);
  assert.equal(f[0].subject, 'asserts render list notText');
  assert.deepEqual(f[0].where, [{ flow: 'f', step: 1 }]);
});

test('weaker vs different: a shorter text inside the old one weakens, an unrelated one only changes', () => {
  assert.equal(relaxes('render list text', 'Main shlink', 'Main'), true);
  assert.equal(relaxes('render list text', 'Main shlink', 'Staging'), false);
  assert.equal(relaxes('calls', '[]', '["GET /servers.json"]'), true);
  assert.equal(relaxes('calls', '["GET /a"]', '["GET /b"]'), false);
});

test('adding an assertion changes the spec without weakening it', () => {
  const base = withEvidence({ f: [step()] }, { f: [{ 'render list text': 'x' }] });
  const head = withEvidence({ f: [step()] }, { f: [{ 'render list text': 'x', calls: '[]' }] });
  const [f] = compareTraces(base, head);
  assert.equal(f.kind, 'declaration');
  assert.equal(f.weakens, undefined);
});

test('a flow or step removed weakens; added does not', () => {
  const two = trace({ a: [step(), step()], b: [step()] });
  const fewer = trace({ a: [step()] });
  const f = compareTraces(two, fewer).filter((x) => x.kind === 'declaration');
  assert.ok(f.length >= 2);
  assert.ok(f.every((x) => x.weakens === true), JSON.stringify(f));
  assert.ok(compareTraces(fewer, two).filter((x) => x.kind === 'declaration').every((x) => !x.weakens));
});

test('LOCKED: behaviour moved where the declaration did not — an explanation is not accepted', () => {
  const findings = compareTraces(trace({ a: [step()] }), trace({ a: [step({ surface: { table: 'Notes' } })] }));
  const { unexplained } = account(findings, { [findings[0].id]: 'the agent says it meant it' });
  assert.equal(findings[0].locked, true);
  assert.equal(findings[0].intended, undefined);
  assert.equal(unexplained.length, 1);
});

test('where the declaration changed too, behaviour can be explained as before', () => {
  const base = withEvidence({ a: [step()] }, { a: [{ 'render table text': 'Ada' }] });
  const head = withEvidence({ a: [step({ surface: { table: 'Notes' } })] }, { a: [{ 'render table text': 'Notes' }] });
  const findings = compareTraces(base, head);
  const explained = Object.fromEntries(findings.map((f) => [f.id, 'renamed the column, reviewed']));
  const { unexplained, spec } = account(findings, explained);
  assert.equal(unexplained.length, 0);
  assert.equal(spec.length, 1);
  assert.ok(findings.every((f) => !f.locked));
});
