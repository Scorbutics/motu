// RECORD `@motu/*` IN THE APP'S package.json, so the package manager stops deleting them.
//
// A project that is not a workspace gets its `@motu/*` from raw symlinks the CLI re-creates on every
// run. That works until `npm install`, which prunes them as EXTRANEOUS — nothing declares them, so as
// far as npm is concerned they are litter. Measured on shlink, a single-package npm app:
//
//     $ npm install
//     removed 9 packages
//     $ npm run build
//     Cannot find module '@motu/react'
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
    out[`@motu/${name}`] = `file:${relative(appRoot, target)}`;
  }
  return out;
}

export async function linkCommand(argv) {
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
  // that ships `@motu/*` to a server at runtime should move them itself — which is a decision, and
  // this command does not make decisions about someone's manifest beyond the one it announces.
  const field = pkg.devDependencies ? 'devDependencies' : 'dependencies';
  const deps = (pkg[field] ??= {});
  const added = [];
  const changed = [];
  for (const [name, spec] of Object.entries(wanted)) {
    // Never overwrite a REAL range: a project that depends on a published `@motu/*` has answered this
    // question already, and replacing that with a path to somebody's checkout would be vandalism.
    const current = pkg.dependencies?.[name] ?? pkg.devDependencies?.[name];
    if (current && !current.startsWith('file:') && !current.startsWith('link:')) continue;
    if (current === spec) continue;
    (current ? changed : added).push(name);
    deps[name] = spec;
  }

  if (!added.length && !changed.length) {
    console.log(color.green('✓') + ` package.json already records ${Object.keys(wanted).length} @motu/* package(s)`);
    return;
  }
  if (argv?.check) {
    console.error(color.red(`✗ package.json does not record @motu/*: ${[...added, ...changed].join(', ')}`));
    console.error(color.dim('  run `motu link` — without it, `npm install` deletes them and the host build fails'));
    process.exit(1);
  }
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(color.green('✓') + ` recorded ${added.length + changed.length} @motu/* package(s) in ${field}`);
  for (const name of [...added, ...changed]) console.log(color.dim(`    ${name}: ${deps[name]}`));
  console.log('');
  console.log(color.dim('  Run your package manager once to materialise them (`npm install`).'));
  console.log(color.dim('  They survive every install after that — which raw symlinks did not.'));
}
