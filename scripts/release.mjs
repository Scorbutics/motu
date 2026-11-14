// Publish the `@motujs/*` packages.
//
//   node scripts/release.mjs --dry-run          what would go out, and at what version
//   node scripts/release.mjs --version 0.2.0    set every package to 0.2.0 first
//   node scripts/release.mjs                    publish
//
// The set is LISTED, not derived from "every workspace package that isn't private". Deriving it is
// how `demo-app` and `@motujs/contract` — a demo app and a file generated from the demo's own ocean
// manifest — end up on the public registry: they are workspace members, and nothing about them says
// "product" except that nobody meant to publish them. A list is also the honest answer to "what IS
// motu", which is a question a reader of this repo may reasonably have.
//
// Order is dependency order, same as the build. npm does not enforce it, but a dependent published
// first is broken for everyone who installs it in the seconds before its dependency lands.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const PACKAGES = [
  'packages/types',
  'packages/chrome',
  'packages/core',
  'packages/runtime',
  // NOT optional, however internal it looks. `@motujs/cli`, `@motujs/debug-overlay` and `@motujs/host` all
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

// A one-time password for an account with 2FA on writes. Optional: without it, the publish runs
// in this terminal and npm asks for one itself (a browser link or a code prompt), which is the
// better path for eleven packages — a TOTP code expires in ~30 s, and the browser flow offers to
// skip the second factor for the next five minutes.
const otpAt = argv.indexOf('--otp');
const otp = otpAt === -1 ? null : argv[otpAt + 1];
if (otpAt !== -1 && (!otp || !/^\d{6,8}$/.test(otp))) {
  console.error('--otp needs the 6-digit code from your authenticator, e.g. --otp 123456');
  process.exit(2);
}

// `--bump-only`: set the version and stop. Releasing from CI is "bump, commit, tag, push", and the
// bump is the one step that edits eleven files — it should not need a publish attached to it.
const bumpOnly = argv.includes('--bump-only');
if (bumpOnly && !setVersion) {
  console.error('--bump-only needs --version, e.g. --version 0.2.0 --bump-only');
  process.exit(2);
}

// IN CI: GitHub Actions with npm TRUSTED PUBLISHING. There is no login and no token — npm trades
// the workflow's OIDC identity for a one-shot publish credential — so `npm whoami` has nothing to
// answer and must not be the gate, and every tarball gets a provenance statement tying it to the
// commit and workflow that built it.
const CI = process.env.GITHUB_ACTIONS === 'true';

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
  if (bumpOnly) {
    console.log(dim(`  next: git commit -am "release: v${setVersion}" && git tag -a v${setVersion} -m v${setVersion} && git push --follow-tags`));
    process.exit(0);
  }
} else if (setVersion) {
  // --dry-run writes NOTHING, version bump included. A rehearsal that edits ten manifests is not a
  // rehearsal, and leaves the tree dirty for whoever runs it just to look.
  console.log(`${dim('would set')} ${PACKAGES.length} packages to ${bold(setVersion)}\n`);
}

// THE TAG IS A CLAIM ABOUT THE MANIFESTS. Pushing v0.2.0 over manifests that still say 0.1.0 would
// either publish nothing ("already published — skipping", green) or publish the wrong number.
if (CI && process.env.GITHUB_REF_TYPE === 'tag') {
  const tag = process.env.GITHUB_REF_NAME ?? '';
  const mismatched = PACKAGES.filter((pkg) => `v${manifestOf(pkg).version}` !== tag);
  if (mismatched.length) {
    console.error(red(`✗ tag ${tag} does not match the manifests:`));
    for (const pkg of mismatched) console.error(`    ${manifestOf(pkg).name}  ${manifestOf(pkg).version}`);
    console.error(dim(`  bump first: node scripts/release.mjs --version ${tag.replace(/^v/, '')} --bump-only, commit, re-tag`));
    process.exit(1);
  }
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
if (CI) {
  console.log(`publishing from ${bold(process.env.GITHUB_REPOSITORY ?? 'CI')} via npm trusted publishing\n`);
} else try {
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
// TWO TOOLS, each for the part only it does. `pnpm pack` builds the tarball, because the manifests
// declare `workspace:*` for their siblings and pnpm is what rewrites those to real ranges — npm would
// ship them verbatim and every install would fail on an unresolvable range. `npm publish` sends it,
// because trusted publishing (the OIDC exchange, the provenance statement) is implemented by the npm
// CLI, and a tarball is something it publishes as-is.
const packDir = mkdtempSync(join(tmpdir(), 'motu-release-'));
const done = [];
for (const { pkg, name, version } of todo) {
  console.log(`  ${bold(`${name}@${version}`)}`);
  try {
    execFileSync('pnpm', ['pack', '--pack-destination', packDir], { cwd: join(ROOT, pkg), stdio: ['ignore', 'ignore', 'inherit'] });
    const tarball = join(packDir, `${name.replace('@', '').replace('/', '-')}-${version}.tgz`);
    if (!existsSync(tarball)) throw new Error(`pnpm pack wrote no ${tarball}`);
    // INHERITED stdio, not piped. An account with 2FA on writes gets EOTP unless npm can ask for
    // the second factor, and npm can only ask a terminal it is attached to: with stdin ignored and
    // output captured, its "open this URL to authenticate" arrived after it had already failed.
    const args = ['publish', tarball, '--access', 'public', ...(CI ? ['--provenance'] : []), ...(otp ? ['--otp', otp] : [])];
    execFileSync('npm', args, { stdio: 'inherit' });
    console.log(`  ✓ ${name}@${version}\n`);
    done.push(name);
  } catch (err) {
    console.log(red(`  ✗ ${name}@${version}`));
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
