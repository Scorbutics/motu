// A page that READS its region back must survive eject — all three shapes of it.
//
// `ejectFile` walks the same `regionReads` array three times, once per shape of the call:
//   1a  const x = useRegionValue('k')          — a single key
//   1b  const { a, b } = X.useRegion()         — destructured
//   1c  const region = X.useRegion()           — the whole region under one name
//
// 1b ends with `decl.getVariableStatement()?.remove()`, which FORGETS the call node inside it. 1c then
// reached for `call.getParentIfKind(...)` on that same forgotten node and threw "Attempted to get
// information from a node that was removed or forgotten" — the surgery aborted, the file was left
// untouched, and `removal-check` reported the host as load-bearing on three pages whose only crime was
// to use the destructured form the docs recommend. The TS errors printed afterwards all named those
// untouched files, so the real cause was invisible.
//
// Asserting on the OUTPUT rather than on "it did not throw": the throw was caught and turned into a
// one-line note, so a test that only checked for an exception would have passed against the bug.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Project } from 'ts-morph';
import { ejectFile } from '../src/lib/eject.mjs';

const REGIONS = [{ id: 'demo', islands: [], sources: [], root: null, rootFrom: null, rootSlots: {}, rootHostSlots: {} }];

function eject(source) {
  const project = new Project({ useInMemoryFileSystem: true });
  const sf = project.createSourceFile('page.tsx', source, { overwrite: true });
  ejectFile(sf, REGIONS, new Map());
  return sf.getFullText();
}

test('the destructured form becomes state and does not abort the surgery', () => {
  const out = eject(`
    import { Demo } from '@/components/motu/demo-region';
    export default function Page() {
      const { query = "", filters } = Demo.useRegion();
      return <div>{query}{filters}</div>;
    }
  `);
  assert.match(out, /useState/, 'the read should have become state');
  assert.doesNotMatch(out, /useRegion\(\)/, 'the region read should be gone');
});

test('a destructured read and a whole-region read in ONE file both eject', () => {
  // The regression: two calls in the same file, so 1b forgets the first and 1c walks over it.
  const out = eject(`
    import { Demo } from '@/components/motu/demo-region';
    export function A() {
      const { query = "" } = Demo.useRegion();
      return <div>{query}</div>;
    }
    export function B() {
      const region = Demo.useRegion();
      return <div>{region.filters}</div>;
    }
  `);
  assert.doesNotMatch(out, /useRegion\(\)/, 'neither read should survive');
  assert.match(out, /useState/, 'both should have become state');
});
