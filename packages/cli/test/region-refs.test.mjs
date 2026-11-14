// A REGION INSIDE A REGION, from the CLI's side: `slots: { prop: { region: '<id>' } }`.
//
// What has to hold, and why each is here:
//   - `archipelago verify` refuses a reference it cannot honour (an unknown id, a cycle) — an ERROR,
//     never a default — and does NOT count the child's islands or keys as the parent's, or the
//     referenced prop as an uncovered slot;
//   - `integrate check` accepts the child region's composition placed in the parent's prop, and says
//     so when the page leaves the prop empty or never composes the child;
//   - removal rewrites BOTH roots: `<Equipage.Root />` nested in the parent's prop passes no prop at
//     all, which is exactly where guessing a root's region by its props fails.
//
// The project is a throwaway directory written per run: two regions, a page, two composition roots.
// The CLI is spawned against it, the way `motu check` runs, rather than its internals poked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Project } from 'ts-morph';
import { regionRefsDeclared } from '../src/lib/lagoon-declares.mjs';
import { readRegions } from '../src/lib/eject.mjs';
import { rewriteMotuJsx } from '../src/commands/removal-check.mjs';

const CLI = resolve(dirname(fileURLToPath(import.meta.url)), '../src/cli.mjs');

const ARCH = (id, body) => `import { archipelago } from '@motujs/core';\n${body.replace(/ID/g, id)}\n`;

