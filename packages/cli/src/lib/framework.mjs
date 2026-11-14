// WHERE THE FRAMEWORK IS, and therefore HOW it is reached: a checkout, or an install.
//
// motu grew up run FROM ITS OWN CHECKOUT: the CLI found vite and the build plugins in the checkout's
// devDependencies, aliased `@motujs/*` straight to `packages/*/src/*.ts`, symlinked them into each
// project's node_modules on every run, and read its skills and adapters from `.github/` and
// `packages/adapters/` beside it. Every one of those is a path that does not exist once the CLI is
// `npm i -D @motujs/cli` in somebody's app — there is no `packages/`, no `.github/`, and the code
// that looked for them fell back to the PROJECT root, so the lagoon aliased `@motujs/react` to
// `<app>/packages/react/src/index.ts` and died on a file the adopter had never heard of.
//
// Two modes, chosen by what is on disk, never by a flag a person has to remember:
//
//   checkout   the CLI sits at `<checkout>/packages/cli`, beside `packages/core/src/index.ts`
//              (or `$MOTU_ROOT` names a checkout). Everything stays exactly as it was: source
//              aliases, no-install links, build tools from the checkout root.
//   installed  anything else — in practice `node_modules/@motujs/cli`. The `@motujs/*` packages
//              resolve the ordinary way, from the app's node_modules to their compiled `dist/`;
//              build tools resolve from THIS package's own dependencies; and the few files that
//              live outside `packages/cli` in a checkout ship inside it, under `bundled/`.
//
// This module imports nothing of the CLI's, so `config.mjs` (which everything else imports) can.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** `packages/cli` in a checkout, `node_modules/@motujs/cli` in an install. */
export const CLI_PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const OWN_CHECKOUT = resolve(CLI_PACKAGE_ROOT, '../..');
const isCheckout = (dir) => existsSync(resolve(dir, 'packages/core/src/index.ts'));

/**
 * The motu checkout this CLI runs from, or null when it was installed.
 *
 * `$MOTU_ROOT` still wins, as it always has — it is how a CI image points an installed binary at a
 * checkout on purpose, and an override that only worked from inside a checkout would not be one.
 */
export const CHECKOUT_ROOT = process.env.MOTU_ROOT
  ? resolve(process.env.MOTU_ROOT)
  : isCheckout(OWN_CHECKOUT)
    ? OWN_CHECKOUT
    : null;

/**
 * Where vite, the build plugins and Tailwind are resolved from FIRST.
 *
 * The checkout root when this CLI is the checkout's own (they are the root's devDependencies there),
 * otherwise this package — where an install puts them, as `@motujs/cli`'s own dependencies. Keyed on
 * the CLI's real location rather than on `$MOTU_ROOT`: that variable says where the framework SOURCE
 * is, and an installed CLI pointed at a checkout still has its build tools where npm put them.
 */
export const BUILD_DEPS_ROOT = isCheckout(OWN_CHECKOUT) ? OWN_CHECKOUT : CLI_PACKAGE_ROOT;

/** 'checkout' | 'installed' — see the top of this file. */
export const FRAMEWORK_MODE = CHECKOUT_ROOT ? 'checkout' : 'installed';
export const INSTALLED = FRAMEWORK_MODE === 'installed';

/**
 * The CLI's own version — the range `motu init` writes for every `@motujs/*` it records.
 *
 * Lockstep (scripts/release.mjs sets one version on every package), so the CLI's version IS the
 * version of the set. `^` of it rather than an exact pin: a patch release of one package must not
 * need the adopter to edit five lines of package.json.
 */
export const CLI_VERSION = (() => {
  try {
    return JSON.parse(readFileSync(resolve(CLI_PACKAGE_ROOT, 'package.json'), 'utf8')).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

/**
 * A framework file that lives OUTSIDE `packages/cli` in a checkout, wherever it actually is.
 *
 * `checkoutRel` is its path in the checkout (`.github/agents`, `packages/adapters/next/vite.mjs`).
 * Installed, the same file ships inside this package under `bundled/` — copied there by
 * `scripts/build-packages.mjs`, with `.github/` spelled `github/` because a dot-directory in a
 * tarball is one more thing a packer is entitled to drop.
 *
 * A checkout reads the ORIGINAL, never the bundled copy: `bundled/` is a build output, and reading it
 * there would make every edit to a skill or an adapter invisible until somebody re-ran the build.
 */
export function frameworkFile(checkoutRel) {
  if (CHECKOUT_ROOT) return resolve(CHECKOUT_ROOT, checkoutRel);
  return resolve(CLI_PACKAGE_ROOT, 'bundled', checkoutRel.replace(/^\.github\//, 'github/'));
}

/**
 * How to install the browser the runtime checks drive.
 *
 * "(in packages/cli)" is right in a checkout — that is where playwright is installed, and `npx` must
 * find THAT copy so the browser revision matches — and a path that does not exist for an adopter who
 * installed from npm, where the app's own `npx playwright` is the CLI's copy already.
 */
export const CHROMIUM_INSTALL = INSTALLED
  ? '`npx playwright install chromium`'
  : '`npx playwright install chromium` (in packages/cli)';
