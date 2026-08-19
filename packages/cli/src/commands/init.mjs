// `motu init [dir]` — bootstrap a project so `motu island create` / `verify` work immediately.
//
// It writes motu.config.json (the layout declaration the rest of the CLI reads), the semantic roots +
// registries + barrel that islands slot into, AND the lagoon root. That last part is the point: the
// lagoon is where `motu island verify` closes the loop, so a project scaffolded without one gets the
// static checks and none of the verification. Init used to stop before it, on the grounds that a
// composition root is "a project concern" — but the result was a documented happy path (init ->
// island create -> island verify) that could not reach green without hand-porting the demo app.
//
// `--host` picks the stack the islands embed INTO, which decides what the lagoon has to speak:
//   angularjs  the reference ocean — legacy fit gates apply, AngularJS adapter available
//   next       a Next.js app — the lagoon inherits the host's '@/…' alias + Tailwind, stubs next/*
//   none       plain React — nothing host-specific
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, dirname, relative, resolve } from 'node:path';
import { color } from '../lib/util.mjs';
import {
  render,
  ISLANDS_REGISTRY,
  ARCHIPELAGOS_REGISTRY,
  BARREL,
  APP_PACKAGE_JSON,
  SHARED_STYLES,
  GITIGNORE,
  LAGOON_PACKAGE_JSON,
  LAGOON_INDEX_HTML,
  LAGOON_FOCUS_HTML,
  LAGOON_FIXTURES,
  LAGOON_FOCUS_ENTRY,
  LAGOON_GALLERY_ENTRY,
  LAGOON_VITE_CONFIG,
  NEXT_STUBS,
  NEXT_VITE_IMPORTS,
  NEXT_VITE_ALIASES,
  NEXT_VITE_CSS,
} from '../lib/scaffold.mjs';

/** This motu checkout (packages/cli/src/commands -> up 4). */
const MOTU_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

/** Framework entry points, mapped by module specifier — @motu/* are raw TS with no build step. */
const MOTU_ENTRIES = {
  '@motu/core': 'packages/core/src/index.ts',
  '@motu/react': 'packages/react/src/index.ts',
  '@motu/react/define': 'packages/react/src/defineReactElement.ts',
  '@motu/runtime/mock': 'packages/runtime/src/mock.ts',
  '@motu/runtime': 'packages/runtime/src/index.ts',
  '@motu/debug-overlay': 'packages/debug-overlay/src/index.ts',
};

const HOST_ADAPTER_ENTRY = {
  angularjs: ['@motu/adapter-angularjs', 'packages/adapters/angularjs/src/index.ts'],
  next: ['@motu/adapter-next', 'packages/adapters/next/src/index.ts'],
};

/**
 * Vite aliases resolving the framework straight to THIS checkout's sources.
 *
 * The @motu/* packages are unpublished workspace packages whose entry point is raw TypeScript, so an
 * existing project cannot simply depend on them — that is the single thing that blocks adopting motu
 * outside its own repo. The lagoon is a Vite app and transpiles TS anyway, so pointing it at the
 * sources removes the package-manager problem entirely: `motu init` produces a lagoon that boots with
 * no install step. Longest specifier first, so '@motu/runtime/mock' is not eaten by '@motu/runtime'.
 */
