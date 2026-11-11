// The lagoon's Vite configuration, assembled IN THE FRAMEWORK.
//
// Every line of this used to be scaffolded into each adopting project as a `roots/lagoon/vite.config.ts`
// — ~125 lines of build wiring, a package.json, a lockfile and a node_modules, none of which encoded a
// project decision. The alias table is host-adapter knowledge; the `__MOTU_*` defines are a contract
// with `motu island verify` (which sets the matching env when it boots this server) that the generated
// file could only warn you not to break. Owning it here means an improvement to the lagoon arrives with
// the framework instead of needing every project's copy regenerated.
//
// A project declares its posture in motu.config.json and its lagoon in lagoon.config.json. That is all.
// `motu lagoon eject` writes the old files back out for a project that genuinely needs to fork.
import { createRequire } from 'node:module';
import { injectDock } from './dock-inject.mjs';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveLagoonRoot } from './lagoon-materialize.mjs';
import { writeIfChanged } from './write-if-changed.mjs';
import { motuProvenance } from './provenance-plugin.mjs';
import { unbundlableIslands } from './bundlability.mjs';
import { hostAliasEntries } from './util.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
/** The motu checkout this CLI is running from — where build deps are resolved from first. */
const FRAMEWORK_ROOT = resolve(HERE, '../../../..');

/**
 * Resolve a package's ESM entry point from a given root.
 *
 * `createRequire().resolve()` always picks the `require` condition, which for Vite hands back the CJS
 * build: it prints a deprecation warning and has no `build` on it, so the failure surfaces a long way
 * from its cause. Read the package's own `exports` map instead and take the import condition, falling
 * back through `module`/`main` for the packages that are still CJS-only (Tailwind 3), which Node
 * interops on import anyway.
 */
function esmEntry(root, name) {
  const req = createRequire(resolve(root, 'package.json'));
  // Not every package exports './package.json' (an `exports` map without it makes this throw
  // ERR_PACKAGE_PATH_NOT_EXPORTED), so fall back to the require-resolved entry and let Node interop it.
  let pkgJsonPath;
  try {
    pkgJsonPath = req.resolve(`${name}/package.json`);
  } catch {
    return pathToFileURL(req.resolve(name)).href;
  }
  const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
  const pick = (node) => {
    if (!node) return null;
    if (typeof node === 'string') return node;
    return pick(node.import) ?? pick(node.default) ?? pick(node.require) ?? null;
  };
  const entry = pick(pkg.exports?.['.']) ?? pkg.module ?? pkg.main ?? 'index.js';
  return pathToFileURL(resolve(dirname(pkgJsonPath), entry)).href;
}

/** Try each root in order, returning the first namespace that imports. */
async function importFrom(name, roots) {
  for (const root of roots.filter(Boolean)) {
    try {
      return await import(esmEntry(root, name));
    } catch {
      /* try the next root */
    }
  }
  return null;
}

/** The directory a package resolves to from `root`, or null. Aliases need a path, not a namespace. */
function packageDir(root, name) {
  try {
    return dirname(createRequire(resolve(root, 'package.json')).resolve(`${name}/package.json`));
  } catch {
    return null;
  }
}

/**
 * REACT, when the project has none.
 *
 * The lagoon deliberately installs no React and dedupes onto the host application's copy — two Reacts
 * break hooks the moment an island renders a component from the host's own library. That is right
 * whenever there IS a host copy, and fatal when there is not: a freshly `motu init`-ed project has no
 * node_modules at all, so every `@motu/react` module failed to resolve `react`, and the lagoon served
 * 500s. `island verify` reported it as "island tag did not upgrade" — the true cause named nowhere.
 *
 * So: the host's copy wins wherever it exists, and the framework's own is the fallback that makes a
 * project with nothing installed still able to render. Same reasoning that already lets the framework
 * own vite and the build plugins, applied to the one dependency the lagoon genuinely shares with the
 * app it frames.
 *
 * Returns aliases only in the fallback case — adding them when the host HAS React would defeat the
 * dedupe this exists alongside.
 */
function reactFallbackAliases(paths) {
  const projectRoots = [paths.hostRoot, paths.root, paths.lagoonDir].filter(Boolean);
  if (projectRoots.some((r) => packageDir(r, 'react'))) return [];
  // NOT the checkout root: in a pnpm workspace React is a devDependency of `packages/cli`, and the
  // root resolves nothing. Ask from a package that actually declares it — which is also where a
  // published install would find it.
  const frameworkRoots = [resolve(FRAMEWORK_ROOT, 'packages/react'), resolve(FRAMEWORK_ROOT, 'packages/cli'), FRAMEWORK_ROOT];
  const fromFramework = (name) => {
    for (const r of frameworkRoots) {
      const dir = packageDir(r, name);
      if (dir) return dir;
    }
    return null;
  };
  const out = [];
  for (const name of ['react-dom', 'react']) {
    const dir = fromFramework(name);
    // Anchored, and the SUBPATH form first: `react-dom/client` must not be swallowed by `react-dom`,
    // and `react` must not swallow `react-dom` — the exact alias-ordering trap noInstallAliases documents.
    if (dir) {
      out.push({ find: new RegExp(`^${name}/(.*)$`), replacement: `${dir}/$1` });
      out.push({ find: new RegExp(`^${name}$`), replacement: dir });
    }
  }
  return out;
}

