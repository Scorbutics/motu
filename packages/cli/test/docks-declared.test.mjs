// DOCKS, READ FROM SOURCE — what `motu check` sees in an archipelago file, and the verdict on it.
//
// The CLI parses archipelagos (it cannot import them: they import the application), so the static
// check stands or falls on `docksDeclared` reading exactly what core's `dockGraph` reads from a live
// config. These pin that the two agree on the real case, and that an unreadable claim is SAID rather
// than dropped.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dockGraph, dockProblems } from '@motujs/core';
import { docksDeclared } from '../src/lib/lagoon-declares.mjs';
import { dockGraphOnDisk, docksOfRegion } from '../src/lib/docks.mjs';

const BASE = `
import { archipelago } from '@motujs/core';
import { BaseLayout } from '@/app/base-layout';
export const baseArchipelago = archipelago<R>()({
  id: 'base',
  root: BaseLayout,
  slots: {
    // the island stays base's; its DOM goes into equipage's dock
    conseil: { slot: 'base-conseil', dockInto: { region: 'equipage', dock: 'equipage-aside' } },
    timeline: 'teams-timeline',
    businessTeamPanel: { region: 'equipage' },
  },
  islands: [
    { slot: 'base-conseil', element: 'x-base-conseil', slots: { createConseil: 'create-conseil' } },
    { slot: 'create-conseil', element: 'x-conseil-create' },
    { slot: 'teams-timeline', element: 'x-teams-timeline' },
  ],
} as const, { ownership: true });
`;
const EQUIPAGE = `
import { archipelago } from '@motujs/core';
import { EquipageLayout } from '@/app/equipage-layout';
export const equipageArchipelago = archipelago<R>()({
  id: 'equipage',
  root: EquipageLayout,
  slots: { rocket: 'equipage-rocket', aside: { dock: 'equipage-aside' } },
  islands: [{ slot: 'equipage-rocket', element: 'x-equipage-rocket' }],
} as const, { ownership: true });
`;

function project(files) {
  const dir = mkdtempSync(join(tmpdir(), 'motu-docks-'));
  for (const [id, text] of Object.entries(files)) {
    mkdirSync(join(dir, id), { recursive: true });
    writeFileSync(join(dir, id, `${id}.archipelago.ts`), text);
  }
  return dir;
}

test('the parser reads what a live config says — the same node core builds', () => {
  const dir = project({ base: BASE, equipage: EQUIPAGE });
  const base = docksDeclared(join(dir, 'base', 'base.archipelago.ts'));
  assert.deepEqual(base.claims, [{ prop: 'conseil', slot: 'base-conseil', region: 'equipage', dock: 'equipage-aside', fallback: 'here' }]);
  assert.deepEqual(base.refs, { businessTeamPanel: 'equipage' });
  assert.deepEqual(base.islandSlots, ['base-conseil', 'create-conseil', 'teams-timeline']);
  const live = dockGraph({
    base: {
      root: () => null,
      slots: {
        conseil: { slot: 'base-conseil', dockInto: { region: 'equipage', dock: 'equipage-aside' } },
        timeline: 'teams-timeline',
        businessTeamPanel: { region: 'equipage' },
      },
      islands: [
        { slot: 'base-conseil', slots: { createConseil: 'create-conseil' } },
        { slot: 'create-conseil' },
        { slot: 'teams-timeline' },
      ],
    },
  }).base;
  const { unreadable, ...parsed } = base;
  assert.deepEqual(unreadable, []);
  assert.deepEqual(parsed, live);
  const equipage = docksDeclared(join(dir, 'equipage', 'equipage.archipelago.ts'));
  assert.deepEqual(equipage.docks, { aside: 'equipage-aside' });
});

test('the real case on disk: clean, and both regions see the composition', () => {
  const dir = project({ base: BASE, equipage: EQUIPAGE });
  const { graph } = dockGraphOnDisk(dir);
  assert.deepEqual(dockProblems(graph), []);
  const base = docksOfRegion('base', dir);
  const equipage = docksOfRegion('equipage', dir);
  assert.deepEqual(base.states.map((s) => `${s.view}.dock.${s.host}.${s.dock}`), ['base.dock.equipage.equipage-aside']);
  assert.deepEqual(equipage.states.map((s) => `${s.view}.dock.${s.host}.${s.dock}`), ['equipage.dock.equipage.equipage-aside']);
  assert.deepEqual(equipage.filledBy.map((f) => `${f.claimant}.${f.slot}`), ['base.base-conseil']);
});

test('a broken side is reported on the region that has to change', () => {
  const dir = project({ base: BASE.replace("dock: 'equipage-aside' }", "dock: 'equipage-asid' }"), equipage: EQUIPAGE });
  const base = docksOfRegion('base', dir);
  assert.equal(base.problems[0].kind, 'unknown-dock');
  assert.match(base.problems[0].message, /opens no dock "equipage-asid" \(it opens: equipage-aside\)/);
  // equipage's dock is now unclaimed — a warning on equipage, not an error.
  assert.deepEqual(docksOfRegion('equipage', dir).problems.map((p) => [p.level, p.kind]), [['warn', 'unclaimed']]);
});

test('a claim not written as literals is UNREADABLE, never silently absent', () => {
  const dir = project({ base: BASE.replace("dockInto: { region: 'equipage', dock: 'equipage-aside' }", 'dockInto: target'), equipage: EQUIPAGE });
  const base = docksDeclared(join(dir, 'base', 'base.archipelago.ts'));
  assert.deepEqual(base.unreadable, ['slots.conseil.dockInto']);
  assert.deepEqual(docksOfRegion('base', dir).unreadFields, ['slots.conseil.dockInto']);
});
