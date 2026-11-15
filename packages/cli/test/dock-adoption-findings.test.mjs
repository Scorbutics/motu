// Findings from adopting docks in a real Next app (Peps, « Ma Base » + « Mon Équipage Business »).
//
//   #3  a dock the host layout never renders: `archipelago verify` and `integrate check` both passed,
//       only `--runtime` noticed. Now read from the root component's own source.
//   #4a `integrate check` printed "1 warning(s)" over two `!` rows: a `skip` wore the warning mark.
//   #4b in a composed dock state, the dock region's asks were counted as this region's unattributed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { composedRegionsOf, rootRendersProps } from '../src/lib/docks.mjs';
import { attributeComposedAsks } from '../src/commands/verify/reach.mjs';
import { integrationMark } from '../src/commands/integration.mjs';

function layout(body) {
  const dir = mkdtempSync(join(tmpdir(), 'motu-dock-root-'));
  writeFileSync(join(dir, 'equipage-layout.tsx'), body);
  return { root: 'EquipageLayout', rootFrom: './equipage-layout', file: join(dir, 'equipage.archipelago.ts'), dir };
}

// The app's layout, reduced: `aside` is the dock prop.
const RENDERS = `
import type { ReactNode } from 'react';
export function EquipageLayout({ rocket, aside }: { rocket?: ReactNode; aside?: ReactNode }) {
  return <section><div>{rocket}</div><div data-part="equipage-aside">{aside}</div></section>;
}`;
// The refactor that broke it: \`{aside}\` dropped, the prop still in the signature.
const DROPS = RENDERS.replace('{aside}', '');

test('#3 a root that renders the dock prop passes', () => {
  const r = rootRendersProps(layout(RENDERS), ['aside']);
  assert.equal(r.unread, null);
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.unknown, []);
  assert.match(r.file, /equipage-layout\.tsx$/);
});

test('#3 a root that destructures the dock prop and never renders it is caught, naming the file', () => {
  const r = rootRendersProps(layout(DROPS), ['aside']);
  assert.deepEqual(r.missing, ['aside']);
  assert.equal(r.component, 'EquipageLayout');
  assert.match(r.file, /equipage-layout\.tsx$/);
});

test('#3 the other shapes a root takes: never destructured, a props bag, a rest spread, memo, a re-export', () => {
  const missing = (body) => rootRendersProps(layout(body), ['aside']);
  assert.deepEqual(missing(`export function EquipageLayout({ rocket }: any) { return <div>{rocket}</div>; }`).missing, ['aside']);
  assert.deepEqual(missing(`export function EquipageLayout(props: any) { return <div>{props.aside}</div>; }`).missing, []);
  assert.deepEqual(missing(`export function EquipageLayout(props: any) { return <div>{props.rocket}</div>; }`).missing, ['aside']);
  // A rest spread could carry it: unknown, never an error.
  const rest = missing(`export function EquipageLayout({ rocket, ...rest }: any) { return <Frame {...rest}>{rocket}</Frame>; }`);
  assert.deepEqual([rest.missing, rest.unknown], [[], ['aside']]);
  // A JSX attribute NAMED like the prop is not a use of it.
  assert.deepEqual(missing(`export function EquipageLayout({ aside }: any) { return <Other aside={null} />; }`).missing, ['aside']);
  assert.deepEqual(missing(`export const EquipageLayout = memo(({ aside }: any) => <div>{aside}</div>);`).missing, []);
  const re = layout(`export { Inner as EquipageLayout } from './inner';`);
  writeFileSync(join(re.dir, 'inner.tsx'), DROPS.replace('EquipageLayout', 'Inner'));
  const r = rootRendersProps(re, ['aside']);
  assert.deepEqual(r.missing, ['aside']);
  assert.match(r.file, /inner\.tsx$/);
});

test('#3 a root that cannot be read is said, not passed', () => {
  assert.match(rootRendersProps({ root: 'X', rootFrom: './nope', file: '/tmp/none/a.ts' }, ['aside']).unread, /does not resolve/);
  assert.match(rootRendersProps({ root: null }, ['aside']).unread, /no `root`/);
});

test('#4a a skip row is marked as a skip, not as a warning', () => {
  const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
  assert.equal(strip(integrationMark('skip')), '–');
  assert.equal(strip(integrationMark('warn')), '!');
  assert.equal(strip(integrationMark('error')), '✗');
});

test('#4b an unattributed ask only the composed region declares is charged to that region', () => {
  const asks = [
    { via: 'wire', label: 'table:business_spheres(select)', owner: 'unattributed' },
    { via: 'wire', label: 'table:teams(select)', owner: 'unattributed' },
    { via: 'wire', label: 'table:both(select)', owner: 'unattributed' },
    { via: 'wire', label: 'table:teams(select)', owner: 'source:teams' },
  ];
  const own = { 'source:teams': ['table:teams(select)', 'table:both(select)'] };
  const composed = [{ region: 'equipage', reach: { 'source:crew': ['table:business_spheres(select)', 'table:both(select)'] } }];
  assert.deepEqual(
    attributeComposedAsks(asks, own, composed).map((a) => a.owner),
    ['region:equipage', 'unattributed', 'unattributed', 'source:teams'],
  );
  // No composition: nothing moves.
  assert.deepEqual(attributeComposedAsks(asks, own, []), asks);
});

test('#4b the regions a composed dock state puts on screen, from both sides', () => {
  const dir = mkdtempSync(join(tmpdir(), 'motu-composed-'));
  const write = (id, text) => {
    mkdirSync(join(dir, id), { recursive: true });
    writeFileSync(join(dir, id, `${id}.archipelago.ts`), text);
  };
  write('base', `import { archipelago } from '@motujs/core';
import { BaseLayout } from './base-layout';
export const baseArchipelago = archipelago()({
  id: 'base',
  root: BaseLayout,
  slots: {
    conseil: { slot: 'base-conseil', dockInto: { region: 'equipage', dock: 'equipage-aside' } },
    businessTeamPanel: { region: 'equipage' },
  },
  islands: [{ slot: 'base-conseil', element: 'x-base-conseil' }],
} as const);`);
  write('equipage', `import { archipelago } from '@motujs/core';
import { EquipageLayout } from './equipage-layout';
export const equipageArchipelago = archipelago()({
  id: 'equipage',
  root: EquipageLayout,
  slots: { rocket: 'equipage-rocket', aside: { dock: 'equipage-aside' } },
  islands: [{ slot: 'equipage-rocket', element: 'x-equipage-rocket' }],
} as const);`);
  assert.deepEqual(composedRegionsOf('base', dir), ['equipage']);
  assert.deepEqual(composedRegionsOf('equipage', dir), ['base']);
});
