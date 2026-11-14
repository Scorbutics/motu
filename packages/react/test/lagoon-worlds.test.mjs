// Worlds: a named overlay on the lagoon's answers. These pin the rules a world must keep — an unknown
// name refuses, `extends` is explicit and ordered, a re-answered source keeps running with new args, and
// a fact keeps its identity inside one world. Driven against the built output (`node scripts/build-packages.mjs`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { channelFrom, channelSourceId } from '@motujs/core';
import {
  applyWorld,
  currentWorld,
  defineWorlds,
  installWorlds,
  onWorldChange,
  perWorld,
  setWorld,
  worldFact,
  worldRegion,
} from '../dist/lagoon-worlds.js';

const WORLDS = defineWorlds({
  paused: { description: 'the member is paused', facts: { member: { id: 'm1', paused: true } }, regions: { actions: { seed: { tab: 'mine' } } } },
  'paused-late': { extends: 'paused', facts: { now: 'late' }, regions: { actions: { seed: { view: 'list' }, props: { nav: { compact: true } } } } },
  'no-week': { regions: { actions: { channels: { week: ['no-week-port'] } } } },
});

const reset = () => {
  installWorlds(WORLDS);
  setWorld('default');
};

test('an undeclared world refuses and leaves the active one as it was', () => {
  reset();
  assert.equal(setWorld('paused'), true);
  assert.equal(setWorld('nope'), false);
  assert.equal(currentWorld(), 'paused');
  assert.equal(setWorld(null), true);
  assert.equal(currentWorld(), 'default');
});

test('listeners hear a real change only', () => {
  reset();
  const heard = [];
  const off = onWorldChange((id) => heard.push(id));
  setWorld('paused');
  setWorld('paused');
  setWorld('nope');
  setWorld('default');
  off();
  setWorld('paused');
  assert.deepEqual(heard, ['paused', 'default']);
});

test('a fact falls back outside its world, and `extends` layers child over parent', () => {
  reset();
  assert.equal(worldFact('member', 'fallback'), 'fallback');
  setWorld('paused-late');
  assert.deepEqual(worldFact('member', null), { id: 'm1', paused: true });
  assert.equal(worldFact('now', 'early'), 'late');
  const r = worldRegion('actions');
  assert.deepEqual(r.seed, { tab: 'mine', view: 'list' });
  assert.deepEqual(r.props, { nav: { compact: true } });
  assert.equal(worldRegion('elsewhere'), null);
});

test('perWorld builds one value per world, so a context object keeps its identity', () => {
  reset();
  let built = 0;
  const member = perWorld(() => ({ n: ++built }));
  const a = member();
  assert.equal(member(), a);
  setWorld('paused');
  const b = member();
  assert.notEqual(b, a);
  setWorld('default');
  assert.equal(member(), a);
  assert.equal(built, 2);
});

test('applyWorld overlays seed and props, and leaves a region with no overlay untouched', () => {
  reset();
  const merged = { seed: { tab: 'all', week: 34 }, props: { nav: { label: 'x' } } };
  assert.equal(applyWorld('actions', merged), merged);
  setWorld('paused-late');
  const out = applyWorld('actions', merged);
  assert.deepEqual(out.seed, { tab: 'mine', week: 34, view: 'list' });
  assert.deepEqual(out.props, { nav: { label: 'x', compact: true } });
  assert.deepEqual(merged.seed, { tab: 'all', week: 34 }, 'the declared overrides are not mutated');
});

test('a re-answered source is rebuilt from its own spec with the world args, once per world', () => {
  reset();
  const src = { produces: [], create: () => ({ subscribe: () => () => {}, getState: () => ({}) }) };
  const ACTIONS = { id: 'actions', islands: [], sources: { week: src, other: src } };
  const week = channelFrom({ to: ACTIONS, id: 'week', args: ['default-port'] });
  const other = channelFrom({ to: ACTIONS, id: 'other', args: [] });
  const merged = { channels: [week, other] };
  setWorld('no-week');
  const a = applyWorld('actions', merged);
  const b = applyWorld('actions', merged);
  assert.equal(a.channels[1], other, 'a source the world does not name is kept as declared');
  assert.notEqual(a.channels[0], week);
  assert.equal(a.channels[0], b.channels[0], 'the rebuilt channel keeps its identity within one world');
  assert.equal(channelSourceId(a.channels[0]), 'week');
});
