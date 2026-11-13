// The null-island pass (constraint-loop item 2b): does the region's evidence depend on each island?
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNullIslands, reportNullIslands, NULL_PREFIX } from '../src/commands/verify/region-flows.mjs';

const recorder = () => {
  const rows = [];
  const push = (level) => (check, msg) => rows.push({ level, check, msg });
  return { rows, ok: push('ok'), warn: push('warn'), error: push('error'), skip: push('skip'), inconclusive: push('inconclusive') };
};
// As `readRegions` hands it over: `bind` normalised to an object, `{}` when the island binds nothing.
const region = {
  islands: [
    { slot: 'search', element: 'x-search', writes: { change: 'term' }, bind: {} },
    { slot: 'list', element: 'x-list', bind: { term: 'term' } },
    { slot: 'unasserted', element: 'x-u', bind: { term: 'term' } },
    { slot: 'later', element: 'x-l', planned: true, bind: { term: 'term' } },
  ],
};
const flows = [
  { name: 'a', steps: [{ expectRender: { search: 'Search...', list: 'Main' } }] },
  { name: 'b', steps: [{ emit: { slot: 'search', event: 'change', detail: 'x' }, expectRender: { list: 'x' } }] },
];

test('only asserted, built slots are nulled; a pure producer gets no `defaults` mutant', () => {
  const { slots, mutants } = buildNullIslands(region, flows);
  assert.deepEqual(slots, ['search', 'list']);
  const modes = (slot) => [...new Set(mutants.filter((m) => m.__nullIsland.slot === slot).map((m) => m.__nullIsland.mode))];
  assert.deepEqual(modes('search'), ['nothing'], 'a search box binding nothing renders from defaults ALWAYS');
  assert.deepEqual(modes('list'), ['defaults', 'nothing']);
  assert.equal(mutants.length, 2 * (1 + 2), 'every flow, per slot and mode');
  assert.ok(mutants.every((m) => m.name.startsWith(NULL_PREFIX)));
});

const result = (m, ok) => ({ scenario: m.name, step: 1, ok });

test('constrained: nulling each slot fails at least one flow', () => {
  const plan = buildNullIslands(region, flows);
  const r = recorder();
  reportNullIslands(r, plan.mutants.map((m) => result(m, m.name.endsWith(':: a') ? false : true)), plan);
  assert.deepEqual(r.rows.map((x) => x.level), ['ok']);
});

test('a slot whose flows all hold rendering from defaults is an error naming DEFAULTS', () => {
  const plan = buildNullIslands(region, flows);
  const r = recorder();
  // The list holds deaf to the region; rendering nothing still fails it.
  reportNullIslands(r, plan.mutants.map((m) => result(m, !(m.__nullIsland.mode === 'nothing'))), plan);
  const listRow = r.rows.find((x) => x.msg.startsWith('list:'));
  assert.equal(listRow.level, 'error');
  assert.match(listRow.msg, /DEFAULTS/);
});

test('a slot whose flows all hold with NOTHING rendered is the stronger error', () => {
  const plan = buildNullIslands(region, flows);
  const r = recorder();
  reportNullIslands(r, plan.mutants.map((m) => result(m, true)), plan);
  assert.ok(r.rows.filter((x) => x.level === 'error').every((x) => /NOTHING/.test(x.msg)));
});

test('no mutant came back — inconclusive, not a pass', () => {
  const plan = buildNullIslands(region, flows);
  const r = recorder();
  reportNullIslands(r, [], plan);
  assert.deepEqual(r.rows.map((x) => x.level), ['inconclusive']);
});

test('a mount path that cannot null an island is a skip, never a verdict', () => {
  const plan = buildNullIslands(region, flows);
  const r = recorder();
  reportNullIslands(r, plan.mutants.map((m) => ({ scenario: m.name, step: 1, ok: false, unsupported: true })), plan);
  assert.deepEqual(r.rows.map((x) => x.level), ['skip']);
});

// THE SHORT-CIRCUIT (the runner stops a kill group at its first failing step). It is only sound because
// the verdict is "did ANY flow fail?" — these pin the three things that make it so.
test('each (slot, mode) is one kill group, and flows that look at the slot run first', () => {
  const extra = [{ name: 'c', steps: [{ expectRender: { search: 'Search...' } }] }, ...flows];
  const { mutants } = buildNullIslands(region, extra);
  const group = (slot, mode) => mutants.filter((m) => m.__nullIsland.slot === slot && m.__nullIsland.mode === mode);
  for (const m of mutants) assert.equal(m.__killGroup, `null:${m.__nullIsland.slot}:${m.__nullIsland.mode}`);
  // `c` names only the search box, so for `list` it goes after the two flows that assert the list.
  assert.deepEqual(group('list', 'defaults').map((m) => m.name.split(':: ')[1]), ['a', 'b', 'c']);
  // For `search`: `c` and `a` assert it, `b` emits from it — all three look at it, declared order kept.
  assert.deepEqual(group('search', 'nothing').map((m) => m.name.split(':: ')[1]), ['c', 'a', 'b']);
});

test('a group the runner stopped at its first failure is still CONSTRAINED', () => {
  const plan = buildNullIslands(region, flows);
  const r = recorder();
  // What comes back when every group is killed by its first flow: one failing step per group, the
  // rest of the group never run.
  const firsts = [...new Map(plan.mutants.map((m) => [m.__killGroup, m])).values()];
  reportNullIslands(r, firsts.map((m) => result(m, false)), plan);
  assert.deepEqual(r.rows.map((x) => x.level), ['ok']);
});
