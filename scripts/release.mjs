// Publish the `@motu/*` packages.
//
//   node scripts/release.mjs --dry-run          what would go out, and at what version
//   node scripts/release.mjs --version 0.2.0    set every package to 0.2.0 first
//   node scripts/release.mjs                    publish
//
// The set is LISTED, not derived from "every workspace package that isn't private". Deriving it is
// how `demo-app` and `@motu/contract` — a demo app and a file generated from the demo's own ocean
// manifest — end up on the public registry: they are workspace members, and nothing about them says
// "product" except that nobody meant to publish them. A list is also the honest answer to "what IS
// motu", which is a question a reader of this repo may reasonably have.
//
// Order is dependency order, same as the build. npm does not enforce it, but a dependent published
// first is broken for everyone who installs it in the seconds before its dependency lands.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const PACKAGES = [
  'packages/types',
  'packages/chrome',
  'packages/core',
  'packages/runtime',
  // NOT optional, however internal it looks. `@motu/cli`, `@motu/debug-overlay` and `@motu/host` all
  // declare a dependency on it, so leaving it off this list published three packages whose install
  // resolves a package that is not on the registry. Its position is the build's (after `runtime`,
  // before `react`), because that is the order the comment above promises.
  'packages/coverage',
  'packages/react',
  'packages/debug-overlay',
  'packages/adapters/angularjs',
  'packages/adapters/next',
  'packages/cli',
  'packages/host',
];

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
// Read the value ONLY when the flag is there. `indexOf` returns -1 when it is not, and `argv[0]` is
// then whatever the first flag happened to be — which set every package's version to "--dry-run".
const versionAt = argv.indexOf('--version');
const setVersion = versionAt === -1 ? null : argv[versionAt + 1];
if (versionAt !== -1 && (!setVersion || setVersion.startsWith('--'))) {
  console.error('--version needs a value, e.g. --version 0.2.0');
  process.exit(2);
}
if (setVersion && !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(setVersion)) {
  console.error(`--version must look like 1.2.3, got: ${setVersion}`);
  process.exit(2);
}

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

const manifestOf = (pkg) => JSON.parse(readFileSync(join(ROOT, pkg, 'package.json'), 'utf8'));

// --- 1. version -------------------------------------------------------------------------------
// Lockstep. The packages are one product released together, and mixed versions across a set that
// depends on itself is a support burden bought for nothing.
if (setVersion && !dryRun) {
  for (const pkg of PACKAGES) {
    const p = join(ROOT, pkg, 'package.json');
    const raw = readFileSync(p, 'utf8');
    const next = raw.replace(/^(\s*"version":\s*")[^"]+(")/m, `$1${setVersion}$2`);
    if (next === raw) throw new Error(`${pkg}: no version field to set`);
    writeFileSync(p, next);
  }
  console.log(`set ${PACKAGES.length} packages to ${bold(setVersion)}\n`);
} else if (setVersion) {
  // --dry-run writes NOTHING, version bump included. A rehearsal that edits ten manifests is not a
  // rehearsal, and leaves the tree dirty for whoever runs it just to look.
  console.log(`${dim('would set')} ${PACKAGES.length} packages to ${bold(setVersion)}\n`);
}

// --- 2. build ---------------------------------------------------------------------------------
// Unconditional. `dist/` is gitignored and the emit is what makes an installed package resolve the
// HOST's react, so publishing a stale one is the exact bug this whole arrangement exists to prevent.
execFileSync('node', [join(ROOT, 'scripts/build-packages.mjs')], { stdio: 'inherit' });
console.log('');

// --- 3. what is already out there -------------------------------------------------------------
async function publishedVersions(name) {
  const res = await fetch(`https://registry.npmjs.org/${name.replace('/', '%2f')}`);
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`registry says ${res.status} for ${name}`);
  return Object.keys((await res.json()).versions ?? {});
}

const plan = [];
for (const pkg of PACKAGES) {
  // In --dry-run the manifests still say the old version, so ask about the one that WOULD go out.
  const { name, version: onDisk } = manifestOf(pkg);
  const version = setVersion ?? onDisk;
  const out = await publishedVersions(name);
  plan.push({ pkg, name, version, already: out.includes(version), latest: out.at(-1) ?? null });
}

console.log(bold('release plan'));
for (const p of plan) {
  const status = p.already ? dim('already published — skipping') : `${bold('publish')} ${dim(p.latest ? `(registry has ${p.latest})` : '(new package)')}`;
  console.log(`  ${p.name.padEnd(26)} ${p.version.padEnd(8)} ${status}`);
}
const todo = plan.filter((p) => !p.already);
console.log('');

if (!todo.length) {
  console.log('nothing to publish — every version is already on the registry.');
  console.log(dim('  bump first:  node scripts/release.mjs --version <next>'));
  process.exit(0);
}

if (dryRun) {
  console.log(dim(`--dry-run: would publish ${todo.length} package(s). Nothing was sent.`));
  process.exit(0);
}

// --- 4. auth ----------------------------------------------------------------------------------
// Checked HERE rather than let the first publish fail: half a release is worse than none, and this
// is the one prerequisite a script cannot satisfy for you.
try {
  // stderr IGNORED: the sync exec variants pass a child's stderr through by default, so npm's own
  // four-line "need auth ... npm adduser" appears above the message below and buries it.
  const who = execFileSync('npm', ['whoami'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  console.log(`publishing as ${bold(who)}\n`);
} catch {
  console.error(red('✗ not logged in to npm'));
  console.error(dim('  npm login'));
  console.error(dim('  then re-run. Nothing has been published.'));
  process.exit(2);
}

// --- 5. publish -------------------------------------------------------------------------------
// `pnpm publish`, not `npm publish`: the manifests declare `workspace:*` for their siblings, and pnpm
// is what rewrites those to real ranges in the published tarball. npm would ship them verbatim and
// every install would fail on an unresolvable range.
const done = [];
for (const { pkg, name, version } of todo) {
  process.stdout.write(`  ${name}@${version} … `);
  try {
    execFileSync('pnpm', ['publish', '--no-git-checks', '--access', 'public'], {
      cwd: join(ROOT, pkg), stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8',
    });
    console.log('✓');
    done.push(name);
  } catch (err) {
    console.log(red('✗'));
    process.stderr.write(err.stdout || '');
    process.stderr.write(err.stderr || '');
    console.error(red(`\n✗ ${name} failed.`));
    // Say what DID go out. A partial release is a state someone has to reason about, and the worst
    // version of this message is one that only reports the failure.
    console.error(done.length ? `  published before this: ${done.join(', ')}` : '  nothing was published.');
    console.error(dim('  Fix, then re-run: already-published versions are skipped.'));
    process.exit(1);
  }
}

console.log(`\n${bold('published')} ${done.length} package(s) at ${manifestOf(PACKAGES[0]).version}`);
console.log(dim('  commit the version bump — the manifests changed on disk.'));
