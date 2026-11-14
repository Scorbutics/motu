#!/usr/bin/env node
// The `motu` entry point — a preflight, then the real CLI.
//
// WHY THIS FILE EXISTS. Everything below `run.mjs` is static ESM, so its imports are hoisted and
// resolved before a single line of ours runs. A missing dependency therefore cannot be caught in
// there: node prints `ERR_MODULE_NOT_FOUND: Cannot find package 'ts-morph'` with a stack, and exits.
//
// Measured on a clean machine, following the README exactly: clone, `./install.sh`, and then EVERY
// command — including `motu --help` — died that way in about two seconds, because the documented
// install path never installs the framework's own dependencies. That is the whole first impression a
// stranger gets, so this checks first and says what to do.
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// Node built-ins only, so it is safe above the dependency check.
import { INSTALLED } from './lib/framework.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const CHECKOUT = resolve(here, '../../..');

/** Packages the CLI needs to do anything at all, in the order a missing one would be hit. */
const REQUIRED = ['ts-morph', 'tsx'];

const require = createRequire(import.meta.url);
const missing = REQUIRED.filter((name) => {
  try {
    require.resolve(name);
    return false;
  } catch {
    return true;
  }
});

if (missing.length && INSTALLED) {
  // INSTALLED FROM NPM, the checkout advice below is wrong twice over: there is no checkout to `cd`
  // into, and `./install.sh` does not exist. These are @motujs/cli's own dependencies, so a missing
  // one is an interrupted or pruned install of it — the fix is in the app, not anywhere else.
  console.error(`\x1b[31m✗ motu cannot start: ${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} not installed\x1b[0m`);
  console.error(`\x1b[2m  ${missing.length > 1 ? 'They are dependencies' : 'It is a dependency'} of @motujs/cli, so its install is incomplete. Reinstall it:\x1b[0m`);
  console.error('');
  console.error('      npm i -D @motujs/cli');
  console.error('');
  process.exit(2);
}

if (missing.length) {
  // A pnpm workspace: `npm install` cannot resolve `workspace:*`, so never suggest it. corepack ships
  // with node and honours the declared `packageManager`, which is the one instruction that works
  // whether or not pnpm is already on PATH.
  const pm = existsSync(resolve(CHECKOUT, 'pnpm-lock.yaml')) ? 'corepack pnpm install' : 'npm install';
  console.error(`\x1b[31m✗ motu cannot start: ${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} not installed\x1b[0m`);
  console.error(`\x1b[2m  The framework resolves its own build tools from its checkout, so that checkout needs its\x1b[0m`);
  console.error(`\x1b[2m  dependencies once — your project still needs none:\x1b[0m`);
  console.error('');
  console.error(`      cd ${CHECKOUT} && ${pm}`);
  console.error('');
  console.error(`\x1b[2m  Then re-run this command. (\`./install.sh\` does it for you.)\x1b[0m`);
  process.exit(2);
}

// THE PACKAGES HAVE TO BE BUILT, and only in a checkout. `@motujs/*` publish compiled output — that is
// what puts them inside a host's node_modules, where `react` resolves to the HOST's copy instead of
// whatever sits next to motu. Their `exports` therefore point at `dist/`, which is gitignored, so a
// fresh clone has none: the no-install links land on a package whose entry point does not exist, and
// the host's bundler says `@motujs/core could not be resolved` — pointing at the consumer, not here.
// Same failure mode the dependency check above exists for, one layer down.
if (!INSTALLED && existsSync(resolve(CHECKOUT, 'packages/core/src/index.ts')) && !existsSync(resolve(CHECKOUT, 'packages/core/dist/index.js'))) {
  console.error(`\x1b[31m✗ motu cannot start: the framework packages are not built\x1b[0m`);
  console.error(`\x1b[2m  They ship compiled, so their entry points live in dist/ — which a fresh clone does not have:\x1b[0m`);
  console.error('');
  console.error(`      cd ${CHECKOUT} && node scripts/build-packages.mjs`);
  console.error('');
  console.error(`\x1b[2m  (\`./install.sh\` does it for you.)\x1b[0m`);
  process.exit(2);
}

await import('./run.mjs');
