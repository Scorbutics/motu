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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, dirname, relative, resolve } from 'node:path';
import { color } from '../lib/util.mjs';
import { applyHostRules } from '../lib/host-rules.mjs';
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
  LAGOON_CONFIG,
  LAGOON_CHROME_SHADCN,
  LAGOON_OVERRIDES,
  LAGOON_VITE_CONFIG,
  NEXT_STUBS,
  ENV_SHIM,
  NEXT_VITE_IMPORTS,
  NEXT_VITE_ALIASES,
  NEXT_VITE_CSS,
  NEXT_TAILWIND_CONFIG,
} from '../lib/scaffold.mjs';

/** This motu checkout (packages/cli/src/commands -> up 4). */
const MOTU_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

/** Framework entry points, mapped by module specifier — @motu/* are raw TS with no build step. */
const MOTU_ENTRIES = {
  // The ONE motu module application code may import — types only, so it erases at compile time and
  // the app still ships byte-identical output without motu.
  '@motu/types': 'packages/types/src/index.ts',
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

/** Where a Next/React app conventionally keeps the global stylesheet Tailwind is pulled in through. */
const HOST_GLOBAL_CSS = ['app/globals.css', 'src/app/globals.css', 'styles/globals.css', 'src/styles/globals.css'];

/** `import '<host globals.css>';` for the lagoon entries, or '' when the host has no such file. */
function hostGlobalCssImport(lagoonDir, hostRoot) {
  for (const rel of HOST_GLOBAL_CSS) {
    const abs = resolve(hostRoot, rel);
    if (existsSync(abs)) return `import '${relPosix(resolve(lagoonDir, 'src'), abs)}';\n`;
  }
  return '';
}

// 'vite' was supported everywhere EXCEPT here: the adapter exists (packages/adapters/vite/vite.mjs),
// `hostContribution` resolves it, `loadMotuConfig` accepts it, and Twenty runs on it — but the one
// command that starts a project rejected it, so the only way onto a vite host was to hand-write
// motu.config.json. Found on the first greenfield init after adoption stopped needing a checkout path.
const HOSTS = new Set(['angularjs', 'next', 'none', 'vite']);

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
    // NO `motuRoot` BY DEFAULT. It used to be written here as "the only machine-specific path in the
    // project" — a committed relative path to somebody's checkout, which is exactly what breaks on the
    // second machine and in CI. The CLI derives it from the binary that is running (see
    // FRAMEWORK_ROOT in lib/config.mjs), so the correct value is never worth committing.
    //
    // It is still written when $MOTU_ROOT was set for this init: that says the user has a deliberately
    // non-default arrangement, and forgetting it silently would be worse than recording it.
    ...(process.env.MOTU_ROOT ? { motuRoot: relPosix(root, MOTU_ROOT) } : {}),
  };
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  created.push(configPath);

  // --- the app package: registries, barrel, the shared island sheet ---------------------------
  const motuDep = argv.motuDep ? String(argv.motuDep) : 'workspace:*';
  // `workspace:*` IS A LIE IN A STANDALONE PROJECT, and an expensive one: the generated package.json
  // listed three @motu packages that no workspace resolves, so `bun install` — and therefore
  // `bun add react` — failed outright in a freshly-initialised project. A greenfield adopter could
  // not install their first dependency.
  //
  // The packages do not belong there anyway. Nothing resolves @motu/* through node: the lagoon aliases
  // them and tsconfig `paths` maps them, which is the whole "no install step" posture. So they are
  // declared only when a workspace above the project can actually satisfy them.
  const inWorkspace = (() => {
    let dir = appRoot;
    for (let up = 0; up < 6; up++) {
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
      if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) return true;
      try {
        const pkg = JSON.parse(readFileSync(resolve(dir, 'package.json'), 'utf8'));
        if (pkg.workspaces) return true;
      } catch {}
    }
    return false;
  })();
  const motuDependencies =
    inWorkspace || argv.motuDep
      ? `  "dependencies": {\n    "@motu/core": "${motuDep}",\n    "@motu/react": "${motuDep}",` +
        `\n    "@motu/runtime": "${motuDep}"${adapterDepFor(motuDep, host)}\n  },\n`
      : '';
  // 'vite' contributes at BUILD time (packages/adapters/vite/vite.mjs), not as a runtime package,
  // so it needs no adapter dependency — the same as 'none'.
  const adapterPkg = host === 'angularjs' ? '@motu/adapter-angularjs' : host === 'next' ? '@motu/adapter-next' : '';
  const adapterDep = adapterPkg ? `,\n    "${adapterPkg}": "${motuDep}"` : '';
  function adapterDepFor(dep, h) {
    const pkg = h === 'angularjs' ? '@motu/adapter-angularjs' : h === 'next' ? '@motu/adapter-next' : '';
    return pkg ? `,\n    "${pkg}": "${dep}"` : '';
  }

  writeNew(
    resolve(appRoot, 'package.json'),
    render(APP_PACKAGE_JSON, { appPackage, motuDep, adapterDep, motuDependencies }),
    created,
    skipped,
  );
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
      fixturesGlob: `['${relPosix(resolve(lagoonDir, 'src'), resolve(appRoot, 'src/islands'))}/*.evidence.ts', '${relPosix(resolve(lagoonDir, 'src'), resolve(appRoot, 'src/islands'))}/*/fixtures.mock.ts']`,
      configFromLagoon: relPosix(lagoonDir, configPath),
      hostRootFromLagoon: relPosix(lagoonDir, hostRoot),
      // Tailwind/autoprefixer are the host's toolchain, but the lagoon runs its own postcss pass.
      lagoonExtraDevDeps: host === 'next' ? ',\n    "autoprefixer": "^10.4.20",\n    "tailwindcss": "^3.4.0"' : '',
      viteHostImports: host === 'next' ? NEXT_VITE_IMPORTS : '',
      // The app's own global stylesheet. Without it the lagoon has no Tailwind base/utilities and no
      // theme tokens, so islands render unstyled — a preview that lies about how they look in the app.
      hostGlobalCss: hostGlobalCssImport(lagoonDir, hostRoot),
      // FIRST import in both entries: host modules read process.env while being imported.
      // Only where there IS a shim to import: `src/env.ts` is written for the Next host alone, so
      // every other host got an entry file importing a module that was never created.
      envShim: host === 'next' ? "import '{{envImport}}';\n" : '',
      // A Next/shadcn app exposes --primary / --primary-foreground; borrow them so motu's chrome
      // wears the application's colour rather than motu's own.
      lagoonChrome: host === 'next' ? LAGOON_CHROME_SHADCN : '',
      // A React host renders islands in its own tree; the lagoon must do the same or it verifies a
      // mount path the project never ships. An ocean keeps the custom elements.
      lagoonMount: host === 'angularjs' ? '' : '  "mount": "react",\n',
      motuAliases: motuAliases(lagoonDir, appRoot, appPackage, host),
      hostAliases: host === 'next' ? render(NEXT_VITE_ALIASES, { hostRootFromLagoon: relPosix(lagoonDir, hostRoot) }) : '',
      viteCss: host === 'next' ? render(NEXT_VITE_CSS, { hostRootFromLagoon: relPosix(lagoonDir, hostRoot) }) : '',
      // The AngularJS ocean needs a host present for islands that read host scope; the React hosts
      // need nothing — the store is the only seam.
      hostImport: host === 'angularjs' ? "import { angularHostScopeChannel } from '@motu/adapter-angularjs';\n" : '',
      // Paths the entries import by. `init` writes into the lagoon root, so these are the plain
      // relative forms; `motu lagoon dev|build` renders the SAME templates into .motu/cache and
      // overrides them with paths computed from there (see lib/lagoon-materialize.mjs).
      lagoonConfigImport: '../lagoon.config.json',
      overridesImport: './lagoon.js',
      fixturesImport: './fixtures.js',
      framesGlob: './frames/*.css',
      galleryEntrySrc: '/src/main.tsx',
      focusEntrySrc: '/src/lagoon.tsx',
      envImport: './env.js',
      hostOption: '',
      hostOptionInline: '',
    };

    // ENTRIES ARE NOT SCAFFOLDED, and the reason is a name collision the old layout could not survive.
    //
    // It wrote the focus ENTRY to `src/lagoon.tsx` and the OVERRIDES stub to `src/lagoon.ts`, and
    // writing `index.html` made the project "own" its lagoon — which turns off materialization, so
    // those two files became the ones Vite actually serves. But a region's `layout` override returns
    // JSX, so overrides must live in a `.tsx`, which is the entry's name. Following the scaffold
    // produced a lagoon that served the overrides file as its entry and rendered an empty div.
    //
    // peps never hit it because peps has no index.html: it materializes, and its `src/lagoon.tsx` is
    // the overrides. That is the working shape, so it is now the shape `init` creates — entries,
    // index.html and the vite config are rendered into `.motu/cache` by `motu lagoon dev|build`,
    // which is where generated code belongs anyway.
    writeNew(resolve(lagoonDir, 'src/fixtures.ts'), render(LAGOON_FIXTURES, vars), created, skipped);
    // Declared, not coded: what the lagoon IS lives here; what it DOES lives in @motu/react.
    writeNew(resolve(lagoonDir, 'lagoon.config.json'), render(LAGOON_CONFIG, vars), created, skipped);
    writeNew(resolve(lagoonDir, 'src/lagoon.tsx'), LAGOON_OVERRIDES, created, skipped);
    if (host === 'next') {
      writeNew(resolve(lagoonDir, 'src/next-stubs.tsx'), NEXT_STUBS, created, skipped);
      writeNew(resolve(lagoonDir, 'src/env.ts'), ENV_SHIM, created, skipped);
      writeNew(resolve(lagoonDir, 'tailwind.config.ts'), render(NEXT_TAILWIND_CONFIG, vars), created, skipped);
    }
  }

  if (argv.json) {
    console.log(JSON.stringify({ root, host, appPackage, created, skipped }, null, 2));
    return;
  }

  // The rules the HOST's agent has to follow — shipped with motu so they cannot drift from what the
  // CLI enforces, written into the instruction files the repo already keeps.
  const rules = applyHostRules(hostRoot);

  console.log(color.green(`✓ initialized motu project in ${basename(root)}/`) + color.dim(`  (host: ${host})`));
  for (const p of created) console.log('  ' + color.dim(relPosix(root, p).replace(/^\.\//, '')));
  for (const p of skipped) console.log('  ' + color.dim(relPosix(root, p).replace(/^\.\//, '')) + color.yellow(' (kept)'));
  for (const p of rules) console.log('  ' + color.dim(p) + color.dim(' (motu rules block)'));
  console.log('');
  if (!LEGACY_FIT_HOSTS.has(host)) {
    console.log(color.dim('  legacy fit is off for this host — islands mount directly, there is no legacy skin to fit.'));
  }
  console.log('Next: ' + color.bold('motu archipelago create <id>') + color.dim(' then ') + color.bold('motu island create <name>'));
}
