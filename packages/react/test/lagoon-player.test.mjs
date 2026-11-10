// The state player's address and translation — the parts that decide WHICH state a link means and
// WHERE a scenario's values land. Driven against the built output (`node scripts/build-packages.mjs`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatStateParam, parseStateParam, registerLagoonRegion, scenarioToRegion, statesFor } from '../dist/lagoon-player.js';

const REGION = {
  id: 'events',
  islands: [
    { slot: 'event-list', element: 'x-event-list', bind: ['events', 'filter'], writes: { select: 'selectedEventId' } },
    // `request` is the prop; the region names the key `sphereRequest` — the rename must be followed.
    { slot: 'sheet', element: 'x-sheet', bind: ['events', { request: 'sphereRequest' }, 'selectedEventId'] },
    { slot: 'sheet-mobile', element: 'x-sheet', bind: ['events', { request: 'sphereRequest' }, 'selectedEventId'] },
  ],
};

test('a state address round-trips, and names are written as slugs', () => {
  const flow = { region: 'events', kind: 'flow', name: 'A full event refuses the RSVP', step: 2 };
  assert.equal(formatStateParam(flow), 'events.flow.a-full-event-refuses-the-rsvp@2');
  assert.deepEqual(parseStateParam('events.flow.a-full-event-refuses-the-rsvp@2'), { ...flow, name: 'a-full-event-refuses-the-rsvp' });
  const sc = { region: 'shell', kind: 'scenario', island: 'x-app-nav', name: 'Sphère ouverte', step: null };
  assert.equal(formatStateParam(sc), 'shell.scenario.x-app-nav.sphere-ouverte');
  assert.deepEqual(parseStateParam('shell.scenario.x-app-nav.sphere-ouverte'), { ...sc, name: 'sphere-ouverte' });
});

test('a malformed address is refused with what the shape should be', () => {
  for (const bad of ['events', 'events.flow', 'events.nope.x', 'events.flow.x@-1', 'events.flow.x@1.5', 'r.scenario.only-three']) {
    const r = parseStateParam(bad);
    assert.ok('error' in r, `${bad} should be refused`);
  }
});

test('scenario props land on REGION keys through bind, renames included; an unbound prop is reported', () => {
  const r = scenarioToRegion(REGION, 'x-sheet', { request: { seq: 1 }, events: [], label: 'x' });
  assert.deepEqual(r.keys, { sphereRequest: { seq: 1 }, events: [] });
  assert.deepEqual(r.unbound, ['label']);
});

test('statesFor lists one island once, even placed in two slots', () => {
  const ev = { scenarios: { 'x-sheet': [{ name: 'open' }, { name: 'closed' }], 'x-event-list': [] }, flows: { events: [{ name: 'pick' }] } };
  registerLagoonRegion(REGION, {});
  const [s] = statesFor(['events'], ev);
  assert.deepEqual(s.flows, ['pick']);
  assert.deepEqual(s.islands.map((i) => [i.tag, i.scenarios.length]), [['x-event-list', 0], ['x-sheet', 2]]);
});
