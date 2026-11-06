// A REGION INSIDE A REGION — `slots: { prop: { region: '<id>' } }` — and the references that must be
// REFUSED rather than rendered as something else.
//
// One verdict function (`regionRefProblems`) serves the lagoon, which refuses the placeholder, and
// `motu archipelago verify`, which errors. These pin what it calls broken: an id nobody has, a loop
// (including the one-region loop), and a reference from a region with no `root` to fill.
//
// Run: node --test packages/core/test/region-refs.test.mjs   (after `node scripts/build-packages.mjs`)
import test from 'node:test';
import assert from 'node:assert/strict';
import { regionRefOf, regionRefs, regionRefGraph, regionRefProblems, slotNameOf } from '../dist/index.js';

const Root = () => null;

test('the declaration: a region reference sits beside island slots in the root map', () => {
  const base = {
    id: 'base',
    root: Root,
    slots: { timeline: 'teams-timeline', closed: { slot: 'closed-teams', when: 'x' }, businessTeamPanel: { region: 'equipage' } },
    islands: [],
  };
  assert.deepEqual(regionRefs(base), { businessTeamPanel: 'equipage' });
  assert.equal(regionRefOf(base.slots.businessTeamPanel), 'equipage');
  // An island entry, in either form, is not a reference.
  assert.equal(regionRefOf(base.slots.timeline), undefined);
  assert.equal(regionRefOf(base.slots.closed), undefined);
  assert.equal(slotNameOf(base.slots.closed), 'closed-teams');
});

test('a clean graph has no problems — the child stays its own region', () => {
  const graph = regionRefGraph({
    base: { root: Root, slots: { businessTeamPanel: { region: 'equipage' } } },
    equipage: { root: Root, slots: { list: 'business-team-panel' } },
  });
  assert.deepEqual(graph, {
    base: { root: true, refs: { businessTeamPanel: 'equipage' } },
    equipage: { root: true, refs: {} },
  });
  assert.deepEqual(regionRefProblems(graph), []);
});

test('a reference to a region that does not exist is an error naming the id', () => {
  const problems = regionRefProblems({ base: { root: true, refs: { panel: 'equipag' } }, equipage: { root: true, refs: {} } });
  assert.equal(problems.length, 1);
  assert.equal(problems[0].kind, 'unknown');
  assert.equal(problems[0].ref, 'equipag');
  assert.match(problems[0].message, /no region has that id/);
  assert.match(problems[0].message, /known: base, equipage/);
});

test('a cycle is rejected, from every region on it', () => {
  const problems = regionRefProblems({
    a: { root: true, refs: { p: 'b' } },
    b: { root: true, refs: { q: 'c' } },
    c: { root: true, refs: { r: 'a' } },
    outside: { root: true, refs: { s: 'a' } },
  });
  const cycles = problems.filter((p) => p.kind === 'cycle');
  assert.deepEqual(cycles.map((p) => p.region).sort(), ['a', 'b', 'c'], 'each region on the loop errors');
  assert.deepEqual(cycles.find((p) => p.region === 'a').path, ['a', 'b', 'c', 'a']);
  // A region that only POINTS INTO a loop is not on it: its own reference is not the cycle.
  assert.ok(!problems.some((p) => p.region === 'outside'));
});

test('a region cannot contain itself', () => {
  const problems = regionRefProblems({ a: { root: true, refs: { p: 'a' } } });
  assert.equal(problems.length, 1);
  assert.equal(problems[0].kind, 'cycle');
  assert.deepEqual(problems[0].path, ['a', 'a']);
});

test('a reference from a region with no root has no prop to fill', () => {
  const problems = regionRefProblems({ a: { root: false, refs: { p: 'b' } }, b: { root: true, refs: {} } });
  assert.equal(problems.length, 1);
  assert.equal(problems[0].kind, 'no-root');
});
