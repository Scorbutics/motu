// `flow-mutation`'s verdict, from mutant results alone — no browser.
//
// The bug this pins (found by bench/evidence on shlink): the crude mutant replaces an emitted term with
// `null`, the list calls `null.toLowerCase()`, the region empties, and an assertion on the SEARCH BOX's
// own placeholder "failed" — so a step asserting a constant was credited as killed. A crash is not a
// kill. When the crude mutant crashes, a mutant of the same TYPE decides — and a step that holds under
// it is an ERROR, exactly as one that holds under the crude mutant: one rule, whether or not the app
// happens to crash on `null` (decided strict: two terms that both match nothing are still an assertion
// the stimulus does not move).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMutants, mutateStimulus, reportMutants, MUTANT_PREFIX, TYPED_SUFFIX } from '../src/commands/verify/region-flows.mjs';

const recorder = () => {
  const rows = [];
  const push = (level) => (check, msg, seen) => rows.push({ level, check, msg, seen });
  return { rows, ok: push('ok'), warn: push('warn'), error: push('error'), skip: push('skip'), inconclusive: push('inconclusive') };
};
const N = (s) => `${MUTANT_PREFIX}${s}`;
const result = (scenario, o) => ({ scenario, step: 1, ok: false, error: null, mismatches: [], crashed: null, ...o });

test('a typed mutant is another value of the same type, and none for shapes it cannot vary', () => {
  const emit = (detail) => ({ emit: { slot: 's', event: 'e', detail }, expectRender: { s: 'x' } });
  assert.equal(mutateStimulus(emit('staging'), 'typed').emit.detail, '__motu_mutant__');
  assert.equal(mutateStimulus(emit('__motu_mutant__'), 'typed').emit.detail, '__motu_mutant_2__');
  assert.equal(mutateStimulus(emit(3), 'typed').emit.detail, 7922);
  assert.equal(mutateStimulus(emit(true), 'typed').emit.detail, false);
  assert.equal(mutateStimulus(emit({ a: 1 }), 'typed'), null);
  assert.equal(mutateStimulus(emit(null), 'typed'), null);
  // The crude one is unchanged: null for a value, a marker for null.
  assert.equal(mutateStimulus(emit('staging')).emit.detail, null);
  assert.equal(mutateStimulus({ provide: { k: 'v', n: 2 }, expect: { o: 1 } }, 'typed').provide.n, 7921);
});

test('a crash is not a kill: crude crashed, typed still holds — an error, as if the crude one held (the shlink E1 case)', () => {
  const r = recorder();
  const flows = [
    result(N('search § 1'), { crashed: "Cannot read properties of null (reading 'toLowerCase')", mismatches: [{ key: 'render:s' }] }),
    result(N(`search § 1${TYPED_SUFFIX}`), { ok: true }),
  ];
  reportMutants(r, flows, { mutants: [{}, {}], coverageOnly: 0, vacuous: 0 });
  assert.deepEqual(r.rows.map((x) => x.level), ['error']);
  assert.match(r.rows[0].msg, /another value of the same type/);
});

test('crude crashed, typed fails on the assertion — proven by the typed mutant', () => {
  const r = recorder();
  reportMutants(
    r,
    [result(N('narrow § 1'), { crashed: 'boom', mismatches: [{}] }), result(N(`narrow § 1${TYPED_SUFFIX}`), { mismatches: [{}] })],
    { mutants: [{}, {}], coverageOnly: 0, vacuous: 0 },
  );
  assert.deepEqual(r.rows.map((x) => x.level), ['ok']);
  assert.equal(r.rows[0].seen.n, 1);
});

test('both crashed, or crude crashed with no typed mutant — unproven, a warning', () => {
  const r = recorder();
  reportMutants(
    r,
    [
      result(N('a § 1'), { crashed: 'boom' }),
      result(N(`a § 1${TYPED_SUFFIX}`), { crashed: 'boom again' }),
      result(N('b § 1'), { error: 'the region rendered nothing after this step' }),
    ],
    { mutants: [{}, {}, {}], coverageOnly: 0, vacuous: 0 },
  );
  assert.deepEqual(r.rows.filter((x) => x.level === 'warn').length, 2);
  assert.ok(r.rows.every((x) => x.level !== 'error'));
});

test('an assertion that holds under the crude mutant is still an error, typed or not', () => {
  const r = recorder();
  reportMutants(r, [result(N('c § 1'), { ok: true }), result(N(`c § 1${TYPED_SUFFIX}`), { mismatches: [{}] })], {
    mutants: [{}, {}],
    coverageOnly: 0,
    vacuous: 0,
  });
  assert.deepEqual(r.rows.map((x) => x.level), ['error']);
});

test('a clean kill needs no typed mutant, and a missing result is inconclusive', () => {
  const r = recorder();
  reportMutants(r, [result(N('d § 1'), { mismatches: [{}] })], { mutants: [{}], coverageOnly: 1, vacuous: 0 });
  assert.deepEqual(r.rows.map((x) => x.level), ['ok']);
  const r2 = recorder();
  reportMutants(r2, [result(N('d § 1'), { mismatches: [{}] })], { mutants: [{}, {}], coverageOnly: 0, vacuous: 0 });
  assert.deepEqual(r2.rows.map((x) => x.level), ['inconclusive']);
});

test('the plan sends a typed mutant beside the crude one only where the stimulus is a scalar', () => {
  const plan = buildMutants({ error() {} }, [
    {
      name: 'f',
      steps: [
        { emit: { slot: 's', event: 'e', detail: 'staging' }, expectRender: { l: 'x' } },
        { emit: { slot: 's', event: 'e', detail: { id: 1 } }, expectRender: { l: 'y' } },
      ],
    },
  ]);
  assert.deepEqual(
    plan.mutants.map((m) => m.name),
    [`${MUTANT_PREFIX}f § 1`, `${MUTANT_PREFIX}f § 1${TYPED_SUFFIX}`, `${MUTANT_PREFIX}f § 2`],
  );
});