/**
 * Vite's own API (named exports: `build`, `createServer`, `preview`).
 *
 * Separate from `resolveBuildDep` below, which unwraps a default export for plugins — Vite has none,
 * it is a namespace.
 */
export async function resolveVite(paths) {
  // THE HOST'S VITE FIRST, ON A VITE HOST — because on that host the lagoon runs the HOST'S OWN
  // PLUGINS, and a plugin is written against the Vite its project installed.
  //
  // Framework-first was right while the lagoon only ran motu's own pipeline. It stopped being right
  // the moment the vite adapter began borrowing the host's plugins and resolve options: measured on
  // Mastodon, the app runs Vite 8.2.1 and resolves its bare `mastodon/…` imports with
  // `resolve.tsconfigPaths`, a Vite 6+ option that motu's bundled Vite 5.4.21 accepts and SILENTLY
  // IGNORES. `tsc` and the app's own dev server resolved those imports; the lagoon 500'd on every one
  // of them, and the adopter had to hand-write an alias table into a forked config to work around a
  // version skew nothing reported.
  //
  // Other hosts keep framework-first: a Next or AngularJS project's Vite, if it has one at all, is not
  // the build the lagoon is imitating.
  const hostFirst = paths.host === 'vite';
  const roots = hostFirst
    ? [paths.hostRoot, FRAMEWORK_ROOT, paths.lagoonDir]
    : [FRAMEWORK_ROOT, paths.lagoonDir];
  const mod = await importFrom('vite', roots);
  if (!mod?.build) throw new Error(`motu: cannot resolve vite. Looked in: ${roots.join(', ')}.`);
  return mod;
}

/**
 * Resolve a build dependency (plugins, Tailwind) and unwrap its default export.
 *
 * Framework first, project second. The framework owning its own build deps is what lets a project drop
 * the lagoon's package.json entirely; the project fallback keeps every EXISTING project working during
 * the migration, and keeps `eject` honest afterwards.
 */
export async function resolveBuildDep(name, ...extraRoots) {
  const roots = [FRAMEWORK_ROOT, ...extraRoots];
  const mod = await importFrom(name, roots);
  if (!mod) {
    throw new Error(
      `motu: cannot resolve build dependency '${name}'. Looked in: ${roots.filter(Boolean).join(', ')}.\n` +
        `Install it in the motu checkout (${FRAMEWORK_ROOT}) so every project gets it without its own install.`,
    );
  }
  return mod?.default?.default ?? mod?.default ?? mod;
}

