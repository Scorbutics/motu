// THE GUARANTEE ITSELF: `exclusive: [['weekNav', 'weekNavPlaceholder']]` makes `<X.Root>` refuse, AT
// COMPILE TIME, a page that can pass both.
//
// A type cannot be asserted from node, so this writes a small .tsx against the BUILT declarations and
// runs `tsc` over it. Every line marked `// FAIL` must produce an error ON THAT LINE and every other
// line must produce none — so a type that stops refusing the two-ternary shape fails here, and so
// does one that starts refusing the single ternary the docs tell pages to write.
//
// The shape it pins is acme's, the case the declaration exists for: an island and the skeleton that
// stands in for it, which is a pass-through prop rather than a slot.
//
// Run: node --test packages/react/test/exclusive-types.test.mjs   (after `node scripts/build-packages.mjs`)
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(here, '../../..');
const tsc = join(REPO, 'node_modules/.bin/tsc');

const CASES = `
import type { RootPropsOf } from ${JSON.stringify(resolve(here, '../dist/index.js'))};
type ReactNode = import('react').ReactNode;
declare const W: Exclude<ReactNode, null | undefined>;
declare const S: Exclude<ReactNode, null | undefined>;
declare const ready: boolean;
declare const config: {
  readonly id: 'actions';
  readonly root: (p: { header?: ReactNode; weekNav?: ReactNode; weekNavPlaceholder?: ReactNode; title?: string }) => null;
  readonly slots: { readonly header: 'actions-header'; readonly weekNav: 'week-nav' };
  readonly exclusive: readonly [readonly ['weekNav', 'weekNavPlaceholder']];
};
declare const open: { readonly id: 'open'; readonly slots: { readonly weekNav: 'week-nav' } };
declare function Root(p: RootPropsOf<typeof config>): null;
declare function OpenRoot(p: RootPropsOf<typeof open>): null;

Root({ weekNav: ready ? W : null, weekNavPlaceholder: ready ? null : S }); // FAIL — the demoted shape
Root({ weekNav: W, weekNavPlaceholder: S }); // FAIL — both, literally
Root(ready ? { weekNav: W } : { weekNavPlaceholder: S });
Root({ header: W, title: 'x', ...(ready ? { weekNav: W } : { weekNavPlaceholder: S }) });
Root({ header: W, weekNav: W });
Root({ weekNavPlaceholder: S, weekNav: null });
Root({});
OpenRoot({ weekNav: W, weekNavPlaceholder: S }); // no group declared: nothing is refused
`;

test('<X.Root> refuses two members of an exclusive group, and nothing else', () => {
  const dir = mkdtempSync(join(tmpdir(), 'motu-exclusive-'));
  try {
    writeFileSync(join(dir, 'cases.ts'), CASES);
    writeFileSync(
      join(dir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          noEmit: true,
          module: 'esnext',
          moduleResolution: 'bundler',
          target: 'es2022',
          skipLibCheck: true,
          types: [],
          // react's types live with the react package, resolved from the repo the way a host would.
          typeRoots: [join(REPO, 'node_modules/@types')],
          baseUrl: REPO,
          paths: { react: [join(REPO, 'node_modules/@types/react')] },
        },
        files: ['cases.ts'],
      }),
    );
    const r = spawnSync(tsc, ['-p', join(dir, 'tsconfig.json')], { encoding: 'utf8' });
    const out = r.stdout + r.stderr;
    const errorLines = new Set([...out.matchAll(/cases\.ts\((\d+),\d+\): error/g)].map((m) => Number(m[1])));
    const lines = CASES.split('\n');
    // Errors that are not about a case line at all (a missing module, a broken declaration) mean the
    // harness did not run — say so rather than reading them as cases.
    const stray = [...out.matchAll(/^(?!.*cases\.ts\(\d+).*error TS.*$/gm)].map((m) => m[0]);
    assert.deepEqual(stray, [], `tsc failed outside the cases:\n${out}`);
    for (const [i, line] of lines.entries()) {
      if (!/^(Root|OpenRoot)\(/.test(line)) continue;
      const n = i + 1;
      if (line.includes('// FAIL')) assert.ok(errorLines.has(n), `expected a type error on line ${n}: ${line}\n${out}`);
      else assert.ok(!errorLines.has(n), `unexpected type error on line ${n}: ${line}\n${out}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
