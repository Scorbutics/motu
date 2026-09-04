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
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
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
// Every entry below is re-rendered on EVERY lagoon build and is almost always identical. See the
// module's own doc for why an identical write is not free: Vite watches these, and a touch full-reloads
// every open lagoon tab.
import { writeIfChanged } from './write-if-changed.mjs';

/** POSIX-style relative path for generated code (never a Windows backslash in a module specifier). */
function relPosix(from, to) {
  const r = relative(from, to).split('\\').join('/');
  return r === '' ? '.' : r.startsWith('.') ? r : './' + r;
}

/** The host application's own global stylesheet — without it the lagoon has no theme tokens and every
 *  island renders unstyled, a preview that lies about how the component looks in the app. */
const HOST_GLOBAL_CSS = ['app/globals.css', 'src/app/globals.css', 'styles/globals.css', 'src/styles/globals.css'];

/**
 * The stylesheet that DECLARES Tailwind, found by content when it is not at a conventional path.
 *
 * Tailwind v4 moved the config into CSS (`@import "tailwindcss"`, `@theme { … }`) and dropped
 * `tailwind.config.js` — so a v4 project has no config file to detect AND commonly keeps its global
 * stylesheet outside the four paths above. Measured on a cold adoption of a v4 Next app whose CSS
 * lives at `modules/ui/globals.css`: motu found neither, wired no styles, and the lagoon rendered
 * every island with correct text, structure and coupling and NO styling at all — silently. The agent
 * who hit it could not tell a preview bug from an application bug, which is the one thing a preview
 * must never make ambiguous.
 *
 * Bounded, shallow, and skipping the obvious noise: this runs on every lagoon build.
 */
function findTailwindCss(hostRoot, depth = 4) {
  const SKIP = new Set(['node_modules', '.next', '.git', 'dist', 'build', 'coverage', '.motu', '.turbo']);
  const queue = [{ dir: hostRoot, d: 0 }];
  while (queue.length) {
    const { dir, d } = queue.shift();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (d < depth && !SKIP.has(e.name) && !e.name.startsWith('.')) queue.push({ dir: resolve(dir, e.name), d: d + 1 });
        continue;
      }
      if (!e.name.endsWith('.css')) continue;
      const abs = resolve(dir, e.name);
      try {
        const css = readFileSync(abs, 'utf8');
        if (/@import\s+['"]tailwindcss|@tailwind\s+(base|utilities)/.test(css)) return abs;
      } catch {}
    }
  }
  return null;
}

function hostGlobalCssImport(fromDir, hostRoot) {
  for (const rel of HOST_GLOBAL_CSS) {
    const abs = resolve(hostRoot, rel);
    if (existsSync(abs)) return `import '${relPosix(fromDir, abs)}';\n`;
  }
  const found = findTailwindCss(hostRoot);
  if (found) return `import '${relPosix(fromDir, found)}';\n`;
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
  if (!existsSync(projectOverrides)) writeIfChanged(resolve(src, 'lagoon.ts'), LAGOON_OVERRIDES);

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

  writeIfChanged(resolve(outDir, 'index.html'), render(LAGOON_INDEX_HTML, vars));
  writeIfChanged(resolve(outDir, 'lagoon.html'), render(LAGOON_FOCUS_HTML, vars));
  writeIfChanged(resolve(src, 'fixtures.ts'), render(LAGOON_FIXTURES, vars));
  writeIfChanged(resolve(src, 'main.tsx'), render(LAGOON_GALLERY_ENTRY, vars));
  writeIfChanged(resolve(src, 'lagoon.tsx'), render(LAGOON_FOCUS_ENTRY, vars));
  if (paths.host !== 'angularjs') writeIfChanged(resolve(src, 'env.ts'), render(ENV_SHIM, vars));

  return outDir;
}

/** Vite's root for this project: its own lagoon dir if it owns one, else a freshly rendered cache. */
export function resolveLagoonRoot(paths) {
  if (projectOwnsLagoon(paths)) return paths.lagoonDir;
  return materializeLagoon(paths, resolve(paths.cacheDir, 'lagoon'));
}

/**
 * WHAT AN EJECTED ENTRY IS MISSING, compared with the one motu would write today.
 *
 * Ejecting hands the project its entry and stops the materializer: "the project now owns these —
 * motu will not regenerate them." That is the point of the escape hatch, and it has a cost nobody was
 * told about. Every capability added to the scaffold afterwards reaches an ejected project only if
 * somebody edits that file by hand, and nothing said when they had not.
 *
 * It has already happened twice in this repo's own demo-app: `evidence` (so `?scenario=` addressed a
 * catalogue that was never handed over — every declared state unreachable in a browser) and
 * `lens.onPicked` (so the crosshair could not scope). Both were silent: the entry compiled, the
 * lagoon booted, and the feature simply was not there.
 *
 * DERIVED FROM THE TEMPLATE, never a hand-kept list, or this check becomes the next thing that goes
 * stale. Compares the option keys `startLagoon({...})` is given, and the keys of the `lens` object
 * inside it — the two places options actually arrive.
 */
export function ejectedEntryGaps(paths) {
  const entry = resolve(paths.lagoonDir, 'src', 'main.tsx');
  if (!projectOwnsLagoon(paths) || !existsSync(entry)) return null;

  // NAME-PRESENCE, not shape. Parsing both sides was the first attempt and it was wrong twice over:
  // it read an `import.meta.glob` options object as lagoon options, and it missed demo-app's
  // `lens: __MOTU_DEBUG__ ? {…} : undefined` because that is not a literal `lens: {`. An ejected entry
  // is a file somebody has been editing — it may wrap, rename or conditionalise anything — so the
  // only question worth asking cheaply is whether the capability is MENTIONED at all. That is enough
  // to catch what actually goes wrong here (an option added upstream that nobody copied down), and it
  // cannot cry wolf over formatting.
  // FULL-LINE COMMENTS ONLY. Stripping block comments with a regex ate real code here (a `/*` in a
  // string closed against a later `*/`), and prose is where a key name would otherwise be mistaken
  // for a use — this file's own comments mention `target` and `scenario` while explaining them.
  const strip = (t) => t.replace(/^\s*\/\/.*$/gm, '');
  const mine = strip(readFileSync(entry, 'utf8'));
  const template = strip(LAGOON_GALLERY_ENTRY);

  const optionNames = (text, opener) => {
    const at = text.indexOf(opener);
    if (at === -1) return [];
    const out = new Set();
    let depth = 0;
    for (let i = at + opener.length - 1; i < text.length; i++) {
      const c = text[i];
      if (c === '{' || c === '(' || c === '[') depth++;
      else if (c === '}' || c === ')' || c === ']') {
        if (--depth === 0) break;
      } else if (depth === 1 && /[A-Za-z_$]/.test(c)) {
        const before = text.slice(0, i).replace(/\s+$/, '').slice(-1);
        const m = /^[A-Za-z_$][\w$]*/.exec(text.slice(i));
        if (m && (before === '{' || before === ',')) {
          const after = text.slice(i + m[0].length).replace(/^\s+/, '').slice(0, 1);
          if (after === ':' || after === ',' || after === '}') out.add(m[0]);
          i += m[0].length - 1;
        }
      }
    }
    return [...out];
  };

  const mentions = (name) => new RegExp(`\\b${name}\\b`).test(mine);
  const expected = [...optionNames(template, 'startLagoon({'), ...optionNames(template, 'lens: {')];
  return {
    entry: relative(process.cwd(), entry),
    missing: [...new Set(expected)].filter((k) => !mentions(k)).sort(),
  };
}