/** The lagoon's own declaration. Describes the LAGOON; motu.config.json describes the project. */
export function loadLagoonJson(paths) {
  const p = resolve(paths.lagoonDir, 'lagoon.config.json');
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Resolving @motu/* and the project's own island package BY PATH.
 *
 * The @motu/* packages are unpublished and ship as raw TypeScript, so a project that has not installed
 * them (and should not have to) reaches them through these aliases. A workspace-linked project
 * (the reference ocean) resolves them through node_modules instead and contributes nothing here.
 *
 * Array form with anchored patterns, not the object form: Vite's alias matcher is
 * exact-or-prefix-with-a-slash, which gets two things wrong — 'pkg/styles.css?inline' never matches
 * 'pkg/styles.css' (the query is part of the id), and '@motu/runtime' happily swallows
 * '@motu/runtime/mock'. Anchored regexes make each mapping mean exactly what it says.
 */
/**
 * The host's workspace root — where a monorepo hoists the dependencies the host imports.
 *
 * Walks up for the markers a workspace leaves (a lockfile, a pnpm/yarn workspace declaration) rather
 * than importing Vite's `searchForWorkspaceRoot`: this module is loaded before Vite is resolved, and
 * the rule is simple enough that a dependency for it would be the more surprising choice.
 */
function workspaceRootOf(hostRoot) {
  const MARKERS = ['pnpm-workspace.yaml', 'yarn.lock', 'pnpm-lock.yaml', 'package-lock.json', 'bun.lock', 'lerna.json'];
  let dir = hostRoot;
  let found = null;
  for (let up = 0; up < 10; up++) {
    if (MARKERS.some((m) => existsSync(resolve(dir, m)))) found = dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return found;
}

export function noInstallAliases(paths) {
  const motu = (p) => resolve(paths.motuRoot, p);
  const pkg = paths.appPackage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [
    // Plain ESM, no TypeScript: @motu/core imports the palette from here, and so does the lagoon
    // HOST, which runs under bare node. One package both can read is the point of it.
    { find: /^@motu\/chrome$/, replacement: motu('packages/chrome/src/index.mjs') },
    // The React kit. It is the one COMPILED corner of an as-authored package, so `@motu/chrome/react`
    // resolves to `dist/react` through the exports map — which would make every kit edit invisible
    // until someone re-ran the package build. Aliased to source like every other @motu package here,
    // for the same reason: the lagoon is where motu's own chrome is looked at while it is being
    // changed.
    { find: /^@motu\/chrome\/react$/, replacement: motu('packages/chrome/src/react/index.tsx') },
    { find: /^@motu\/core$/, replacement: motu('packages/core/src/index.ts') },
    { find: /^@motu\/coverage$/, replacement: motu('packages/coverage/src/index.ts') },
    { find: /^@motu\/react$/, replacement: motu('packages/react/src/index.ts') },
    { find: /^@motu\/react\/define$/, replacement: motu('packages/react/src/defineReactElement.ts') },
    { find: /^@motu\/runtime\/mock$/, replacement: motu('packages/runtime/src/mock.ts') },
    // MISSING FOR A WHILE, and invisibly: without it `@motu/runtime/postgrest-fetch` is a bare
    // specifier, so it resolves through the exports map to `dist/` and Vite pre-bundles it — every
    // edit to the wire fake was then invisible in the lagoon until someone rebuilt AND cleared
    // `node_modules/.vite`. Found while testing a new check that kept passing against stale code.
    { find: /^@motu\/runtime\/postgrest-fetch$/, replacement: motu('packages/runtime/src/postgrest-fetch.ts') },
    { find: /^@motu\/runtime$/, replacement: motu('packages/runtime/src/index.ts') },
    { find: /^@motu\/debug-overlay$/, replacement: motu('packages/debug-overlay/src/index.ts') },
    { find: /^@motu\/adapter-next$/, replacement: motu('packages/adapters/next/src/index.ts') },
    { find: new RegExp(`^${pkg}/styles\\.css`), replacement: resolve(paths.sharedDir, 'styles.css') },
    { find: new RegExp(`^${pkg}$`), replacement: paths.barrel },
  ];
}

/** The host adapter's Vite contribution, if it ships one. */
async function hostContribution(ctx) {
  const dir = ['angularjs', 'next', 'vite'].includes(ctx.paths.host) ? ctx.paths.host : null;
  if (!dir) return {};
  const mod = resolve(ctx.paths.motuRoot, `packages/adapters/${dir}/vite.mjs`);
  if (!existsSync(mod)) return {};
  const { contribute } = await import(pathToFileURL(mod).href);
  return (await contribute(ctx)) ?? {};
}

/**
 * Assemble the lagoon's Vite config.
 *
 * `env` is the MOTU_* surface `motu island verify` sets when it boots this server — passed explicitly
 * rather than read from process.env, so a programmatic caller (verify, publish, serve) states what it
 * wants instead of mutating the environment and hoping.
 */

/**
 * Keep ONE island's unbundlable import graph from taking the whole lagoon with it.
 *
 * The lagoon builds every archipelago as one chunk, so a module rollup cannot resolve — a Next server
 * action reaching `node:async_hooks`, say — is not a broken preview for that island, it is a dead
 * build for every island in the project. Measured: a green `motu check --runtime` and not one
 * openable URL.
 *
 * `load()` rather than an alias, because the registry imports islands by RELATIVE path and an alias
 * matches specifier strings. Intercepting the resolved file means rollup never parses the real
 * module, so it never walks into the graph that cannot be bundled.
 *
 * WHAT THIS DOES NOT DO: it does not make the island work, and it must never be mistaken for that.
 * The island still fails `rsc-boundary` in `motu island verify`, its slot renders a card saying why,
 * and the build prints what it dropped. Only the blast radius changes.
 */
function excludeUnbundlable(excluded) {
  const byFile = new Map(excluded.map((e) => [resolve(e.element), e]));
  if (!byFile.size) return null;
  return {
    name: 'motu:exclude-unbundlable',
    enforce: 'pre',
    load(id) {
      const hit = byFile.get(resolve(id.split('?')[0]));
      if (!hit) return null;
      const tag = JSON.stringify(hit.tag ?? hit.kebab);
      const reason = JSON.stringify(hit.reason);
      const name = JSON.stringify(hit.kebab);
      return `// Generated by motu: this island was left OUT of the lagoon build.
import { islandElement } from '@motu/react';
import { createElement as h } from 'react';

const Unbundlable = () =>
  h('div', { 'data-motu-unbundlable': ${name}, style: { padding: '12px', border: '1px dashed #b45309', borderRadius: '6px', color: '#b45309', font: '12px/1.5 ui-monospace, monospace' } },
    h('strong', null, ${name} + ' could not be bundled'),
    h('div', null, ${reason}),
    h('div', { style: { opacity: 0.8, marginTop: '6px' } }, 'Every other island in this lagoon is unaffected. Run: motu island verify ' + ${name}));

export const element = islandElement({ tag: ${tag}, component: Unbundlable });
`;
    },
  };
}

/**
 * Which chunk a module belongs to when the lagoon is published as chunks.
 *
 * The lagoon imports every region EAGERLY, so the bundler on its own would make one chunk and every
 * edit would change all of it. The cut follows how the project changes:
 *
 *   vendor              every dependency — changes when the lockfile does
 *   motu                the framework — changes when motu is upgraded
 *   region-<id>         one archipelago's folder
 *   island-<kebab>      one island (its folder, or its flat `<kebab>.*.ts` files)
 *   host-<dir>          the application's own code, one directory at a time
 *   (the entry)         the generated lagoon entry
 *
 * so an edit inside one region re-sends that region's chunk and the small manifest, not the lagoon.
 *
 * NO TWO CHUNKS MAY IMPORT EACH OTHER. Chunks evaluate as whole units, so a cycle between two of them
 * runs one before what it needs exists (`Cannot access 'n' before initialization`, first seen on the
 * demo). Directories are therefore only the NAMES; the CUT follows evaluation order:
 *
 *   1. FOUNDATIONS. vendor and motu import nothing of the application. When they do — Peps aliases
 *      `next/navigation` and its Supabase client to stubs in the lagoon's own source, so dependencies
 *      import app code — what they import is pulled DOWN into them.
 *   2. THE APPLICATION, in the order the browser would evaluate it (depth-first, imports in source
 *      order). A new chunk starts where the directory changes, and never inside a module cycle. Every
 *      import then points at an EARLIER chunk, so the chunk graph is acyclic by construction.
 *
 * Merging whole directories on a cycle was tried first, and is wrong for an integrated app: Peps'
 * pages import its regions and its regions import the pages' components through different files, so
 * every directory sat on one cycle and became one 600 kB chunk. Cutting by evaluation order keeps a
 * region's code in its own chunk(s) however the directories interleave. A directory evaluated in
 * several runs gets several chunks (`region-x`, `region-x.2`); a run under 4 kB folds into its
 * neighbour, so the count stays near the number of directories.
 */
export function chunkOf(paths) {
  const norm = (p) => String(p ?? '').replace(/\\/g, '/').replace(/\/+$/, '');
  const motuPkgs = norm(resolve(paths.motuRoot, 'packages')) + '/';
  const archipelagos = norm(paths.archipelagosDir) + '/';
  const islands = norm(paths.islandsDir) + '/';
  const host = norm(paths.hostRoot) + '/';
  const safe = (s) => s.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'x';
  const ENTRY = 'entry';
  const MIN_RUN = 4 * 1024;
  const firstGuess = (rawId) => {
    const id = norm(rawId.split('?')[0]);
    if (rawId.startsWith('\0') || id.includes('/node_modules/')) return 'vendor';
    if (id.startsWith(motuPkgs)) return 'motu';
    if (id.startsWith(archipelagos)) return 'region-' + safe(id.slice(archipelagos.length).split('/')[0].replace(/\.[^.]*$/, ''));
    if (id.startsWith(islands)) return 'island-' + safe(id.slice(islands.length).split('/')[0].split('.')[0]);
    if (id.startsWith(host) && !id.includes('/.motu/')) {
      const dirs = id.slice(host.length).split('/').slice(0, -1);
      if (dirs.length) return 'host-' + safe(dirs.join('-'));
    }
    return ENTRY;
  };
  const foundation = (g) => g === 'vendor' || g === 'motu';

  let plan = null;
  const planFor = (getModuleIds, getModuleInfo) => {
    const ids = [...getModuleIds()];
    const known = new Set(ids);
    const deps = (id) => (getModuleInfo(id)?.importedIds ?? []).filter((d) => known.has(d));
    const group = new Map(ids.map((id) => [id, firstGuess(id)]));

    // 1. FOUNDATIONS pull down what they import: motu first, then vendor, which wins a module both want.
    for (const f of ['motu', 'vendor']) {
      const work = ids.filter((id) => group.get(id) === f);
      while (work.length) {
        const id = work.pop();
        for (const d of deps(id)) {
          const h = group.get(d);
          if (h === f || h === 'vendor') continue;
          group.set(d, f);
          work.push(d);
        }
      }
    }

    // 2. THE APPLICATION, in evaluation order: depth-first post-order from each entry.
    const app = (id) => !foundation(group.get(id));
    const order = [];
    const seen = new Set();
    const visit = (root) => {
      const stack = [[root, 0]];
      seen.add(root);
      while (stack.length) {
        const top = stack[stack.length - 1];
        const ds = deps(top[0]);
        if (top[1] < ds.length) {
          const d = ds[top[1]++];
          if (!seen.has(d) && app(d)) {
            seen.add(d);
            stack.push([d, 0]);
          }
        } else {
          stack.pop();
          order.push(top[0]);
        }
      }
    };
    for (const id of ids) if (app(id) && getModuleInfo(id)?.isEntry) visit(id);
    for (const id of ids) if (app(id) && !seen.has(id)) visit(id);
    const pos = new Map(order.map((id, i) => [id, i]));

    // Module cycles: a cut may not fall inside one. For each module, the last position of its cycle.
    const spanEnd = new Map(order.map((id) => [id, pos.get(id)]));
    {
      const index = new Map();
      const low = new Map();
      const on = new Set();
      const st = [];
      let n = 0;
      const strong = (v) => {
        index.set(v, n);
        low.set(v, n++);
        st.push(v);
        on.add(v);
        for (const w of deps(v)) {
          if (!pos.has(w)) continue;
          if (!index.has(w)) {
            strong(w);
            low.set(v, Math.min(low.get(v), low.get(w)));
          } else if (on.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
        }
        if (low.get(v) === index.get(v)) {
          const members = [];
          let w;
          do {
            w = st.pop();
            on.delete(w);
            members.push(w);
          } while (w !== v);
          if (members.length > 1) {
            const end = Math.max(...members.map((m) => pos.get(m)));
            for (const m of members) spanEnd.set(m, end);
          }
        }
      };
      for (const id of order) if (!index.has(id)) strong(id);
    }

    // Runs: cut where the directory changes, unless a module cycle is still open.
    const runs = [];
    let open = -1;
    for (const id of order) {
      const g = group.get(id);
      const last = runs[runs.length - 1];
      if (last && (last.group === g || pos.get(id) <= open)) last.ids.push(id);
      else runs.push({ group: g, ids: [id] });
      open = Math.max(open, spanEnd.get(id));
    }
    // Small runs fold into the previous one (contiguity is what keeps the graph acyclic).
    const sizeOf = (run) => run.ids.reduce((n, id) => n + (getModuleInfo(id)?.code?.length ?? 0), 0);
    const folded = [];
    for (const run of runs) {
      const prev = folded[folded.length - 1];
      if (prev && sizeOf(run) < MIN_RUN) prev.ids.push(...run.ids);
      else folded.push(run);
    }
    // The FIRST run has nothing before it, so a small one folds forward instead.
    if (folded.length > 1 && sizeOf(folded[0]) < MIN_RUN) folded[1].ids.unshift(...folded.shift().ids);
    // The run holding an entry module IS the entry chunk; every other run is named.
    plan = new Map();
    for (const id of ids) if (foundation(group.get(id))) plan.set(id, group.get(id));
    const used = new Map();
    for (const run of folded) {
      const holdsEntry = run.ids.some((id) => getModuleInfo(id)?.isEntry);
      let name;
      if (holdsEntry) name = undefined;
      else {
        const k = (used.get(run.group) ?? 0) + 1;
        used.set(run.group, k);
        name = k === 1 ? run.group : `${run.group}.${k}`;
      }
      for (const id of run.ids) plan.set(id, name);
    }
  };

  return (rawId, meta) => {
    if (!plan && meta?.getModuleIds) planFor(meta.getModuleIds, meta.getModuleInfo);
    if (plan?.has(rawId)) return plan.get(rawId);
    const g = firstGuess(rawId);
    return foundation(g) ? g : undefined;
  };
}

export async function buildLagoonViteConfig(paths, env = process.env) {
  // `paths` must be loadMotuConfig()'s result, NOT util.mjs's curated `paths` export — that one has no
  // `host`, so the host contribution would silently return nothing and the lagoon would build with no
  // aliases at all. That failure surfaces as "@motu/react could not be resolved", which points nowhere
  // near the cause. Fail here instead.
  for (const key of ['host', 'motuRoot', 'lagoonDir', 'appRoot', 'hostRoot', 'cacheDir', 'isolation']) {
    if (paths?.[key] === undefined) {
      throw new Error(`motu: buildLagoonViteConfig needs loadMotuConfig()'s config — missing '${key}'.`);
    }
  }
  const lagoonJson = loadLagoonJson(paths);
  const react = await resolveBuildDep('@vitejs/plugin-react', paths.lagoonDir);
  // The project's own lagoon dir when it owns its entries; a freshly rendered `.motu/cache/lagoon`
  // when it does not. See lib/lagoon-materialize.mjs for why this is ownership rather than generation.
  const root = resolveLagoonRoot(paths);

  // MOTU_SINGLEFILE=lagoon|main builds ONE entry as ONE chunk so `motu lagoon publish` can inline the
  // whole app into a single HTML file — nothing serves /assets/* behind a static artifact.
  const singleFile = env.MOTU_SINGLEFILE === 'lagoon' ? 'lagoon' : env.MOTU_SINGLEFILE === 'main' ? 'main' : '';
  // MOTU_CHUNKED=lagoon|main builds ONE entry as STABLY NAMED CHUNKS, for a host that stores them by
  // content (`motu lagoon publish --remote`, `serve --live-push`). See `chunkOf` for why the names
  // are stable and how they are cut.
  const chunked = !singleFile && (env.MOTU_CHUNKED === 'lagoon' ? 'lagoon' : env.MOTU_CHUNKED === 'main' ? 'main' : '');
  const oneEntry = singleFile || chunked;

  // `writeIfChanged` rather than the adapter reaching for `writeFileSync`: an adapter that generates
  // into `.motu/cache` is generating into a directory Vite WATCHES, and the write policy for that
  // directory belongs to whoever owns it. See lib/write-if-changed.mjs — an identical write still
  // reloads every open lagoon tab.
  const ctx = { paths, lagoonJson, env, writeIfChanged, resolveBuildDep: (n) => resolveBuildDep(n, paths.lagoonDir) };

  // Islands whose import graph cannot be bundled, stubbed rather than allowed to kill the build.
  // MOTU_NO_EXCLUDE=1 restores the old all-or-nothing behaviour for anyone who needs to see the raw
  // rollup failure.
  const excluded = env.MOTU_NO_EXCLUDE === '1' ? [] : await unbundlableIslands({ aliased: Object.keys(lagoonJson.alias ?? {}) });
  const excludedPlugin = excludeUnbundlable(excluded);
  // ONE MARKED LINE PER ISLAND, because this config is often built in a CHILD PROCESS whose output is
  // piped and surfaced only on FAILURE (`lagoon.mjs`'s `buildSingleFile`). A plain console.warn here
  // was emitted, captured and discarded on every successful build — so the feature worked and said
  // nothing, which is the exact failure it was written to prevent. The parent greps for this prefix.
  for (const e of excluded) console.warn(`[motu:excluded] ${e.kebab} — ${e.reason}`);

  // HOST PLUGINS THAT COULD NOT RUN HERE. Filled by the vite adapter's guard as the hooks execute, so
  // it is read after the config is built — printed on the same marked channel as island exclusions
  // because a silently dropped transform is the same class of lie: a build that quietly did less.
  process.on('exit', () => {
    for (const d of host.droppedHostPlugins ?? []) {
      console.warn(`[motu:excluded] host vite plugin "${d.name}" (${d.hook}) — ${d.message}`);
    }
  });
  const host = await hostContribution(ctx);

  return {
    root,
    // RELATIVE when chunked: the page and its chunks are served under an address only the server
    // knows (`/__motu_assets/<manifest>/` on a host), and chunks find each other relative to
    // themselves. The HTML's own references are rewritten by the CLI to a placeholder the server fills.
    ...(chunked ? { base: './' } : {}),
    // The whole point: no vite.config.ts on disk in the project.
    configFile: false,
    // The host's React transform wins when it has one: two JSX transforms in one pipeline is a
    // duplicated runtime, and it surfaces as hooks failing with nothing to point at.
    plugins: [
      ...(host.ownsReactTransform ? [] : [react()]),
      // Framework-level, not the adapter's: every host that aliases a module wants its calls visible,
      // and one copy per adapter would be three copies of one decision.
      ...(env.MOTU_DEBUG === '0' ? [] : [motuProvenance(lagoonJson.alias, paths.lagoonDir)]),
      ...(excludedPlugin ? [excludedPlugin] : []),
      motuDevDock(),
      ...(host.plugins ?? []),
    ],
    // These defines are the contract with `motu island verify`, which sets the matching MOTU_* env
    // when it boots this server. Dropping one silently weakens verification — keep them in sync.
    define: {
      __MOTU_TRANSPORT__: JSON.stringify(env.MOTU_TRANSPORT ?? ''),
      __MOTU_TARGET__: JSON.stringify(env.MOTU_TARGET ?? ''),
      __MOTU_FIT__: JSON.stringify(env.MOTU_FIT ?? ''),
      __MOTU_FORCE_ERROR__: JSON.stringify(env.MOTU_FORCE_ERROR ?? ''),
      // The lagoon is the sandbox — the overlay is present by default; MOTU_DEBUG=0 strips it.
      __MOTU_DEBUG__: JSON.stringify(env.MOTU_DEBUG !== '0'),
      __MOTU_ISOLATION__: JSON.stringify(paths.isolation),
      // WHETHER A LEGACY FIT EXISTS TO SWITCH TO. Injected for the same reason isolation is: it is a
      // fact about the PROJECT (its host), and the lagoon config cannot restate it without the two
      // drifting. A React-only host has no legacy skin, so the fit chip there offers a choice with
      // one option — `motu island verify` already says as much ("no legacy fit on host 'next' —
      // nothing to fit to") while the dock went on showing the switch.
      __MOTU_LEGACY_FIT__: JSON.stringify(Boolean(paths.legacyFit)),
      // THE CORPUS, BAKED IN — what the region has actually been in, so the lens can say whether the
      // state on screen is one production reaches.
      //
      // Read from FILES that `motu archipelago coverage --save` wrote, never fetched here. That is what
      // keeps the promise a published lagoon has to keep: the page is reachable by anyone, so it may
      // carry the rows and must not carry the address they came from or the credential that opened
      // it. A build that fetched would put both one env var away from the bundle; a build that reads
      // a sanitised file cannot leak what is not in the file.
      __MOTU_CORPUS__: JSON.stringify(savedCorpora(paths)),
      ...(host.define ?? {}),
    },
    resolve: {
      // One React, always. Two copies break hooks in any island rendering a host component.
      dedupe: ['react', 'react-dom'],
      // THE FRAMEWORK'S OWN ALIASES ARE NOT THE HOST'S TO SUPPLY.
      //
      // These used to come only from the host adapter's contribution, and both adapters that exist
      // start by spreading `noInstallAliases`. Which meant the "no install step" promise held for
      // exactly the two hosts that ship an adapter: with `host: "none"`, the lagoon booted with an
      // empty alias list and died on `@motu/react could not be resolved` — the very error the guard
      // above warns about, from a different cause. A project's lagoon must not depend on motu having
      // written an adapter for its framework.
      // The host's tsconfig `paths` LAST, so anything the host's own vite config or an adapter
      // declared still wins — this is a floor, not an override. See `hostAliasEntries`.
      alias: [...noInstallAliases(paths), ...(host.alias ?? []), ...hostAliasEntries(), ...reactFallbackAliases(paths)],
      // e.g. `tsconfigPaths: true` — often the ONLY thing mapping a Vite app's `@/…` imports.
      ...(host.resolveExtra ?? {}),
    },
    ...(host.css ? { css: host.css } : {}),
    build: {
      ...(singleFile ? { cssCodeSplit: false, assetsInlineLimit: 100_000_000 } : {}),
      ...(chunked ? { cssCodeSplit: false, modulePreload: { polyfill: false } } : {}),
      rollupOptions: {
        input: oneEntry
          ? { [oneEntry]: resolve(root, oneEntry === 'lagoon' ? 'lagoon.html' : 'index.html') }
          : {
              main: resolve(root, 'index.html'),
              lagoon: resolve(root, 'lagoon.html'),
            },
        ...(singleFile ? { output: { inlineDynamicImports: true } } : {}),
        ...(chunked
          ? {
              output: {
                // NO HASH IN A CHUNK'S NAME. Content addressing happens on the host, per file; a hash
                // in the name would also be written into every IMPORTER of that chunk, so one edit
                // would change the bytes of the whole chain above it and re-upload it. Stable names
                // keep an edit in one region inside that region's chunk.
                entryFileNames: 'assets/[name].js',
                chunkFileNames: 'assets/[name].js',
                // Assets import nothing, so hashing their names costs nothing and avoids collisions.
                assetFileNames: 'assets/[name]-[hash][extname]',
                // Mangled export names shift when a chunk gains an export, rewriting every importer.
                minifyInternalExports: false,
                manualChunks: chunkOf(paths),
              },
            }
          : {}),
      },
    },
    server: {
      port: 5173,
      strictPort: false,
      // With a generated root under .motu/cache, everything real — the project's islands, the host
      // application's components, the motu checkout — is OUTSIDE it. Vite's default fs allow-list is
      // inferred from the root, so say explicitly what may be served or the dev server 403s the very
      // modules the lagoon exists to render.
      // THE HOST'S DEPENDENCIES ARE NOT UNDER THE HOST. In a monorepo the app is a package and its
      // node_modules is hoisted to the workspace root, so a stylesheet the app imports (`twenty-ui/
      // style.css`, a @fontsource font file) resolves to a path OUTSIDE every root listed here and
      // Vite refuses to serve it — which surfaces as a lagoon rendering the app's components with
      // none of the app's theme. `searchForWorkspaceRoot` is Vite's own answer to the same question.
      fs: {
        allow: [
          ...new Set([root, paths.root, paths.hostRoot, paths.motuRoot, workspaceRootOf(paths.hostRoot)].filter(Boolean)),
        ],
      },
      // WHO IS ALLOWED TO ASK. Vite 5.4 rejects a request whose Host header it does not recognise —
      // DNS-rebinding protection, and correct for a dev server on a laptop. Behind a tunnel every
      // request arrives with the PUBLIC hostname, so the lagoon answered 403 to the one audience it
      // was exposed for, with nothing in the CLI to say so. `hosts` in lagoon.config.json names the
      // hostnames a project expects; `true` (or `--allow-any-host`) accepts all of them, which is
      // what a throwaway tunnel wants and what a shared machine should not have by default.
      ...(lagoonJson.hosts !== undefined
        ? { allowedHosts: lagoonJson.hosts }
        : env.MOTU_ALLOW_ANY_HOST
          ? { allowedHosts: true }
          : {}),
      // WHAT THE LAGOON WATCHES, because on a large host it runs out of the machine's watches first.
      //
      // Vite watches its root and everything it serves — and the lagoon serves the WHOLE host
      // application, so on a monorepo it registers an inotify watch per source file across every
      // package. Measured on Formbricks: the dev server booted, then died with
      // `ENOSPC: System limit for number of file watchers reached` at the default 65536. It blocked
      // work in three separate bench rounds and an experiment, was read as a machine problem each
      // time, and is why `ENOSPC` had to be taught to the exit-2 classifier.
      //
      // Two mitigations, because the ignore list alone was not enough on a host whose own source tree
      // exceeds the budget:
      //   - ignore what the lagoon never re-renders for;
      //   - `MOTU_WATCH_POLL=1` switches to POLLING, which uses no inotify watches at all. Slower and
      //     hungrier for CPU, and the difference between a lagoon that runs on a big repository and
      //     one that cannot start. A machine where the limit can be raised should raise it instead:
      //     `sudo sysctl -w fs.inotify.max_user_watches=524288`.
      watch: {
        ignored: [
          '**/node_modules/**',
          '**/.git/**',
          '**/dist/**',
          '**/.next/**',
          '**/.turbo/**',
          '**/coverage/**',
          '**/target/**',
          ...(host.server?.watch?.ignored ?? []),
        ],
        ...(env.MOTU_WATCH_POLL === '1' ? { usePolling: true, interval: 400 } : {}),
        ...(host.server?.watch ?? {}),
      },
      ...(host.server ? Object.fromEntries(Object.entries(host.server).filter(([k]) => k !== 'watch')) : {}),
    },
  };
}

/**
 * The corpora `motu archipelago coverage <id> --save` has written, keyed by region.
 *
 * Nothing here is required: a project with no coverage has no directory, and the lens simply has
 * nothing to compare against. Unreadable or malformed files are SKIPPED rather than fatal — a preview
 * that will not boot because a coverage artifact is stale is a worse failure than one that shows less.
 */
function savedCorpora(paths) {
  const dir = resolve(paths.lagoonDir, 'src/coverage');
  if (!existsSync(dir)) return {};
  const out = {};
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    try {
      const corpus = JSON.parse(readFileSync(resolve(dir, name), 'utf8'));
      if (corpus?.regionId && Array.isArray(corpus.entries)) out[corpus.regionId] = corpus;
    } catch {
      // skipped on purpose; see above
    }
  }
  return out;
}

/**
 * THE DOCK, IN THE DEV LOOP.
 *
 * `motu lagoon serve` injects it (`injectDock`) and the motu host injects it around a published
 * artifact — so the dock was present everywhere a lagoon is LOOKED at, and absent from the one place
 * it is WORKED in. The documentation said `lagoon dev` drew it; it never did, which is a claim that
 * survived because nobody checks for a control they are not currently missing.
 *
 * That gap is what makes a view addressable-but-invisible: the region/mountpoints/page control lives
 * in the dock, so a region declaring a `page` had no way to be switched to except by editing the URL.
 *
 * Injected into the dev server's HTML rather than bundled, exactly as the other two do it — change
 * the dock and nothing needs rebuilding.
 */
function motuDevDock() {
  return {
    name: 'motu:dev-dock',
    // THE DEV SERVER ONLY. `transformIndexHtml` also runs in `vite build`, so without this every BUILT
    // artifact carried a dock already — and `lagoon serve` and the host then injected theirs on top.
    // Two docks, both marked hosted, stacked on the same edge: a gallery with two identical "profile"
    // tabs, one of which swallows the other's clicks.
    apply: 'serve',
    // `post` so the app's own transforms have finished. The dock appends to the document and reads
    // the page's published control surface at runtime, so it does not care what else is in there.
    transformIndexHtml: {
      order: 'post',
      handler: (html) => injectDock(html),
    },
  };
}
