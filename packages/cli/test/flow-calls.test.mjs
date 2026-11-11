// `flow-calls`: what makes a call a finding, and how it is said.
//
// The incident: Peps' screens made calls nothing answered, the app swallowed every error, and every
// check passed. A declared failure (a fixture's 500 for "a failing search") is the flow's own state
// and must never be one; an empty run must never be reported as a clean bill.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callFix, describeCall, reportFlowCalls } from '../src/lib/flow-calls.mjs';

const fakeReport = () => {
  const out = [];
  return {
    out,
    error: (check, msg) => out.push(['error', check, msg]),
    ok: (check, msg, seen) => out.push([seen && (seen.n ?? seen) === 0 ? 'skip' : 'ok', check, msg]),
  };
};

test('the fix is said in the declaration’s own spelling', () => {
  assert.match(callFix({ label: 'table:notifications', status: 404 }), /table `notifications`/);
  assert.match(callFix({ label: 'rpc:save_member', status: 404 }), /rpc `save_member`/);
  assert.match(callFix({ label: 'MemberService.search', status: 404 }), /MemberService\/search/);
  assert.match(callFix({ label: 'table:x', status: 0, error: 'aborted' }), /never got an answer/);
});

test('an undeclared call fails its step, and a repeat is counted rather than repeated', () => {
  const r = fakeReport();
  const miss = { method: 'HEAD', label: 'table:notifications', status: 404, ok: false, owner: 'unattributed' };
  reportFlowCalls(r, [{ where: '"x" step 1', calls: 3, undeclared: [miss, miss] }]);
  assert.equal(r.out.length, 1);
  assert.equal(r.out[0][0], 'error');
  assert.match(r.out[0][2], /HEAD table:notifications → 404.*\(×2\)/);
});

test('steps whose calls were all answered pass, naming how many were looked at', () => {
  const r = fakeReport();
  reportFlowCalls(r, [{ where: 's', calls: 4, undeclared: [] }]);
  assert.deepEqual(r.out.map((x) => x[0]), ['ok']);
});

test('a run with no calls at all is not a pass', () => {
  const r = fakeReport();
  reportFlowCalls(r, [{ where: 's', calls: 0, undeclared: [] }]);
  assert.deepEqual(r.out.map((x) => x[0]), ['skip']);
});

test('the line says who asked', () => {
  assert.match(describeCall({ method: 'GET', label: 'table:t', status: 404, owner: 'island:x-nav' }), /by island:x-nav/);
});
