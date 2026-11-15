// DOCKS — one region's island placed inside another region's arrangement, declared on both sides.
//
// One verdict function (`dockProblems`) serves `motu check` (which errors) and the lagoon (which refuses
// a composed dock state). These pin what it calls broken, on the shape that motivated the feature:
// « Ma Base » (`base`) docks its Conseil column into « Mon Équipage » (`equipage`), which it places.
//
// Run: node --test packages/core/test/docks.test.mjs   (after `node scripts/build-packages.mjs`)
import test from 'node:test';
import assert from 'node:assert/strict';
import { dockOf, dockIntoOf, docksOf, dockClaimsOf, dockGraph, dockProblems, dockStates, dockClaimant, composePath, regionRefOf, slotNameOf } from '../dist/index.js';

const Root = () => null;

/** The real case, as live configs. Each test edits a copy. */
function project() {
  return {
    base: {
      id: 'base',
      root: Root,
      slots: {
        conseil: { slot: 'base-conseil', dockInto: { region: 'equipage', dock: 'equipage-aside' } },
        timeline: 'teams-timeline',
        businessTeamPanel: { region: 'equipage' },
      },
      islands: [
        { slot: 'base-conseil', element: 'x-base-conseil', slots: { createConseil: 'create-conseil' } },
        { slot: 'create-conseil', element: 'x-conseil-create' },
        { slot: 'teams-timeline', element: 'x-teams-timeline' },
      ],
    },
    equipage: {
      id: 'equipage',
      root: Root,
      slots: { rocket: 'equipage-rocket', aside: { dock: 'equipage-aside' } },
      islands: [{ slot: 'equipage-rocket', element: 'x-equipage-rocket' }],
    },
  };
}
const errors = (configs) => dockProblems(dockGraph(configs)).filter((p) => p.level === 'error');

test('the declaration reads on both sides, and neither is mistaken for the other slot forms', () => {
  const { base, equipage } = project();
  assert.deepEqual(docksOf(equipage), { aside: 'equipage-aside' });
  assert.deepEqual(dockClaimsOf(base), [{ prop: 'conseil', slot: 'base-conseil', region: 'equipage', dock: 'equipage-aside', fallback: 'here' }]);
  assert.equal(dockOf(equipage.slots.aside), 'equipage-aside');
  assert.deepEqual(dockIntoOf(base.slots.conseil), { region: 'equipage', dock: 'equipage-aside', fallback: 'here' });
  // A claim is still an island slot of A; a region ref is neither a dock nor a claim.
  assert.equal(slotNameOf(base.slots.conseil), 'base-conseil');
  assert.equal(dockOf(base.slots.businessTeamPanel), undefined);
  assert.equal(regionRefOf(equipage.slots.aside), undefined);
});

test('the real case is clean, and is two composed states — one from each side', () => {
  const graph = dockGraph(project());
  assert.deepEqual(dockProblems(graph), []);
  assert.deepEqual(dockStates(graph), [
    { view: 'base', host: 'equipage', dock: 'equipage-aside', claimant: 'base', slot: 'base-conseil' },
    { view: 'equipage', host: 'equipage', dock: 'equipage-aside', claimant: 'base', slot: 'base-conseil' },
  ]);
  assert.equal(dockClaimant(graph, 'equipage', 'equipage-aside')?.region, 'base');
  assert.deepEqual(composePath(graph, 'base', 'equipage'), ['equipage']);
});

test('B renaming its dock fails A — the claim names a dock nobody opens', () => {
  const p = project();
  p.equipage.slots.aside = { dock: 'rocket-aside' };
  const [e] = errors(p);
  assert.equal(e.kind, 'unknown-dock');
  assert.equal(e.region, 'base');
  assert.match(e.message, /"equipage" opens no dock "equipage-aside" \(it opens: rocket-aside\)/);
});

