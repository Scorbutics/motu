// A FLOW THAT CANNOT RUN HAS NOT PASSED.
//
// Reproduces Peps adopting docks: a region flow with `provide: { conseilEntries: [] }` — a key the
// region's `teams` source produces, which `provideToArchipelago` refuses — was refused at runtime,
// the lane threw, and `archipelago verify --runtime` printed a WARNING and PASS, exit 0. These pin
// both halves of the fix: the declaration error is caught statically (exit 1, before any browser),
// and anything that still cannot run is never a pass (1 when the project is at fault, 2 when the
// environment is).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { flowProvideCheck, sourcedProvides, unrunFlows } from '../src/commands/verify/region-flows.mjs';
import { couldNotRun, makeReport, sweepExitCode, verifyExitCode, summaryOf } from '../src/commands/verify/report.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCES = { teams: { produces: ['conseilEntries', 'captainsActiveConseil'] }, unresolved: { produces: null, unresolved: 'x' } };
// The app's flow as it was when it failed: docked, and providing the sourced key.
const PEPS_FLOW = {
  name: 'the Conseil docks beside the rocket and keeps base’s data',
  dock: 'equipage.equipage-aside',
  steps: [
    { expectRender: { 'base-conseil': { text: 'Conseil Lumière', in: 'equipage.equipage-aside' } } },
    { provide: { conseilEntries: [] }, expectRender: { 'base-conseil': { text: 'Crée ton Conseil', in: 'equipage.equipage-aside' } } },
  ],
};
const result = (report) => ({
  report,
  errors: report.findings.filter((f) => f.level === 'error'),
  warns: report.findings.filter((f) => f.level === 'warn'),
});

test('a step providing a key a declared source produces is found, with its flow, step and source', () => {
  assert.deepEqual(sourcedProvides([PEPS_FLOW], SOURCES), [
    { flow: PEPS_FLOW.name, step: 2, key: 'conseilEntries', source: 'teams' },
  ]);
  // A host-fed key is the host's to provide; an unresolved source names no key, so it claims none.
  assert.deepEqual(sourcedProvides([{ name: 'f', steps: [{ provide: { currentMemberId: 'm' } }] }], SOURCES), []);
});

test('flow-provide is a static ERROR (exit 1) naming the key, the source and the way out', () => {
  const report = makeReport();
  flowProvideCheck(report, 'base', { sources: SOURCES }, [PEPS_FLOW]);
  const r = result(report);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0].msg, /flow ".*" step 2 provides "conseilEntries", which the declared source "teams" of base produces/);
  assert.match(r.errors[0].msg, /world/);
  assert.equal(verifyExitCode(r), 1);
});

test('flow-provide passes a flow that provides only host-fed keys, and says nothing when no step provides', () => {
  const ok = makeReport();
  flowProvideCheck(ok, 'base', { sources: SOURCES }, [{ name: 'f', steps: [{ provide: { currentMemberId: 'm' }, expect: { x: 1 } }] }]);
  assert.deepEqual(ok.findings.map((f) => [f.level, f.check]), [['ok', 'flow-provide']]);
  const none = makeReport();
  flowProvideCheck(none, 'base', { sources: SOURCES }, [{ name: 'f', steps: [{ expectRender: { a: 'b' } }] }]);
  assert.deepEqual(none.findings, []);
});

test('a check that threw is never a pass: environmental → inconclusive (2), anything else → error (1)', () => {
  const env = makeReport();
  couldNotRun(env, 'region-flow', 'could not run declared flows', new Error('vite did not open port 5300 in time'));
  assert.equal(verifyExitCode(result(env)), 2);
  const chromium = makeReport();
  couldNotRun(chromium, 'data-flow', 'x', new Error("browserType.launch: Executable doesn't exist at /x"));
  assert.equal(verifyExitCode(result(chromium)), 2);
  const refused = makeReport();
  couldNotRun(
    refused,
    'region-flow',
    'could not run declared flows',
    new Error('page.evaluate: Error: motu: "conseilEntries" is produced by the declared source "teams" of archipelago "base", so the host cannot provide() it.'),
  );
  assert.equal(refused.findings[0].level, 'error');
  assert.match(refused.findings[0].msg, /not a pass/);
  assert.equal(verifyExitCode(result(refused)), 1);
});

test('a declared flow the lane returned no row for is named as not run', () => {
  const flows = [PEPS_FLOW, { name: 'other', steps: [{ expectRender: { a: 'b' } }] }, { name: 'empty', steps: [] }];
  assert.deepEqual(unrunFlows(flows, [{ scenario: 'other', step: 1, ok: true }]), [PEPS_FLOW.name]);
});

test('a sweep with an inconclusive member exits 2, and its JSON summary does not claim a pass', () => {
  const clean = makeReport();
  clean.ok('x', 'held', 1);
  const unknown = makeReport();
  unknown.inconclusive('region-flow', 'could not run');
  const members = [
    { kebab: 'a', ...result(clean) },
    { kebab: 'b', ...result(unknown) },
  ];
  assert.equal(sweepExitCode(members), 2);
  assert.equal(summaryOf(members[1]).pass, false);
  assert.equal(summaryOf(members[1]).inconclusive, true);
  assert.equal(summaryOf(members[0]).pass, true);
});

test('the runtime lane attributes a step the page refuses to that step (it does not abort every flow)', () => {
  // Source-level pin: the step's evaluate is caught and turned into the step's own error, and only an
  // environmental rejection escapes the lane.
  const src = readFileSync(resolve(here, '../src/playwright-lagoon.mjs'), 'utf8');
  assert.match(src, /the step threw in the page, so it did not run/);
  assert.match(src, /if \(ENVIRONMENTAL\.test\(msg\)[^\n]*\) throw err;/);
  const flows = readFileSync(resolve(here, '../src/commands/verify/region-flows.mjs'), 'utf8');
  assert.doesNotMatch(flows, /\? 'inconclusive' : 'warn'\]\(\s*'region-flow'/);
});

test('the dock example in the motu-evidence skill is one flow-provide accepts (it was the bug)', () => {
  const md = readFileSync(resolve(here, '../../../.github/agents/motu-evidence.agent.md'), 'utf8');
  const section = md.slice(md.indexOf('## A docked island is looked at COMPOSED'));
  const code = section.match(/```ts\n([\s\S]*?)```/)?.[1];
  assert.ok(code, 'the dock section has a ts example');
  const flows = new Function(`return [${code}]`)();
  assert.ok(flows.length >= 2 && flows.every((f) => f.dock === 'equipage.equipage-aside'));
  // The sources base really declares: `teams` produces `conseilEntries`.
  assert.deepEqual(sourcedProvides(flows, SOURCES), []);
  const report = makeReport();
  flowProvideCheck(report, 'base', { sources: SOURCES }, flows);
  assert.equal(report.findings.filter((f) => f.level === 'error').length, 0);
  // …and the state the old example reached by `provide` is reached through the source, by a world.
  assert.ok(flows.some((f) => f.world));
  for (const doc of ['../../../docs/proposals/docks.md', '../../../docs/10-evidence-and-testing.md', '../../../docs/08-lagoon.md']) {
    assert.doesNotMatch(readFileSync(resolve(here, doc), 'utf8'), /provide:\s*\{\s*conseilEntries/);
  }
});
