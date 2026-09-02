#!/usr/bin/env node
// THE FIRST TWENTY MINUTES, run as a test.
//
//   node scripts/smoke-scaffold.mjs [--keep]
//
// Scaffolds a throwaway application, runs the two commands every adoption begins with — `motu init`
// and `motu archipelago init` — and asserts that what came out TYPECHECKS and PASSES MOTU'S OWN
// CHECKS. Nothing more; that is the whole path this covers, and it is the path nothing else walks.
//
// WHY IT EXISTS. A cold-start bench (bench/agent-cold-start) put two agents that had never seen motu
// into two unfamiliar production monorepos. Between them the scaffolder produced, on its very first
// two commands: an import of a package that does not exist, a composition root calling `createRegion`
// without importing it, an `@/src/…` specifier with a doubled `src/`, a frame placeholder that fails
// the rule it is checked against one command later, and an archipelago that did not typecheck at all.
// Five defects, none deep, all of them in everybody's first twenty minutes.
//
// They survived because motu's own consumers — demo-app, host-app, the review console — were each
// scaffolded ONCE, long ago, by someone who fixed these by hand and did not write it down. `motu
// check` in CI checks those consumers as they are TODAY; it never re-runs the generator. So the
// generator was the one surface with no test, and the only thing that exercised it was a stranger.
//
// TWO HOSTS, BECAUSE THE ALIAS SHAPE IS WHAT BROKE. Next's own template maps `"@/*": ["./*"]` and a
// Vite app commonly maps `"@/*": ["./src/*"]`. The generator assumed the first, so the doubled-`src/`
// bug was invisible on every project motu had ever been run against. A single host here would have
// reproduced that blindness exactly.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHECKOUT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = resolve(CHECKOUT, 'packages/cli/src/cli.mjs');
const TSC = resolve(CHECKOUT, 'node_modules/typescript/bin/tsc');
const keep = process.argv.includes('--keep');

/**
 * The two shapes, and what each one is here to catch.
 *
 * `appPackage` is deliberately NOT the directory name in either case: it defaults to `basename(appRoot)`,
 * and a monorepo app in `apps/dashboard` publishing `@acme/dashboard` is what turned that default into
 * an import of a package nobody installed.
 */
const CASES = [
  {
    id: 'next',
    host: 'next',
    // Next's own template. The shape the generator was written against.
    aliasTarget: './*',
    page: 'app/things/page.tsx',
    componentDir: 'components',
    from: '@/components/thing-card',
  },
  {
    id: 'vite',
    host: 'vite',
    // The shape that produced `@/src/pages/…`. Keep it.
    aliasTarget: './src/*',
    page: 'src/pages/things.tsx',
    componentDir: 'src/components',
    from: '@/components/thing-card',
  },
];

const PAGE = `export default function ThingsPage() {
  return <main>things</main>;
}
`;

/** A component the app ALREADY owns — the `--from` case, which is what a React host actually does. */
const COMPONENT = `export function ThingCard({ label = 'a thing' }: { label?: string }) {
  return <article>{label}</article>;
}
`;

function run(cmd, args, cwd) {
  try {
    return { ok: true, out: execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (err) {
    return { ok: false, out: `${err.stdout ?? ''}${err.stderr ?? ''}`, code: err.status };
  }
}

/** A minimal application that is nonetheless REALISTIC where realism is what broke things. */
function makeApp({ host, aliasTarget, page, componentDir }) {
  const dir = mkdtempSync(resolve(tmpdir(), 'motu-smoke-'));
  const app = resolve(dir, 'apps', 'dashboard');
  mkdirSync(resolve(app, dirname(page)), { recursive: true });
  writeFileSync(resolve(app, page), PAGE);
  mkdirSync(resolve(app, componentDir), { recursive: true });
  writeFileSync(resolve(app, componentDir, 'thing-card.tsx'), COMPONENT);
  // The package NAME differs from the directory NAME on purpose — see the note on CASES.
  writeFileSync(resolve(app, 'package.json'), JSON.stringify({ name: '@acme/dashboard', private: true, version: '0.0.0' }, null, 2));
  writeFileSync(
    resolve(app, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          strict: true,
          noEmit: true,
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'bundler',
          jsx: 'react-jsx',
          skipLibCheck: true,
          baseUrl: '.',
          paths: { '@/*': [aliasTarget] },
        },
        include: ['**/*.ts', '**/*.tsx'],
        // `roots/` IS INCLUDED, and excluding it hid a real defect. The lagoon overrides are the file
        // the adopter has to write by hand, against types motu generated for them — and the scaffolded
        // frame was a COMPONENT taking `{ island }` as props while `layout` is `(island) => ReactNode`.
        // With `roots` excluded this test wired the two together and never compiled the result, so the
        // mismatch passed. Typechecking the wiring is the only thing that catches it.
        exclude: ['node_modules'],
      },
      null,
      2,
    ),
  );
  // `react` and its types resolve from the checkout: the app installs nothing, which is motu's own
  // no-install posture. `@motu/*` is linked by the CLI itself on every invocation.
  mkdirSync(resolve(app, 'node_modules'), { recursive: true });
  for (const pkg of ['react', 'react-dom', '@types', 'typescript']) {
    const from = resolve(CHECKOUT, 'node_modules', pkg);
    const to = resolve(app, 'node_modules', pkg);
    if (existsSync(from) && !existsSync(to)) {
      try {
        symlinkSync(from, to, 'dir');
      } catch {}
    }
  }
  return { dir, app };
}

