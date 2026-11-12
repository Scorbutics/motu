// `motu check — worlds`: the static rules over what was read. Each case is a way a world goes wrong
// that nothing else would say: a name that resolves to nothing, a seed that pins what a source must move,
// a world nobody runs in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgeWorlds } from '../src/lib/worlds.mjs';

const ACTIONS = {
  id: 'actions',
  slots: ['week-nav', 'list'],
  sources: { week: ['weekId', 'hasNoCurrentWeek'] },
  flows: [],
};
const flow = (name, world, seed = []) => ({ name, world, seed, line: 1 });
const W = (regions = {}, extra = {}) => ({ regions, facts: [], line: 3, ...extra });
const levels = (fs, check) => fs.filter((f) => f.check === check).map((f) => f.level);

test('a sound world in use: both rules pass, and nothing is warned', () => {
  const fs = judgeWorlds({
    worlds: { 'no-week': W({ actions: { seed: [], channels: ['week'], props: ['week-nav'], wire: false } }) },
    regions: [{ ...ACTIONS, flows: [flow('no week yet', 'no-week')] }],
  });
  assert.deepEqual(fs.map((f) => f.level), ['ok', 'ok']);
});

test('every name a world or a flow uses must resolve', () => {
  const fs = judgeWorlds({
    worlds: {
      a: W({ nowhere: { seed: [], channels: [], props: [] } }, { extends: 'ghost' }),
      b: W({ actions: { seed: [], channels: ['month'], props: ['sidebar'] } }),
    },
    regions: [{ ...ACTIONS, flows: [flow('f', 'typo')] }],
    screenFlows: [flow('s', 'also-typo')],
  });
  const msgs = fs.filter((f) => f.check === 'world-declared').map((f) => f.msg).join('\n');
  for (const needle of ['extends "ghost"', 'region "nowhere"', 'source "month"', 'slot "sidebar"', 'world "typo"', 'world "also-typo"']) {
    assert.match(msgs, new RegExp(needle), needle);
  }
  assert.ok(!levels(fs, 'world-declared').includes('ok'), 'no pass is printed beside the errors');
});

test('a world or a world flow seeding a source-produced key is the pinning trap', () => {
  const fs = judgeWorlds({
    worlds: { w: W({ actions: { seed: ['hasNoCurrentWeek'], channels: [], props: [] } }) },
    regions: [{ ...ACTIONS, flows: [flow('f', 'w', ['weekId', 'filter'])] }],
  });
  const pins = fs.filter((f) => f.check === 'world-pins');
  assert.equal(pins.length, 2);
  assert.match(pins[0].msg, /channels: \{ week/);
  assert.match(pins[1].msg, /seeds weekId/);
});

test('a flow WITHOUT a world may seed what it likes — that is the flows checks’ business, not this one', () => {
  const fs = judgeWorlds({ worlds: {}, regions: [{ ...ACTIONS, flows: [flow('f', null, ['weekId'])] }] });
  assert.deepEqual(levels(fs, 'world-pins'), ['ok']);
});

test('a world no flow names is a removal candidate, unless another world builds on it', () => {
  const fs = judgeWorlds({
    worlds: { base: W(), child: W({}, { extends: 'base' }), lonely: W() },
    regions: [{ ...ACTIONS, flows: [flow('f', 'child')] }],
  });
  const warned = fs.filter((f) => f.check === 'world-used').map((f) => f.msg);
  assert.equal(warned.length, 1);
  assert.match(warned[0], /"lonely"/);
});
