// The lagoon's ENTRIES, rendered by the framework into `.motu/cache` — when the project does not own
// them.
//
// The rule is ownership, not generation: **if the project has its own `index.html`, the project owns
// its lagoon root and nothing here runs.** That is not a courtesy. The reference ocean's `main.tsx` is
// ~180 lines of real composition — transport switching between MockTransport and a session-authenticated
// HttpTransport, an AngularJS host stood up for extracted islands, per-archipelago channels and seeds,
// tide-line stations — none of which a template could produce. A project whose entries ARE the template
// (every `motu init --host next` project) carries them for no reason, and those are the ones this
// deletes.
//
// So `motu lagoon eject` is not a special code path: it is this module writing into the project
// instead of into the cache.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import {
  render,
  LAGOON_INDEX_HTML,
  LAGOON_FOCUS_HTML,
  LAGOON_FIXTURES,
  LAGOON_FOCUS_ENTRY,
  LAGOON_GALLERY_ENTRY,
  LAGOON_OVERRIDES,
  ENV_SHIM,
} from './scaffold.mjs';

/** POSIX-style relative path for generated code (never a Windows backslash in a module specifier). */
function relPosix(from, to) {
  const r = relative(from, to).split('\\').join('/');
  return r === '' ? '.' : r.startsWith('.') ? r : './' + r;
}

/** The host application's own global stylesheet — without it the lagoon has no theme tokens and every
 *  island renders unstyled, a preview that lies about how the component looks in the app. */
const HOST_GLOBAL_CSS = ['app/globals.css', 'src/app/globals.css', 'styles/globals.css', 'src/styles/globals.css'];

function hostGlobalCssImport(fromDir, hostRoot) {
  for (const rel of HOST_GLOBAL_CSS) {
    const abs = resolve(hostRoot, rel);
    if (existsSync(abs)) return `import '${relPosix(fromDir, abs)}';\n`;
  }
  return '';
}

/** Does this project own its lagoon entries? `index.html` is the marker: it is what Vite's root means. */
export function projectOwnsLagoon(paths) {
  return existsSync(resolve(paths.lagoonDir, 'index.html'));
}

/**
 * Render the entries into `outDir`, wiring every import back to the files the PROJECT still owns
 * (`lagoon.config.json`, `src/lagoon.ts`, `src/host-stubs/`, the islands' fixtures, the host's global
 * CSS). Returns the directory to use as Vite's root.
 */
export function materializeLagoon(paths, outDir) {
  const src = resolve(outDir, 'src');
  mkdirSync(src, { recursive: true });

  // The project keeps its overrides (region seeds). A project without them gets an empty stub, so the
  // generated gallery entry's import resolves either way.
  // `.tsx` when the project's overrides carry JSX — a region layout does.
  const overrideCandidates = ['src/lagoon.tsx', 'src/lagoon.ts'].map((f) => resolve(paths.lagoonDir, f));
  const projectOverrides = overrideCandidates.find((f) => existsSync(f)) ?? overrideCandidates[1];
  if (!existsSync(projectOverrides)) writeFileSync(resolve(src, 'lagoon.ts'), LAGOON_OVERRIDES);

  const vars = {
    appPackage: paths.appPackage,
    tagPrefix: paths.tagPrefix,
    // A glob cannot go through a tsconfig alias reliably, so it is baked relative to the file.
    // Both evidence layouts. Vite accepts an array of patterns, so a project can migrate island by
    // island without the lagoon losing sight of the ones that have not moved yet.
    fixturesGlob: `['${relPosix(src, paths.islandsDir)}/*.evidence.ts', '${relPosix(src, paths.islandsDir)}/*/fixtures.mock.ts']`,
    // A REGION's evidence, kept in its own glob: it holds the flows a URL can address, and its
    // `fixtures` must NOT join the mock transport's corpus (that would change what every existing
    // check replays, from a change that was supposed to only add an address).
    flowsGlob: `'${relPosix(src, paths.archipelagosDir)}/*/*.evidence.ts'`,
    framesGlob: relPosix(src, resolve(paths.lagoonDir, 'src/frames')) + '/*.css',
    lagoonConfigImport: relPosix(src, resolve(paths.lagoonDir, 'lagoon.config.json')),
    overridesImport: existsSync(projectOverrides) ? relPosix(src, projectOverrides) : './lagoon.js',
    fixturesImport: './fixtures.js',
    galleryEntrySrc: '/src/main.tsx',
    focusEntrySrc: '/src/lagoon.tsx',
    hostGlobalCss: hostGlobalCssImport(src, paths.hostRoot),
    // FIRST import in both entries: host modules read process.env while being imported, so the shim
    // has to land before any of them is evaluated. An ocean has no such modules and needs no shim.
    envShim: paths.host === 'angularjs' ? '' : "import './env.js';\n",
    hostImport: paths.host === 'angularjs' ? "import { angularHostScopeChannel } from '@motu/adapter-angularjs';\n" : '',
    hostOption: '',
  };

  writeFileSync(resolve(outDir, 'index.html'), render(LAGOON_INDEX_HTML, vars));
  writeFileSync(resolve(outDir, 'lagoon.html'), render(LAGOON_FOCUS_HTML, vars));
  writeFileSync(resolve(src, 'fixtures.ts'), render(LAGOON_FIXTURES, vars));
  writeFileSync(resolve(src, 'main.tsx'), render(LAGOON_GALLERY_ENTRY, vars));
  writeFileSync(resolve(src, 'lagoon.tsx'), render(LAGOON_FOCUS_ENTRY, vars));
  if (paths.host !== 'angularjs') writeFileSync(resolve(src, 'env.ts'), render(ENV_SHIM, vars));

  return outDir;
}

/** Vite's root for this project: its own lagoon dir if it owns one, else a freshly rendered cache. */
export function resolveLagoonRoot(paths) {
  if (projectOwnsLagoon(paths)) return paths.lagoonDir;
  return materializeLagoon(paths, resolve(paths.cacheDir, 'lagoon'));
}
