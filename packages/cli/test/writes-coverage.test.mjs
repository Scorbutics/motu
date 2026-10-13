// `writes-covered`: which declared writes no flow exercises.
//
// It counted only `emit` steps, so a region whose flow asserted a produced key that ONLY the
// producing component could have set — the stronger proof, since `emit` enters past the component's
// own handler — was told the write was "never exercised, so the component could stop emitting it and
// nothing here would change". Measured on the profile region of the app this was found in: silencing
// the component made that flow fail at once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { undrivenWrites } from '../src/lib/writes-coverage.mjs';

const ACK = { slot: 'editor', event: 'focus-handled', key: 'focusHandled' };
const REQ = { slot: 'panel', event: 'open-field', key: 'focus' };

test('an emit of the declared event covers the write', () => {
  const flows = [{ steps: [{ emit: { slot: 'panel', event: 'open-field', detail: 1 }, expect: { focusHandled: 1 } }] }];
  assert.deepEqual(undrivenWrites([REQ], flows), []);
});

test('expecting a key nothing hands a value covers its producer', () => {
  const flows = [{ steps: [{ emit: { slot: 'panel', event: 'open-field', detail: 1 }, expect: { focusHandled: 1 } }] }];
  assert.deepEqual(undrivenWrites([REQ, ACK], flows), []);
});

test('a key the seed sets does not count — the expectation could hold without the producer', () => {
  const flows = [{ seed: { focusHandled: 1 }, steps: [{ emit: { slot: 'panel', event: 'open-field' }, expect: { focusHandled: 1 } }] }];
  assert.deepEqual(undrivenWrites([ACK], flows), [ACK]);
});

test('a key any step provides does not count either, even a later step', () => {
  const flows = [{ steps: [{ expect: { focusHandled: 1 } }, { provide: { focusHandled: 2 } }] }];
  assert.deepEqual(undrivenWrites([ACK], flows), [ACK]);
});

test('no flow touching the key leaves the write undriven', () => {
  assert.deepEqual(undrivenWrites([ACK], [{ steps: [{ expectRender: { editor: 'x' } }] }]), [ACK]);
});
