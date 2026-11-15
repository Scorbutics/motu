// A replayed runtime verdict must be exactly as trustworthy as the run it replaces — or not exist.
//
// What these pin is the POLICY, not the hashing: only clean verdicts are kept (a flake must not become
// permanent, an inconclusive must look again), a replay is always marked, and the two escape hatches
// (`--no-cache`, `--max-age`) actually escape. The fingerprint itself is exercised against a real
// project; here it is a string the caller hands in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

// The cache lives under the project's `.motu/cache`, resolved from cwd at import — so import it from
// inside a scratch project.
process.chdir(mkdtempSync(resolve(tmpdir(), 'motu-verdicts-')));
const { withVerdictCache, cachePolicy, parseMaxAge, isStorable } = await import('../src/lib/verdict-cache.mjs');

const report = () => ({ findings: [] });
const on = cachePolicy({});
let n = 0;
const id = () => `target-${++n}`;

/** A runtime pass that appends `findings` and counts how often it was driven. */
function pass(findings) {
  const calls = { n: 0 };
  return { calls, run: (r) => async () => { calls.n++; r.findings.push(...findings.map((f) => ({ ...f }))); } };
}

test('a clean verdict is replayed for the same fingerprint, marked, without driving the check', async () => {
  const t = id();
  const p = pass([{ level: 'ok', check: 'region-flow', msg: '3 step(s) end as declared' }, { level: 'warn', check: 'render-coverage', msg: 'w' }]);
  const r1 = report();
  const first = await withVerdictCache({ kind: 'region-runtime', id: t, report: r1, fingerprint: { fp: 'aaa' }, policy: on }, p.run(r1));
  assert.equal(first.cached, null);
  const r2 = report();
  const second = await withVerdictCache({ kind: 'region-runtime', id: t, report: r2, fingerprint: { fp: 'aaa' }, policy: on }, p.run(r2));
  assert.equal(p.calls.n, 1, 'the check was driven again for an unchanged fingerprint');
  assert.equal(second.cached.fp, 'aaa');
  assert.equal(r2.findings.length, 2);
  assert.ok(r2.findings.every((f) => f.cached?.fp === 'aaa'), 'a replayed finding is not marked as one');
});

test('a changed fingerprint re-runs', async () => {
  const t = id();
  const p = pass([{ level: 'ok', check: 'lagoon-render', msg: 'renders' }]);
  const a = report();
  await withVerdictCache({ kind: 'island-runtime', id: t, report: a, fingerprint: { fp: 'one' }, policy: on }, p.run(a));
  const b = report();
  await withVerdictCache({ kind: 'island-runtime', id: t, report: b, fingerprint: { fp: 'two' }, policy: on }, p.run(b));
  assert.equal(p.calls.n, 2);
});

test('an error is never stored — a flaky failure must not become permanent', async () => {
  const t = id();
  const p = pass([{ level: 'error', check: 'region-flow', msg: 'step 2: expected x' }]);
  for (let i = 0; i < 2; i++) {
    const r = report();
    await withVerdictCache({ kind: 'region-runtime', id: t, report: r, fingerprint: { fp: 'f' }, policy: on }, p.run(r));
  }
  assert.equal(p.calls.n, 2);
});

test('an inconclusive is never stored — a check that could not look must look next time', async () => {
  const t = id();
  const p = pass([{ level: 'ok', check: 'a', msg: 'm' }, { level: 'inconclusive', check: 'lagoon-render', msg: 'no chromium' }]);
  for (let i = 0; i < 2; i++) {
    const r = report();
    await withVerdictCache({ kind: 'region-runtime', id: t, report: r, fingerprint: { fp: 'f' }, policy: on }, p.run(r));
  }
  assert.equal(p.calls.n, 2);
});

test('an empty verdict is not a verdict', () => {
  assert.equal(isStorable([]), false);
});

test('an uncacheable target (no fingerprint) runs every time', async () => {
  const t = id();
  const p = pass([{ level: 'ok', check: 'a', msg: 'm' }]);
  for (let i = 0; i < 2; i++) {
    const r = report();
    const out = await withVerdictCache(
      { kind: 'region-runtime', id: t, report: r, fingerprint: { fp: null, uncacheable: 'glob import' }, policy: on },
      p.run(r),
    );
    assert.equal(out.uncacheable, 'glob import');
  }
  assert.equal(p.calls.n, 2);
});

test('--no-cache re-proves, and --max-age expires an old proof', async () => {
  const t = id();
  const p = pass([{ level: 'ok', check: 'a', msg: 'm' }]);
  const r1 = report();
  await withVerdictCache({ kind: 'region-runtime', id: t, report: r1, fingerprint: { fp: 'z' }, policy: on }, p.run(r1));
  const r2 = report();
  await withVerdictCache({ kind: 'region-runtime', id: t, report: r2, fingerprint: { fp: 'z' }, policy: cachePolicy({ cache: false }) }, p.run(r2));
  assert.equal(p.calls.n, 2, '--no-cache replayed');
  // A proof made a moment ago is older than zero minutes.
  await new Promise((r) => setTimeout(r, 5));
  const r3 = report();
  await withVerdictCache({ kind: 'region-runtime', id: t, report: r3, fingerprint: { fp: 'z' }, policy: { enabled: true, maxAgeMs: 1 } }, p.run(r3));
  assert.equal(p.calls.n, 3, '--max-age did not expire the proof');
});

test('a replay is stored as the original, never as a replay of a replay', async () => {
  const t = id();
  const p = pass([{ level: 'ok', check: 'a', msg: 'm' }]);
  const r1 = report();
  await withVerdictCache({ kind: 'k', id: t, report: r1, fingerprint: { fp: 'q' }, policy: on }, p.run(r1));
  const r2 = report();
  await withVerdictCache({ kind: 'k', id: t, report: r2, fingerprint: { fp: 'q' }, policy: on }, p.run(r2));
  const r3 = report();
  await withVerdictCache({ kind: 'k', id: t, report: r3, fingerprint: { fp: 'q' }, policy: on }, p.run(r3));
  assert.equal(r3.findings.length, 1);
});

test('--max-age reads minutes, hours and days', () => {
  assert.equal(parseMaxAge('30m'), 30 * 60_000);
  assert.equal(parseMaxAge('12h'), 12 * 3_600_000);
  assert.equal(parseMaxAge('7d'), 7 * 86_400_000);
  assert.equal(parseMaxAge('6'), 6 * 3_600_000);
  assert.equal(parseMaxAge(undefined), null);
  assert.equal(parseMaxAge('soon'), null);
});