test('a claim on a region nobody has is an error naming the id', () => {
  const p = project();
  p.base.slots.conseil.dockInto.region = 'equipag';
  const kinds = errors(p).map((x) => x.kind);
  assert.ok(kinds.includes('unknown-region'));
});

test('two islands in one dock: refused on both claimants and on the host', () => {
  const p = project();
  p.base.slots.timeline = { slot: 'teams-timeline', dockInto: { region: 'equipage', dock: 'equipage-aside' } };
  const taken = errors(p).filter((x) => x.kind === 'taken');
  assert.deepEqual(taken.map((x) => `${x.region}.${x.prop ?? ''}`).sort(), ['base.conseil', 'base.timeline', 'equipage.']);
  assert.match(taken[0].message, /a dock holds ONE island/);
  // And a refused dock is not a state anyone can open.
  assert.deepEqual(dockStates(dockGraph(p)), []);
});

test('A must compose B — a dock into a region A never places is refused, not guessed at', () => {
  const p = project();
  delete p.base.slots.businessTeamPanel;
  const [e] = errors(p);
  assert.equal(e.kind, 'not-composed');
  assert.match(e.message, /never composes "equipage"/);
});

test('composition may be transitive: A places C, C places B', () => {
  const p = project();
  p.base.slots.businessTeamPanel = { region: 'cockpit' };
  p.cockpit = { id: 'cockpit', root: Root, slots: { crew: { region: 'equipage' } }, islands: [] };
  assert.deepEqual(errors(p), []);
  assert.deepEqual(composePath(dockGraph(p), 'base', 'equipage'), ['cockpit', 'equipage']);
});

test('the docked island has ONE placement in A — also placing it elsewhere is refused', () => {
  const p = project();
  p.base.slots.conseilAgain = 'base-conseil';
  const [e] = errors(p);
  assert.equal(e.kind, 'also-placed');
  assert.match(e.message, /AND places it at slots\.conseilAgain/);
  // Nested in another island counts too.
  const q = project();
  q.base.islands[2].slots = { aside: 'base-conseil' };
  assert.equal(errors(q)[0].kind, 'also-placed');
});

test('the claimed slot must be one of A\'s islands', () => {
  const p = project();
  p.base.slots.conseil.slot = 'base-conseill';
  assert.ok(errors(p).some((x) => x.kind === 'unknown-slot'));
});

test('docking into your own region is refused — that is a slot', () => {
  const p = project();
  p.base.slots.mine = { dock: 'base-aside' };
  p.base.slots.conseil.dockInto = { region: 'base', dock: 'base-aside' };
  assert.ok(errors(p).some((x) => x.kind === 'self'));
});

test('a dock opened twice in one region, and either side without a root', () => {
  const p = project();
  p.equipage.slots.other = { dock: 'equipage-aside' };
  assert.ok(errors(p).some((x) => x.kind === 'duplicate-dock'));
  const q = project();
  delete q.equipage.root;
  delete q.base.root;
  const kinds = errors(q).filter((x) => x.kind === 'no-root').map((x) => x.region).sort();
  assert.deepEqual(kinds, ['base', 'equipage']);
});

test('an open dock nobody claims is a WARNING, not an error — B may land before A', () => {
  const p = project();
  delete p.base.slots.conseil;
  p.base.slots.conseil = 'base-conseil';
  const problems = dockProblems(dockGraph(p));
  assert.deepEqual(problems.map((x) => [x.level, x.kind]), [['warn', 'unclaimed']]);
});

test('`fallback: none` is read, and anything else is the default', () => {
  assert.equal(dockIntoOf({ dockInto: { region: 'b', dock: 'd', fallback: 'none' } }).fallback, 'none');
  assert.equal(dockIntoOf({ dockInto: { region: 'b', dock: 'd', fallback: 'elsewhere' } }).fallback, 'here');
  assert.equal(dockIntoOf({ dockInto: { region: 'b' } }), undefined);
});
