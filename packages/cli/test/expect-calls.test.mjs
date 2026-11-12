// `expectCalls` — a flow step's claim about which backend calls it makes, and only those.
// Pinned on bench/evidence's B9: a state that used to ask for nothing starts fetching `/servers.json`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { expectCallsMismatches, namesCall } from '../src/lib/expect-calls.mjs';
import { mutateStimulus } from '../src/commands/verify/region-flows.mjs';

const call = (method, url, label = '') => ({ method, url, label });
const servers = call('GET', '/servers.json?v=2', 'route:GET /servers.json');

test('an entry names a call by METHOD /path, by /path, or by its label — the query never matters', () => {
  assert.ok(namesCall('GET /servers.json', servers));
  assert.ok(!namesCall('POST /servers.json', servers));
  assert.ok(namesCall('/servers.json', servers));
  assert.ok(namesCall('route:GET /servers.json', servers));
  assert.ok(!namesCall('/server.json', servers));
});

test('[] means the step asks for nothing — the B9 case fails it', () => {
  assert.deepEqual(expectCallsMismatches([], []), []);
  const m = expectCallsMismatches([], [servers]);
  assert.equal(m.length, 1);
  assert.match(m[0].actual, /also called GET \/servers\.json/);
  assert.equal(m[0].expected, 'no backend call');
});

test('declared calls must all happen, and nothing else may — repeats are not counted', () => {
  assert.deepEqual(expectCallsMismatches(['GET /servers.json'], [servers, servers]), []);
  const missing = expectCallsMismatches(['GET /servers.json', 'shots.list'], [servers]);
  assert.deepEqual(missing.map((x) => x.actual), ['never called']);
  const extra = expectCallsMismatches(['GET /servers.json'], [servers, call('GET', '/me', 'members.me')]);
  assert.match(extra[0].actual, /also called GET \/me \(members\.me\)/);
});

test('no expectCalls declared — no check, whatever was called', () => {
  assert.deepEqual(expectCallsMismatches(undefined, [servers]), []);
});

test('a mutant is never judged on expectCalls', () => {
  const step = { emit: { slot: 's', event: 'e', detail: 'x' }, expectRender: { l: 'y' }, expectCalls: [] };
  assert.equal('expectCalls' in mutateStimulus(step), false);
  assert.equal('expectCalls' in mutateStimulus(step, 'typed'), false);
});