/** Escape a module specifier for use inside a RegExp literal. */
function reEscape(spec) {
  return spec.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/** An anchored, exact-match alias pattern for one module specifier. */
function exact(spec) {
  return `/^${reEscape(spec)}$/`;
}

function motuAliases(lagoonDir, appRoot, appPackage, host) {
  const entries = Object.entries(MOTU_ENTRIES);
  const adapter = HOST_ADAPTER_ENTRY[host];
  if (adapter) entries.push([adapter[0], adapter[1]]);
  const lines = entries.map(([spec, rel]) => `      { find: ${exact(spec)}, replacement: motu('${rel}') },`);
  // The project's own barrel + stylesheet, imported by name so generated code never carries a
  // relative path into the app. The stylesheet pattern is intentionally NOT end-anchored: it is
  // imported as '<pkg>/styles.css?inline', and the query has to survive the rewrite.
  lines.push(
    `      { find: /^${reEscape(appPackage)}\\/styles\\.css/, replacement: resolve(__dirname, '${relPosix(lagoonDir, resolve(appRoot, 'src/shared/styles.css'))}') },`,
  );
  lines.push(
    `      { find: ${exact(appPackage)}, replacement: resolve(__dirname, '${relPosix(lagoonDir, resolve(appRoot, 'src/index.ts'))}') },`,
  );
  return lines.join('\n') + '\n';
}

const HOSTS = new Set(['angularjs', 'next', 'none']);

/** Hosts with a legacy skin an island must be proven to survive (mirrors lib/config.mjs). */
const LEGACY_FIT_HOSTS = new Set(['angularjs']);

/** POSIX-style relative path for generated code (never a Windows backslash in a module specifier). */
function relPosix(from, to) {
  const r = relative(from, to).split('\\').join('/');
  return r === '' ? '.' : r.startsWith('.') ? r : './' + r;
}

function writeNew(path, contents, created, skipped) {
  if (existsSync(path)) {
    skipped.push(path);
    return false;
  }
  mkdirSync(resolve(path, '..'), { recursive: true });
  writeFileSync(path, contents);
  created.push(path);
  return true;
}

export async function initCommand(argv) {
  const root = resolve(process.cwd(), argv._[0] ?? '.');
  const host = argv.host === true || argv.host === undefined ? 'none' : String(argv.host);
  if (!HOSTS.has(host)) {
    console.error(color.red(`✗ unknown --host '${host}' — expected one of: ${[...HOSTS].join(', ')}`));
    process.exit(2);
  }

  const configPath = resolve(root, 'motu.config.json');
  if (existsSync(configPath) && !argv.force) {
    console.error(color.red(`✗ ${basename(root)}/motu.config.json already exists — use --force to overwrite`));
    process.exit(1);
  }

  // Layout. `app` is the sub-package holding islands/ui/archipelagos; `hostRoot` is where the host
  // application lives (for `next`, the Next app whose aliases/Tailwind the lagoon borrows).
  const appRel = argv.app ? String(argv.app) : '.';
  const hostRel = argv.hostRoot ? String(argv.hostRoot) : appRel;
  const appRoot = resolve(root, appRel);
  const hostRoot = resolve(root, hostRel);
  const lagoonRel = 'roots/lagoon';
  const lagoonDir = resolve(appRoot, lagoonRel);
  const appPackage = argv.appPackage ? String(argv.appPackage) : basename(appRoot) === '.' ? 'motu-app' : basename(appRoot);

  // Islands mount directly in a React host — shadow DOM would cut them off from the host's own
  // stylesheet (Tailwind included), which is the opposite of what a Next island wants.
  const isolation = argv.isolation ? String(argv.isolation) : host === 'angularjs' ? 'shadow' : 'light';

  const created = [];
  const skipped = [];
  mkdirSync(root, { recursive: true });

  const config = {
    app: appRel,
    host,
    hostRoot: hostRel,
    islands: 'src/islands',
    ui: 'src/ui',
    archipelagos: 'src/archipelagos',
    shared: 'src/shared',
    contract: 'contract/src',
    lagoon: lagoonRel,
    ...(host === 'angularjs' ? { bridge: 'roots/bridge' } : {}),
    appPackage,
    tagPrefix: 'x-',
    isolation,
    // Where the framework checkout lives, relative to this file. The lagoon resolves @motu/* from
    // here (they are unpublished, raw-TS packages), so this one line is the only machine-specific
    // path in the project — override it per-machine with the MOTU_ROOT env var.
    motuRoot: relPosix(root, MOTU_ROOT),
  };
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  created.push(configPath);

  // --- the app package: registries, barrel, the shared island sheet ---------------------------
  const motuDep = argv.motuDep ? String(argv.motuDep) : 'workspace:*';
  const adapterPkg = host === 'angularjs' ? '@motu/adapter-angularjs' : host === 'next' ? '@motu/adapter-next' : '';
  const adapterDep = adapterPkg ? `,\n    "${adapterPkg}": "${motuDep}"` : '';

  writeNew(resolve(appRoot, 'package.json'), render(APP_PACKAGE_JSON, { appPackage, motuDep, adapterDep }), created, skipped);
  writeNew(resolve(appRoot, 'src/islands/registry.ts'), ISLANDS_REGISTRY, created, skipped);
  writeNew(resolve(appRoot, 'src/archipelagos/registry.ts'), ARCHIPELAGOS_REGISTRY, created, skipped);
  writeNew(resolve(appRoot, 'src/index.ts'), BARREL, created, skipped);
  writeNew(resolve(appRoot, 'src/shared/styles.css'), SHARED_STYLES, created, skipped);
  writeNew(resolve(appRoot, 'src/ui/.gitkeep'), '', created, skipped);
  writeNew(resolve(root, '.gitignore'), GITIGNORE, created, skipped);

  // --- the lagoon root: where `motu island verify` closes the loop ------------------------------
  if (argv.lagoon !== false) {
    const vars = {
      appPackage,
      motuDep,
      adapterDep,
      appDep: argv.motuDep ? relPosix(lagoonDir, appRoot) : 'workspace:*',
      tagPrefix: 'x-',
      // Baked at scaffold time: a glob cannot go through a tsconfig alias reliably.
      fixturesGlob: relPosix(resolve(lagoonDir, 'src'), resolve(appRoot, 'src/islands')) + '/*/fixtures.mock.ts',
      configFromLagoon: relPosix(lagoonDir, configPath),
      hostRootFromLagoon: relPosix(lagoonDir, hostRoot),
      // Tailwind/autoprefixer are the host's toolchain, but the lagoon runs its own postcss pass.
      lagoonExtraDevDeps: host === 'next' ? ',\n    "autoprefixer": "^10.4.20",\n    "tailwindcss": "^3.4.0"' : '',
      viteHostImports: host === 'next' ? NEXT_VITE_IMPORTS : '',
      motuAliases: motuAliases(lagoonDir, appRoot, appPackage, host),
      hostAliases: host === 'next' ? render(NEXT_VITE_ALIASES, { hostRootFromLagoon: relPosix(lagoonDir, hostRoot) }) : '',
      viteCss: host === 'next' ? render(NEXT_VITE_CSS, { hostRootFromLagoon: relPosix(lagoonDir, hostRoot) }) : '',
      // The AngularJS ocean needs a host present for islands that read host scope; the React hosts
      // need nothing — the store is the only seam.
      hostImport: host === 'angularjs' ? "import { angularHostScopeChannel } from '@motu/adapter-angularjs';\n" : '',
      hostOption: '',
      hostOptionInline: '',
    };

    writeNew(resolve(lagoonDir, 'package.json'), render(LAGOON_PACKAGE_JSON, vars), created, skipped);
    writeNew(resolve(lagoonDir, 'index.html'), render(LAGOON_INDEX_HTML, vars), created, skipped);
    writeNew(resolve(lagoonDir, 'lagoon.html'), render(LAGOON_FOCUS_HTML, vars), created, skipped);
    writeNew(resolve(lagoonDir, 'vite.config.ts'), render(LAGOON_VITE_CONFIG, vars), created, skipped);
    writeNew(resolve(lagoonDir, 'src/fixtures.ts'), render(LAGOON_FIXTURES, vars), created, skipped);
    writeNew(resolve(lagoonDir, 'src/lagoon.tsx'), render(LAGOON_FOCUS_ENTRY, vars), created, skipped);
    writeNew(resolve(lagoonDir, 'src/main.tsx'), render(LAGOON_GALLERY_ENTRY, vars), created, skipped);
    if (host === 'next') writeNew(resolve(lagoonDir, 'src/next-stubs.tsx'), NEXT_STUBS, created, skipped);
  }

  if (argv.json) {
    console.log(JSON.stringify({ root, host, appPackage, created, skipped }, null, 2));
    return;
  }

  console.log(color.green(`✓ initialized motu project in ${basename(root)}/`) + color.dim(`  (host: ${host})`));
  for (const p of created) console.log('  ' + color.dim(relPosix(root, p).replace(/^\.\//, '')));
  for (const p of skipped) console.log('  ' + color.dim(relPosix(root, p).replace(/^\.\//, '')) + color.yellow(' (kept)'));
  console.log('');
  if (!LEGACY_FIT_HOSTS.has(host)) {
    console.log(color.dim('  legacy fit is off for this host — islands mount directly, there is no legacy skin to fit.'));
  }
  console.log('Next: ' + color.bold('motu archipelago create <id>') + color.dim(' then ') + color.bold('motu island create <name>'));
}
