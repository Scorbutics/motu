// `motu lagoon try` — the step grammar and the key diff, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTry, keyDiff } from '../src/commands/lagoon-try.mjs';

test('steps read as the same verbs a flow has', () => {
  const f = parseTry(['in revoked-only', 'seed busy=false', 'click Accept', 'emit shot-list:shot-selected {"island":"x","shot":"y"}', 'provide viewMode=diff']);
  assert.equal(f.world, 'revoked-only');
  assert.deepEqual(f.seed, { busy: false });
  assert.deepEqual(f.steps, [
    { click: 'Accept' },
    { emit: { slot: 'shot-list', event: 'shot-selected', detail: { island: 'x', shot: 'y' } } },
    { provide: { viewMode: 'diff' } },
  ]);
});

test('assertions attach to the step before them, and are the agent\'s own', () => {
  const f = parseTry(['click Accept', 'shows accept-bar: Accepted', 'hides accept-bar: Accept all', 'holds busy=false']);
  assert.deepEqual(f.steps[0], { click: 'Accept', expectRender: { 'accept-bar': { text: 'Accepted', notText: 'Accept all' } }, expect: { busy: false } });
});

test('an assertion with no step before it is refused, not attached to nothing', () => {
  assert.throws(() => parseTry(['shows x: y']), /no step yet/);
  assert.throws(() => parseTry(['click A', 'in some-world']), /comes first/);
  assert.throws(() => parseTry(['emit no-colon']), /<slot>:<event>/);
  assert.throws(() => parseTry(['select something']), /unknown step/);
});

test('a bare word is a string; anything else must be JSON', () => {
  assert.deepEqual(parseTry(['provide mode=diff']).steps[0], { provide: { mode: 'diff' } });
  assert.throws(() => parseTry(['provide mode=two words']), /not JSON/);
});

test('keyDiff names what moved, both ways', () => {
  assert.deepEqual(keyDiff({ a: 1, b: [1] }, { a: 1, b: [1, 2], c: 'x' }), [
    { key: 'b', from: '[1]', to: '[1,2]' },
    { key: 'c', from: 'undefined', to: '"x"' },
  ]);
  assert.deepEqual(keyDiff({ a: 1 }, { a: 1 }), []);
});