function project(files) {
  const dir = mkdtempSync(join(tmpdir(), 'motu-region-refs-'));
  const all = { 'motu.config.json': JSON.stringify({ host: 'next' }), ...files };
  for (const [rel, text] of Object.entries(all)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  return dir;
}

const BASE = ARCH(
  'base',
  `import { BaseLayout } from '@/app/base-layout';
import type { BaseRegion } from '@/app/base-region';
export const baseArchipelago = archipelago<BaseRegion>()({
  id: 'base',
  root: BaseLayout,
  slots: { main: 'base-main', businessTeamPanel: { region: 'equipage' } },
  islands: [{ slot: 'base-main', element: 'x-base-main', bind: ['a'] }],
} as const, { ownership: true });`,
);
const EQUIPAGE = ARCH(
  'equipage',
  `import { EquipageLayout } from '@/app/equipage-layout';
import type { EquipageRegion } from '@/app/equipage-region';
export const equipageArchipelago = archipelago<EquipageRegion>()({
  id: 'equipage',
  root: EquipageLayout,
  slots: { list: 'equipage-list' },
  islands: [{ slot: 'equipage-list', element: 'x-equipage-list', bind: ['secretKey'], writes: { picked: 'pickedKey' } }],
} as const, { ownership: true });`,
);
const REGIONS = {
  'src/archipelagos/base/base.archipelago.ts': BASE,
  'src/archipelagos/equipage/equipage.archipelago.ts': EQUIPAGE,
};
const BINDINGS = {
  'components/motu/base-region.tsx': `'use client';
import { createRegion } from '@motujs/react';
import { baseArchipelago } from '../../src/archipelagos/base/base.archipelago';
export const Base = createRegion(baseArchipelago, { elements: [] });
`,
  'components/motu/equipage-region.tsx': `'use client';
import { createRegion } from '@motujs/react';
import { equipageArchipelago } from '../../src/archipelagos/equipage/equipage.archipelago';
export const Equipage = createRegion(equipageArchipelago, { elements: [] });
`,
};
const page = (panel) => `import { Base } from '../components/motu/base-region';
import { Equipage } from '../components/motu/equipage-region';
export default function Page() {
  const { a } = Base.useRegion();
  return (
    <Base.Region>
      <Base.Root main={<p>{a}</p>}${panel === null ? '' : `\n        businessTeamPanel={${panel}}`}
      />
    </Base.Region>
  );
}
`;

function cli(dir, args) {
  const r = spawnSync(process.execPath, [CLI, ...args, '--json'], { cwd: dir, encoding: 'utf8' });
  try {
    return JSON.parse(r.stdout);
  } catch {
    throw new Error(`motu ${args.join(' ')} did not print JSON (exit ${r.status}):\n${r.stdout}\n${r.stderr}`);
  }
}
const findingsOf = (json, id) => {
  const region = (json.regions ?? json.results ?? [json]).find((r) => (r.id ?? r.kebab) === id) ?? json;
  return region.findings ?? region.report?.findings ?? [];
};
const verify = (dir, id) => findingsOf(cli(dir, ['archipelago', 'verify', id]), id);
const integrate = (dir, id) => findingsOf(cli(dir, ['integrate', 'check', id]), id);
const refRows = (findings) => findings.filter((f) => f.check === 'region-ref');

test('the declaration is read: a region reference beside island slots', () => {
  const dir = project(REGIONS);
  try {
    assert.deepEqual(regionRefsDeclared(join(dir, 'src/archipelagos/base/base.archipelago.ts')), { businessTeamPanel: 'equipage' });
    assert.deepEqual(regionRefsDeclared(join(dir, 'src/archipelagos/equipage/equipage.archipelago.ts')), {});
    // `readRegions` keeps the island slots and the region references apart.
    const base = readRegions(join(dir, 'src/archipelagos')).find((r) => r.id === 'base');
    assert.deepEqual(base.rootSlots, { main: 'base-main' });
    assert.deepEqual(base.rootRegions, { businessTeamPanel: 'equipage' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('verify: the reference is reported, and the child is not counted as the parent', () => {
  const dir = project(REGIONS);
  try {
    const base = verify(dir, 'base');
    const rows = refRows(base);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].level, 'ok');
    assert.match(rows[0].msg, /businessTeamPanel → region equipage/);
    // The child's keys and islands are not the parent's.
    const text = JSON.stringify(base);
    for (const theirs of ['secretKey', 'pickedKey', 'equipage-list', 'x-equipage-list']) {
      assert.ok(!text.includes(theirs), `base's report mentions equipage's ${theirs}`);
    }
    // The referenced prop is not an uncovered or unplaced slot of the parent.
    const coverage = base.find((f) => f.check === 'render-coverage');
    assert.ok(coverage && !/businessTeamPanel/.test(coverage.msg), 'the region slot is not reported as uncovered');
    assert.ok(!base.some((f) => f.level === 'error' && /businessTeamPanel/.test(f.msg)));
    // And the child knows who it fills.
    const equipage = refRows(verify(dir, 'equipage'));
    assert.equal(equipage.length, 1);
    assert.match(equipage[0].msg, /fills base\.businessTeamPanel/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('verify: a reference to a region that does not exist is an ERROR', () => {
  const dir = project({ 'src/archipelagos/base/base.archipelago.ts': BASE.replace("region: 'equipage'", "region: 'equipag'") });
  try {
    const errors = refRows(verify(dir, 'base')).filter((f) => f.level === 'error');
    assert.equal(errors.length, 1);
    assert.match(errors[0].msg, /"equipag", and no region has that id/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('verify: a cycle is an ERROR on every region in it', () => {
  const dir = project({
    ...REGIONS,
    'src/archipelagos/equipage/equipage.archipelago.ts': EQUIPAGE.replace(
      "slots: { list: 'equipage-list' }",
      "slots: { list: 'equipage-list', back: { region: 'base' } }",
    ),
  });
  try {
    for (const id of ['base', 'equipage']) {
      const errors = refRows(verify(dir, id)).filter((f) => f.level === 'error');
      assert.equal(errors.length, 1, `${id} should report the cycle`);
      assert.match(errors[0].msg, /leads back to it/);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('verify: a region with no root has no prop for a region to fill', () => {
  const dir = project({ ...REGIONS, 'src/archipelagos/base/base.archipelago.ts': BASE.replace('  root: BaseLayout,\n', '') });
  try {
    const errors = refRows(verify(dir, 'base')).filter((f) => f.level === 'error');
    assert.equal(errors.length, 1);
    assert.match(errors[0].msg, /declares no `root`/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('integrate: the child region composed in the parent prop is accepted', () => {
  const dir = project({
    ...REGIONS,
    ...BINDINGS,
    'app/page.tsx': page('<Equipage.Region><Equipage.Root list={<ul />} /></Equipage.Region>'),
  });
  try {
    const base = integrate(dir, 'base');
    const rows = refRows(base);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].level, 'ok');
    assert.match(rows[0].msg, /businessTeamPanel holds region "equipage"/);
    // The parent's placement checks ignore the child's islands, and the prop is not an unknown slot.
    assert.ok(!base.some((f) => f.level === 'error'), JSON.stringify(base.filter((f) => f.level === 'error')));
    // The child is still checked as its own region, and its composition counts as mounted.
    const equipage = integrate(dir, 'equipage');
    assert.equal(equipage.find((f) => f.check === 'mounted')?.level, 'ok');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('integrate: through an application component that renders the child region', () => {
  const dir = project({
    ...REGIONS,
    ...BINDINGS,
    'app/page.tsx': page('<EquipagePanel />').replace(
      "import { Equipage } from '../components/motu/equipage-region';",
      "import { EquipagePanel } from './equipage-panel';",
    ),
    'app/equipage-panel.tsx': `import { Equipage } from '../components/motu/equipage-region';
export function EquipagePanel() {
  return <Equipage.Region><Equipage.Root list={<ul />} /></Equipage.Region>;
}
`,
  });
  try {
    const rows = refRows(integrate(dir, 'base'));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].level, 'ok');
    assert.match(rows[0].msg, /through a component/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('integrate: a prop never passed is an ERROR, something else in it is a WARNING', () => {
  const missing = project({ ...REGIONS, ...BINDINGS, 'app/page.tsx': page(null).replace('<Base.Region>', '<Base.Region><Equipage.Region />') });
  const other = project({ ...REGIONS, ...BINDINGS, 'app/page.tsx': page('<div>not the region</div>').replace('<Base.Region>', '<Base.Region><Equipage.Region />') });
  const uncomposed = project({
    ...REGIONS,
    'components/motu/base-region.tsx': BINDINGS['components/motu/base-region.tsx'],
    'app/page.tsx': page('<div />').replace("import { Equipage } from '../components/motu/equipage-region';\n", ''),
  });
  try {
    const m = refRows(integrate(missing, 'base'));
    assert.equal(m[0]?.level, 'error');
    assert.match(m[0].msg, /never passes businessTeamPanel/);
    const o = refRows(integrate(other, 'base'));
    assert.equal(o[0]?.level, 'warn');
    assert.match(o[0].msg, /nothing in it renders <Equipage\.Region>/);
    const u = refRows(integrate(uncomposed, 'base'));
    assert.equal(u[0]?.level, 'error');
    assert.match(u[0].msg, /never composes it/);
  } finally {
    for (const d of [missing, other, uncomposed]) rmSync(d, { recursive: true, force: true });
  }
});

test('removal: both roots are rewritten, the nested one included, and the wrappers unwrap', () => {
  const dir = project({
    ...REGIONS,
    ...BINDINGS,
    'app/page.tsx': page('<Equipage.Region><Equipage.Root /></Equipage.Region>'),
  });
  try {
    const regions = readRegions(join(dir, 'src/archipelagos'));
    const proj = new Project({ skipAddingFilesFromTsConfig: true, compilerOptions: { jsx: 4 } });
    const sf = proj.addSourceFileAtPath(join(dir, 'app/page.tsx'));
    const resolveSpec = (from, spec) => {
      const base = resolve(dirname(typeof from === 'string' ? from : from.getFilePath()), spec);
      return `${base}.tsx`;
    };
    rewriteMotuJsx(sf, regions, new Set(['Base', 'Equipage']), resolveSpec);
    const out = sf.getFullText();
    assert.match(out, /<BaseLayout\b/, 'the parent root became the application layout');
    // The nested root passes NO prop, so only its binding can say which region it is. Before, it was
    // replaced with `null` and the proof ran against a page with the child region deleted.
    assert.match(out, /businessTeamPanel=\{<EquipageLayout \/>\}/, out);
    assert.doesNotMatch(out, /Equipage\.Region|Equipage\.Root|Base\.Region|Base\.Root/);
    assert.equal(sf.getPreEmitDiagnostics().filter((d) => d.getCategory() === 1 && d.getCode() < 2000).length, 0, 'the rewritten page still parses');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
