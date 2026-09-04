// `slots`, read by a parser instead of by two regexes in two commands.
//
// Same story as `sources`, one keyword over. `verify` asked "which slots does an island fill" and
// `integrate check` asked "which slot fills each root prop" — the same declaration, two hand-rolled
// readers, and `verify` was already IMPORTING a correct ts-morph reader (`nestedSlots`) that it used
// 400 lines above the regex.
//
// Every case below is a shape one of those regexes got wrong. The comments they carried are the
// source: an unanchored multi-line pattern "ran on to the next line beginning with `},` — swallowing
// the island entries below and reading their `bind` pairs as slot mappings", and a `declaredSlots`
// built from every `slot:` in the file, which silently included the region-level map's own object
// form.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rootSlots, declaredSlotNames, nestedSlots } from '../src/lib/lagoon-declares.mjs';

const dir = mkdtempSync(join(tmpdir(), 'motu-declared-slots-'));
let n = 0;
const write = (body) => {
  const file = join(dir, `s${n++}.archipelago.ts`);
  writeFileSync(file, body);
  return file;
};

const REGION = `
  import { Root } from '@/app/x/layout';
  export const a = archipelago<R, E, P>()({
    id: 'x',
    root: Root,
    slots: { card: 'card-slot', panel: { slot: 'panel-slot', when: 'showPanel' } },
    islands: [
      { slot: 'card-slot', element: 'x-card', bind: ['a', 'b'], slots: { inner: 'inner-slot' } },
      { slot: 'panel-slot', element: 'x-panel', bind: ['c'] },
      { slot: 'inner-slot', element: 'x-inner' },
    ],
  } as const, { ownership: true });
`;

test('reads the region map in both value forms', () => {
  assert.deepEqual(rootSlots(write(REGION)), { card: 'card-slot', panel: 'panel-slot' });
});

test('a one-line region map does not swallow the island entries below it', () => {
  // THE BUG, verbatim from the regex's own comment: on a one-line `slots: { card: 'x' },` the
  // multi-line pattern ran to the next `},` and read the ISLANDS' `bind` pairs as slot mappings, so
  // five props of one card were reported as slots the archipelago never declared.
  const map = rootSlots(write(REGION));
  assert.deepEqual(Object.keys(map).sort(), ['card', 'panel']);
  for (const invented of ['a', 'b', 'c', 'element', 'bind']) {
    assert.ok(!(invented in map), `${invented} is an island's property, not a root slot`);
  }
});

test('indentation is not part of the declaration', () => {
  // Both patterns were anchored at `^ {2}slots`. A region nested one level deeper — or reformatted —
  // returned an EMPTY map, which reads as "this root fills no slots", so every prop the page passed
  // came back as undeclared.
  const deep = write(REGION.replace(/^ {4}/gm, '        '));
  assert.deepEqual(rootSlots(deep), { card: 'card-slot', panel: 'panel-slot' });
});

test('a region with no root has no answer, which is not the same as no slots', () => {
  const file = write(`export const a = archipelago()({ id: 'x', islands: [{ slot: 's', element: 'x-s' }] } as const);`);
  assert.equal(rootSlots(file), null);
});

test('declared slots come from the ISLAND ENTRIES, not from every `slot:` in the file', () => {
  // THE HOLE THIS CLOSES, measured on a real project: the old set took every `slot: '…'`, which
  // included the region-level map's object form. So a slot NAMED there and declared by no island
  // entry counted as declared — and an island filling it passed the very check meant to catch that.
  const file = write(`
    export const a = archipelago()({
      id: 'x',
      root: Root,
      slots: { ghost: { slot: 'ghost-slot', when: 'k' }, card: 'card-slot' },
      islands: [
        { slot: 'card-slot', element: 'x-card', slots: { inner: 'ghost-slot' } },
      ],
    } as const);
  `);
  assert.deepEqual([...declaredSlotNames(file)], ['card-slot']);
  // And the composition check's inputs then disagree, which is the error it exists to raise.
  const filled = [...nestedSlots(file)];
  assert.deepEqual(filled, ['ghost-slot']);
  assert.deepEqual(
    filled.filter((s) => !declaredSlotNames(file).has(s)),
    ['ghost-slot'],
  );
});

test('the region map is not counted as a nested fill', () => {
  // The regex deleted the region's block by indentation before scanning. Counting it made every root
  // slot read as an island nested inside another, which is a different claim entirely.
  assert.deepEqual([...nestedSlots(write(REGION))], ['inner-slot']);
});

test('an unparseable file answers safely in both directions', () => {
  const bad = write(`this is ( not { valid ] typescript`);
  // null for the map: "no answer", so no prop is reported as an undeclared slot.
  assert.equal(rootSlots(bad), null);
  // empty for the declared set: a filled slot is then reported rather than silently approved.
  assert.deepEqual([...declaredSlotNames(bad)], []);
});
