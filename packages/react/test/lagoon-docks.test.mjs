// COMPOSED DOCK STATES as addresses — `?region=base&state=base.dock.equipage.equipage-aside`.
//
// A composition is a declared state like any other: it round-trips through the address, resolves only
// when the declarations make it, and says what the view must MOUNT (the dock's region loaded on the
// claimant's side, the claimant's island as a guest on the host's). Driven against the built output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dockComposition, formatStateParam, parseStateParam, resolveDockState } from '../dist/lagoon-player.js';

const Root = () => null;
const CONFIGS = {
  base: {
    id: 'base',
    root: Root,
    slots: {
      conseil: { slot: 'base-conseil', dockInto: { region: 'equipage', dock: 'equipage-aside' } },
      businessTeamPanel: { region: 'equipage' },
    },
    islands: [{ slot: 'base-conseil', element: 'x-base-conseil' }],
  },
  equipage: { id: 'equipage', root: Root, slots: { aside: { dock: 'equipage-aside' } }, islands: [] },
  other: { id: 'other', root: Root, slots: {}, islands: [] },
};

test('a dock state round-trips through the address, and takes no step', () => {
  const ref = parseStateParam('base.dock.equipage.equipage-aside');
  assert.deepEqual(ref, { region: 'base', kind: 'dock', host: 'equipage', dock: 'equipage-aside', name: 'equipage.equipage-aside' });
  assert.equal(formatStateParam(ref), 'base.dock.equipage.equipage-aside');
  assert.match(parseStateParam('base.dock.equipage.equipage-aside@2').error, /no steps/);
  assert.match(parseStateParam('base.dock.equipage').error, /<region>\.dock\.<dock region>\.<dock>/);
});

test('only DECLARED compositions resolve — from either side', () => {
  assert.equal(resolveDockState(parseStateParam('base.dock.equipage.equipage-aside'), CONFIGS), null);
  assert.equal(resolveDockState(parseStateParam('equipage.dock.equipage.equipage-aside'), CONFIGS), null);
  assert.match(resolveDockState(parseStateParam('base.dock.equipage.nope'), CONFIGS), /declares no composed dock state "equipage\.nope" — it has: base\.dock\.equipage\.equipage-aside/);
  assert.match(resolveDockState(parseStateParam('other.dock.equipage.equipage-aside'), CONFIGS), /neither claims nor opens a claimed dock/);
});

test('what each side mounts: the path loaded in place, or the claimant as a guest', () => {
  const fromClaimant = dockComposition(parseStateParam('base.dock.equipage.equipage-aside'), CONFIGS);
  assert.deepEqual(fromClaimant, { load: ['equipage'], guests: [], slot: 'base-conseil', claimant: 'base' });
  const fromHost = dockComposition(parseStateParam('equipage.dock.equipage.equipage-aside'), CONFIGS);
  assert.deepEqual(fromHost.load, []);
  assert.deepEqual(fromHost.guests.map((g) => [g.region, g.claim.slot]), [['base', 'base-conseil']]);
  assert.equal(dockComposition(parseStateParam('other.dock.equipage.equipage-aside'), CONFIGS), null);
});
