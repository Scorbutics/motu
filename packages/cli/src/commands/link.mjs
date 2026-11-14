// RECORD `@motujs/*` IN THE APP'S package.json, so the package manager stops deleting them.
//
// A project that is not a workspace gets its `@motujs/*` from raw symlinks the CLI re-creates on every
// run. That works until `npm install`, which prunes them as EXTRANEOUS — nothing declares them, so as
// far as npm is concerned they are litter. Measured on shlink, a single-package npm app:
//
//     $ npm install
//     removed 9 packages
//     $ npm run build
//     Cannot find module '@motujs/react'
//
// The re-link on every motu command hides this from anyone who runs a motu command next, and not from
// CI, a fresh clone, or a teammate who just runs the app. The error points nowhere near the cause.
//
// A `file:` specifier fixes it properly: npm creates the link ITSELF, records it in the lockfile, and
// leaves it alone on every subsequent install. Verified on shlink — three consecutive `npm install`
// runs, nine links intact, `npm run types` clean, `motu check` green.
//
// AN EXPLICIT COMMAND, not a side effect of `init`. Editing an application's package.json is the
// host's call; what motu owes is to make the fix one word long and to say when it is needed.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { APP_ROOT, MOTU_CHECKOUT, color } from '../lib/util.mjs';
import { CLI_VERSION, INSTALLED } from '../lib/framework.mjs';

/** Package name -> its directory under `packages/`, for the ones a host can import. */
const PACKAGES = {
  core: 'core',
  react: 'react',
  runtime: 'runtime',
  types: 'types',
  chrome: 'chrome',
  coverage: 'coverage',
  'debug-overlay': 'debug-overlay',
  'adapter-next': 'adapters/next',
  'adapter-angularjs': 'adapters/angularjs',
};

/** The `file:` specifiers this project would need, relative to its own package.json. */
export function fileSpecifiers(appRoot = APP_ROOT, checkout = MOTU_CHECKOUT) {
  const out = {};
  for (const [name, dir] of Object.entries(PACKAGES)) {
    const target = resolve(checkout, 'packages', dir);
    if (!existsSync(target)) continue;
    // RELATIVE, so two checkouts cloned side by side stay portable between machines. An absolute path
    // would work here and be wrong in the repository the moment anyone else opened it.
    out[`@motujs/${name}`] = `file:${relative(appRoot, target)}`;
  }
  return out;
}

export async function linkCommand(argv) {
  // CHECKOUT MODE ONLY. Everything above is about reaching a CHECKOUT's packages by path; installed
  // from npm there is no checkout, and `fileSpecifiers` would write `file:` paths into a `packages/`
  // directory that does not exist — the next `npm install` would then fail on every one of them.
  // `motu init` already recorded real ranges, which is the fix this command exists to approximate.
  // Exit 0, including under --check: an installed project is not out of date, it is a different mode.
  if (INSTALLED) {
    console.log(color.dim('motu link is for checkout mode only — it records `file:` paths into a motu clone.'));
    console.log(color.dim(`This motu is installed from npm (@motujs/cli@${CLI_VERSION}), so @motujs/* are ordinary`));
    console.log(color.dim('dependencies: `motu init` recorded them in package.json, and your package manager keeps them.'));
    return;
  }
  const pkgPath = resolve(APP_ROOT, 'package.json');
  if (!existsSync(pkgPath)) {
    console.error(color.red(`✗ no package.json at ${pkgPath}`));
    process.exit(2);
  }
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  } catch (err) {
    console.error(color.red(`✗ ${pkgPath} is not readable JSON: ${err?.message ?? err}`));
    process.exit(2);
  }

  const wanted = fileSpecifiers();
  // DEV dependencies: motu is build-time for a bundled app, and every consumer here bundles. A host
  // that ships `@motujs/*` to a server at runtime should move them itself — which is a decision, and
  // this command does not make decisions about someone's manifest beyond the one it announces.
  const field = pkg.devDependencies ? 'devDependencies' : 'dependencies';
  const deps = (pkg[field] ??= {});
  const added = [];
  const changed = [];
  for (const [name, spec] of Object.entries(wanted)) {
    // Never overwrite a REAL range: a project that depends on a published `@motujs/*` has answered this
    // question already, and replacing that with a path to somebody's checkout would be vandalism.
    const current = pkg.dependencies?.[name] ?? pkg.devDependencies?.[name];
    if (current && !current.startsWith('file:') && !current.startsWith('link:')) continue;
    if (current === spec) continue;
    (current ? changed : added).push(name);
    deps[name] = spec;
  }

  if (!added.length && !changed.length) {
    console.log(color.green('✓') + ` package.json already records ${Object.keys(wanted).length} @motujs/* package(s)`);
    return;
  }
  if (argv?.check) {
    console.error(color.red(`✗ package.json does not record @motujs/*: ${[...added, ...changed].join(', ')}`));
    console.error(color.dim('  run `motu link` — without it, `npm install` deletes them and the host build fails'));
    process.exit(1);
  }
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(color.green('✓') + ` recorded ${added.length + changed.length} @motujs/* package(s) in ${field}`);
  for (const name of [...added, ...changed]) console.log(color.dim(`    ${name}: ${deps[name]}`));
  console.log('');
  console.log(color.dim('  Run your package manager once to materialise them (`npm install`).'));
  console.log(color.dim('  They survive every install after that — which raw symlinks did not.'));
}