const failures = [];
const note = (c, what, detail) => failures.push(`[${c.id}] ${what}\n${String(detail).trim().split('\n').slice(0, 12).join('\n')}`);

for (const c of CASES) {
  const { dir, app } = makeApp(c);
  process.stdout.write(`\n\x1b[1m${c.id}\x1b[0m  (--host ${c.host}, "@/*" -> "${c.aliasTarget}")\n`);

  const init = run('node', [CLI, 'init', '.', '--host', c.host], app);
  process.stdout.write(`  ${init.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} motu init\n`);
  if (!init.ok) note(c, 'motu init failed', init.out);

  const archInit = run('node', [CLI, 'archipelago', 'init', 'things', '--page', c.page], app);
  process.stdout.write(`  ${archInit.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} motu archipelago init\n`);
  if (!archInit.ok) note(c, 'motu archipelago init failed', archInit.out);

  // THE NEXT PAIR EVERY ADOPTION RUNS, and the pair nothing else here covered. `--from` is the React
  // host's actual shape (wrap the component the app already owns, never copy it), and `integrate` is
  // what turns a region with `islands: []` into one with a member — the exact transition at which
  // `wiring` and `produced` become required. If `island integrate` does not also write them, adding
  // the first island to a freshly scaffolded region breaks the typecheck.
  const create = run('node', [CLI, 'island', 'create', 'thing-card', '--from', c.from, '--export', 'ThingCard'], app);
  process.stdout.write(`  ${create.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} motu island create --from\n`);
  if (!create.ok) note(c, 'motu island create --from failed', create.out);

  const integrate = run('node', [CLI, 'island', 'integrate', 'thing-card', '--archipelago', 'things'], app);
  process.stdout.write(`  ${integrate.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} motu island integrate\n`);
  if (!integrate.ok) note(c, 'motu island integrate failed', integrate.out);

  // WIRE THE REGION INTO THE LAGOON, because that is the next thing `archipelago init` tells you to
  // do — and because `region-root` only OPENS the frame once something references it. Leaving this
  // out is how the first version of this test passed over a frame placeholder that fails the very
  // rule it is checked against: the defect was there, and nothing had asked to look at it.
  const overrides = resolve(app, 'roots/lagoon/src/lagoon.tsx');
  if (existsSync(overrides)) {
    writeFileSync(
      overrides,
      `import type { LagoonOverrides } from '@motu/react';\n` +
        `import { thingsSeed, ThingsRegionFrame } from './regions/things';\n\n` +
        `export const regions: LagoonOverrides['regions'] = {\n` +
        `  things: { seed: thingsSeed, layout: ThingsRegionFrame },\n};\n`,
    );
  }

  // 1. DOES IT COMPILE? The cheapest question, and the one a freshly generated archipelago failed —
  //    `{ ownership: true }` against a type that also demanded `wiring`, which cannot be satisfied
  //    before the first island exists. Also the check that catches every unresolvable generated
  //    import: `from 'dashboard'`, a doubled `@/src/…`, a missing `createRegion`.
  const tsc = run('node', [TSC, '-p', 'tsconfig.json'], app);
  process.stdout.write(`  ${tsc.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} tsc --noEmit over the generated files\n`);
  if (!tsc.ok) note(c, 'the scaffolded project does not typecheck', tsc.out);

  // 2. DOES IT PASS MOTU'S OWN CHECKS? A scaffold that fails the gate motu enforces one command later
  //    is the defect this half exists for — the frame placeholder that drew a styled `<div>` failed
  //    `region-root` the first time anybody ran it.
  const verify = run('node', [CLI, 'archipelago', 'verify', 'things'], app);
  process.stdout.write(`  ${verify.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} motu archipelago verify things\n`);
  if (!verify.ok) note(c, 'the scaffolded region does not pass its own checks', verify.out);

  if (keep) process.stdout.write(`  \x1b[2mkept: ${app}\x1b[0m\n`);
  else rmSync(dir, { recursive: true, force: true });
}

process.stdout.write('\n');
if (failures.length) {
  for (const f of failures) process.stdout.write(`\x1b[31m${f}\x1b[0m\n\n`);
  process.stdout.write(`\x1b[31m\x1b[1mFAIL\x1b[0m  ${failures.length} problem(s) in what the scaffolder generated\n`);
  process.exit(1);
}
process.stdout.write(`\x1b[32m\x1b[1mPASS\x1b[0m  init + archipelago init produce a project that compiles and checks, on ${CASES.length} host shape(s)\n`);
