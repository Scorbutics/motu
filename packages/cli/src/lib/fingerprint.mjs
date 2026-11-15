// WHAT A RUNTIME VERDICT DEPENDS ON — hashed, so an unchanged island or region is not re-driven.
//
// A runtime verdict is a function of the files the lagoon loads to render that target, the framework
// that drives it, the browser it runs in and the flags it was asked with. Nothing else reaches it: the
// lagoon renders against fixtures, with a mock transport, behind declared stubs. So when every one of
// those inputs is byte-identical to the last run that held, re-running it re-proves something already
// proved — on Peps, ~80% of a `check --runtime` after a typical commit.
//
// WHY A GRAPH AND NOT `git diff`. `--changed` maps changed PATHS to islands by directory, so anything
// outside motu's own folders (the app's page, a shared evidence module, a component the island wraps)
// cannot be attributed and widens the run to everything. Here every target's inputs are its actual
// import graph — resolved by esbuild with the lagoon's own aliases, the same answer the browser gets —
// so a change to `lib/utils.ts` invalidates exactly the regions that load it, and nothing else. And it
// is content, not history: it holds across commits, branch switches, stashes and CI.
//
// THE DIRECTION TO BE WRONG IN is "re-run". Anything this cannot see is mixed into every key (the
// framework, the lagoon frame, the configs, the browser, the flags, every MOTU_* variable), a graph
// with an import it cannot follow is not cached at all, and a target that reads the clock or a random
// source is keyed on today's date as well, so it is re-proved at least once a day.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRegions } from './eject.mjs';
import { dockGraphOnDisk } from './docks.mjs';
import { BUILD_DEPS_ROOT, FRAMEWORK_MODE } from './framework.mjs';
import { listIslands } from './islands.mjs';
import { loadMotuConfig } from './config.mjs';
import { HOST_ROOT, REPO_ROOT, blankComments, hostAliasEntries, islandComponentPath, names, paths } from './util.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI_SRC = resolve(HERE, '..');

/** esbuild, from where vite gets it — the CLI already ships it, so this adds no dependency. */
function loadEsbuild() {
  const req = createRequire(resolve(BUILD_DEPS_ROOT, 'package.json'));
  return createRequire(req.resolve('vite'))('esbuild');
}

const sha = () => createHash('sha256');

/** Files are hashed once per process; a graph shares most of them with its neighbours. */
const fileHashes = new Map();
function hashFile(file) {
  let h = fileHashes.get(file);
  if (h) return h;
  try {
    h = sha().update(readFileSync(file)).digest('hex');
  } catch {
    h = '<missing>';
  }
  fileHashes.set(file, h);
  return h;
}

/** Every file under `dir`, sorted — the framework is small enough to hash whole (~200 files). */
function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.name === 'node_modules' || e.name === 'test' || e.name.startsWith('.')) continue;
    const p = resolve(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/**
 * The framework that does the checking. In a checkout every package's source; installed, the CLI's
 * own files plus the version of every `@motujs/*` the project resolves.
 */
function frameworkInputs(h) {
  for (const f of walk(CLI_SRC)) h.update(`fw:${f.slice(CLI_SRC.length)}:${hashFile(f)}\n`);
  if (FRAMEWORK_MODE === 'checkout' && paths.lagoonDir) {
    const root = loadMotuConfig().motuRoot;
    const pkgs = resolve(root ?? '', 'packages');
    if (root && existsSync(pkgs)) {
      for (const p of readdirSync(pkgs).sort()) {
        if (p === 'cli') continue;
        for (const f of walk(resolve(pkgs, p, 'src'))) h.update(`pkg:${p}:${f.slice(pkgs.length)}:${hashFile(f)}\n`);
        h.update(`pkgjson:${p}:${hashFile(resolve(pkgs, p, 'package.json'))}\n`);
      }
    }
  } else {
    const req = createRequire(resolve(REPO_ROOT, 'package.json'));
    for (const name of ['core', 'react', 'runtime', 'chrome', 'types', 'adapter-next', 'adapter-angularjs', 'coverage']) {
      try {
        h.update(`motujs:${name}@${JSON.parse(readFileSync(req.resolve(`@motujs/${name}/package.json`), 'utf8')).version}\n`);
      } catch {
        /* not installed: nothing of it can reach a render */
      }
    }
  }
}

/** The browser, by the playwright that launches it (its version pins the Chromium build). */
function browserInputs(h) {
  try {
    const req = createRequire(resolve(CLI_SRC, '..', 'package.json'));
    h.update(`playwright@${JSON.parse(readFileSync(req.resolve('playwright/package.json'), 'utf8')).version}\n`);
  } catch {
    h.update('playwright@?\n');
  }
  h.update(`node@${process.versions.node.split('.')[0]}\n`);
}

/**
 * The lagoon config, minus what only labels the gallery. `alias` stays even though the graph follows
 * it: a stub swapped for another changes what an island renders before any file it reaches changes.
 */
const PRESENTATIONAL = new Set(['about', 'title', 'stations']);
function configInputs(h) {
  const lagoonJson = resolve(paths.lagoonDir, 'lagoon.config.json');
  if (existsSync(lagoonJson)) {
    try {
      const parsed = JSON.parse(readFileSync(lagoonJson, 'utf8'));
      const kept = Object.fromEntries(Object.entries(parsed).filter(([k]) => !PRESENTATIONAL.has(k)));
      h.update(`lagoon.config:${JSON.stringify(kept)}\n`);
    } catch {
      h.update(`lagoon.config:${hashFile(lagoonJson)}\n`);
    }
  }
  h.update(`motu.config:${hashFile(resolve(REPO_ROOT, 'motu.config.json'))}\n`);
  for (const t of ['tailwind.config.ts', 'tailwind.config.js', 'tailwind.config.mjs', 'tailwind.config.cjs', 'postcss.config.js', 'postcss.config.mjs']) {
    for (const dir of [HOST_ROOT, paths.lagoonDir]) {
      const f = resolve(dir, t);
      if (existsSync(f)) h.update(`style-config:${f}:${hashFile(f)}\n`);
    }
  }
  // The environment the checks read. MOTU_ROOT names WHERE the framework is, which is hashed by
  // content above; the bench variables only describe the shim recording the run.
  for (const k of Object.keys(process.env).sort()) {
    if (!k.startsWith('MOTU_') || k === 'MOTU_ROOT' || k.startsWith('MOTU_BENCH_') || k === 'MOTU_PROJECT_ROOT') continue;
    h.update(`env:${k}=${process.env[k]}\n`);
  }
}

/** The lagoon entry (`src/lagoon.tsx`), when the project has its own. */
function lagoonEntry() {
  for (const f of ['src/lagoon.tsx', 'src/lagoon.ts']) {
    const p = resolve(paths.lagoonDir, f);
    if (existsSync(p)) return p;
  }
  return null;
}

/** A region's own lagoon module — its seed and arrangement. */
function regionModule(id) {
  for (const ext of ['tsx', 'ts']) {
    const p = resolve(paths.lagoonDir, 'src/regions', `${id}.${ext}`);
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Resolve the way the lagoon's vite does: the declared stubs first (`lagoon.config.json` `alias`,
 * exact specifiers), then the host's path mappings. Packages are external and hashed by version; the
 * framework is external and hashed whole. `regions/*` imported FROM the lagoon entry is external too:
 * the entry is the frame every region shares, and its map of regions is not an input to any one of them.
 */
function resolverPlugin({ stubs, frame }) {
  const hostAliases = hostAliasEntries();
  return {
    name: 'motu-fingerprint',
    setup(build) {
      build.onResolve({ filter: /.*/ }, async (args) => {
        if (args.pluginData?.skip) return undefined;
        const spec = args.path;
        if (stubs.has(spec)) {
          const target = stubs.get(spec);
          const r = await build.resolve('./' + target.split(sep).pop(), { resolveDir: dirname(target), kind: args.kind, pluginData: { skip: true } });
          return r.errors.length ? { path: target } : r;
        }
        if (frame && args.importer === frame && /^\.\/regions\//.test(spec)) return { path: spec, external: true };
        if (/^@motujs\//.test(spec) || /^@motu\//.test(spec)) return { path: spec, external: true, namespace: 'framework' };
        for (const a of hostAliases) {
          if (spec.startsWith(a.find)) {
            const r = await build.resolve('./' + spec.slice(a.find.length), {
              resolveDir: a.replacement,
              kind: args.kind,
              pluginData: { skip: true },
            });
            if (!r.errors.length) return r;
          }
        }
        if (spec === paths.appPackage || spec.startsWith(`${paths.appPackage}/`)) {
          // The project's own island barrel re-exports every island. A value import of it reaches all
          // of them, which is the honest answer — let esbuild follow it.
          const r = await build.resolve(paths.barrel, { resolveDir: REPO_ROOT, kind: args.kind, pluginData: { skip: true } });
          if (!r.errors.length) return r;
        }
        if (!spec.startsWith('.') && !spec.startsWith('/') && !/^[A-Za-z]:/.test(spec)) {
          return { path: spec, external: true, namespace: 'package' };
        }
        return undefined;
      });
    },
  };
}

const ASSET_LOADERS = Object.fromEntries(
  ['.css', '.scss', '.sass', '.less', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.woff', '.woff2', '.ttf', '.eot', '.ico', '.json', '.md', '.txt']
    .map((e) => [e, e === '.json' ? 'json' : 'empty']),
);

/** The package a bare specifier names (`@scope/pkg/sub` → `@scope/pkg`). */
const packageOf = (spec) => (spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]);

/** A package's installed version, resolved from the host — what the lockfile actually put there. */
const pkgVersions = new Map();
function packageVersion(name) {
  if (pkgVersions.has(name)) return pkgVersions.get(name);
  let v = '?';
  for (const from of [HOST_ROOT, REPO_ROOT, paths.lagoonDir]) {
    try {
      const req = createRequire(resolve(from, 'package.json'));
      let dir = dirname(req.resolve(name));
      for (let i = 0; i < 8; i++) {
        const pj = resolve(dir, 'package.json');
        if (existsSync(pj)) {
          const j = JSON.parse(readFileSync(pj, 'utf8'));
          if (j.name === name) {
            v = j.version ?? '?';
            break;
          }
        }
        dir = dirname(dir);
      }
      if (v !== '?') break;
    } catch {
      /* try the next root */
    }
  }
  pkgVersions.set(name, v);
  return v;
}

/** Reads the clock or a random source somewhere a render reaches — so tomorrow's render may differ. */
const VOLATILE = /\bDate\.now\s*\(|\bnew\s+Date\s*\(\s*\)|\bMath\.random\s*\(|\bperformance\.now\s*\(/;
/** An import esbuild leaves unfollowed: a glob, or a dynamic import of a computed specifier. */
const UNFOLLOWED = /import\.meta\.glob\s*\(|\bimport\s*\(\s*[^'"`\s)]/;

/**
 * One esbuild pass over every entry, read back per entry point.
 *
 * Returns, per entry, its project files, the packages it imports, and whether it is volatile or has
 * an import nothing could follow.
 */
async function graphs(entries, { stubs, frame }) {
  const esbuild = loadEsbuild();
  const list = [...new Set(entries)].filter((e) => e && existsSync(e));
  if (!list.length) return new Map();
  const result = await esbuild.build({
    entryPoints: list,
    bundle: true,
    write: false,
    metafile: true,
    outdir: resolve(paths.lagoonDir ?? REPO_ROOT, '.motu-fingerprint-out'),
    outbase: REPO_ROOT,
    logLevel: 'silent',
    platform: 'browser',
    format: 'esm',
    jsx: 'automatic',
    absWorkingDir: REPO_ROOT,
    plugins: [resolverPlugin({ stubs, frame })],
    loader: { ...ASSET_LOADERS, '.js': 'jsx' },
    // Never fail the whole pass on one bad import: a target whose graph has an error is uncacheable,
    // which `errors` below reports per entry.
  }).catch((err) => ({ errors: err.errors ?? [{ text: String(err) }], metafile: null }));
  const out = new Map();
  if (!result.metafile) {
    for (const e of list) out.set(e, { error: result.errors?.[0]?.text ?? 'esbuild failed', files: [], packages: [] });
    return out;
  }
  const inputsMeta = result.metafile.inputs;
  // Per FILE, once: the packages it imports and what its source says. A file sits in many graphs.
  const perFile = new Map();
  const analyse = (rel) => {
    let a = perFile.get(rel);
    if (a) return a;
    a = { packages: [], volatile: false, unfollowed: null, project: false };
    for (const imp of inputsMeta[rel]?.imports ?? []) {
      if (imp.external && !imp.path.startsWith('.') && !imp.path.startsWith('@motujs/') && !imp.path.startsWith('@motu/')) {
        a.packages.push(packageOf(imp.path));
      }
    }
    const abs = resolve(REPO_ROOT, rel);
    a.abs = abs;
    a.project = !abs.includes(`${sep}node_modules${sep}`);
    if (a.project && /\.[cm]?[jt]sx?$/.test(abs)) {
      try {
        const src = blankComments(readFileSync(abs, 'utf8'));
        a.volatile = VOLATILE.test(src);
        // The generated island registry is the one known glob, and it is not an input to one island.
        if (UNFOLLOWED.test(src) && abs !== paths.islandsRegistry) a.unfollowed = paths.rel(abs);
      } catch {
        /* unreadable: its hash says <missing> */
      }
    }
    perFile.set(rel, a);
    return a;
  };
  for (const o of Object.values(result.metafile.outputs)) {
    if (!o.entryPoint) continue;
    const entry = resolve(REPO_ROOT, o.entryPoint);
    const files = [];
    const packages = new Set();
    let volatile = false;
    let unfollowed = null;
    for (const rel of Object.keys(o.inputs)) {
      const a = analyse(rel);
      if (a.project) files.push(a.abs);
      for (const p of a.packages) packages.add(p);
      if (a.volatile) volatile = true;
      if (a.unfollowed && !unfollowed) unfollowed = a.unfollowed;
    }
    out.set(entry, { files, packages: [...packages].sort(), volatile, unfollowed });
  }
  for (const e of list) if (!out.has(e)) out.set(e, { error: 'no output for this entry', files: [], packages: [] });
  return out;
}

let cached = null;
let lastEvidenceFp = new Map();

/**
 * An evidence file's fingerprint, IF this process has computed the project's (synchronous, so the
 * sync scenario reader can ask). Null means "unknown" — read it the slow way.
 */
export function evidenceFingerprint(file) {
  return lastEvidenceFp.get(file) ?? null;
}

/**
 * Every island's and region's fingerprint for this run, in one pass.
 *
 * `{ island(kebab), region(id), global, ms }` — each target returns `{ fp, volatile, uncacheable }`,
 * where `uncacheable` names why no verdict may be reused (and `fp` is null).
 */
export async function projectFingerprints({ mode }) {
  if (cached?.mode === mode) return cached;
  const started = Date.now();
  const lagoonJsonFile = resolve(paths.lagoonDir, 'lagoon.config.json');
  let alias = {};
  try {
    alias = JSON.parse(readFileSync(lagoonJsonFile, 'utf8')).alias ?? {};
  } catch {
    /* no lagoon config — no stubs */
  }
  const stubs = new Map(Object.entries(alias).map(([k, v]) => [k, resolve(paths.lagoonDir, v)]));
  const frame = lagoonEntry();

  // THE GLOBAL HALF — mixed into every key.
  const g = sha();
  g.update(`mode:${mode}\n`);
  frameworkInputs(g);
  browserInputs(g);
  configInputs(g);

  const islands = listIslands(paths.islandsDir).map((i) => i.kebab);
  const regions = readRegions(paths.archipelagosDir);
  const islandEntries = new Map(
    islands.map((k) => {
      let component = null;
      try {
        component = islandComponentPath(k, names(k).pascal);
      } catch {
        /* the element follows it anyway */
      }
      return [k, [paths.elementFile(k), paths.fixturesFile(k), component].filter((f) => f && existsSync(f))];
    }),
  );
  const regionEntries = new Map(
    regions.map((r) => [r.id, [paths.archipelagoFile(r.id), paths.archipelagoEvidence(r.id), regionModule(r.id)].filter((f) => f && existsSync(f))]),
  );
  const all = [...(frame ? [frame] : []), ...[...islandEntries.values()].flat(), ...[...regionEntries.values()].flat()];
  const byEntry = await graphs(all, { stubs, frame });

  // The frame: what every region renders inside. Its own graph is global.
  if (frame) {
    const fg = byEntry.get(frame);
    if (fg?.error) g.update(`frame-error:${fg.error}\n`);
    for (const f of fg?.files ?? []) g.update(`frame:${paths.rel(f)}:${hashFile(f)}\n`);
    for (const p of fg?.packages ?? []) g.update(`frame-pkg:${p}@${packageVersion(p)}\n`);
  }
  const globalFp = g.digest('hex');

  // AN EVIDENCE FILE'S OWN KEY, mode-free: what reading its scenarios depends on is the file's graph
  // and the harness that reads it — not the browser, the flags or the lagoon frame.
  const fw = sha();
  frameworkInputs(fw);
  const fwFp = fw.digest('hex');
  const evidenceFp = new Map();
  for (const file of [...[...islandEntries.keys()].map((k) => paths.fixturesFile(k)), ...regions.map((r) => paths.archipelagoEvidence(r.id))]) {
    const gr = byEntry.get(file);
    if (!gr || gr.error || gr.unfollowed || gr.volatile) continue;
    const h = sha().update(`evidence:${paths.rel(file)}\n${fwFp}\n`);
    for (const f of [...gr.files].sort()) h.update(`${paths.rel(f)}:${hashFile(f)}\n`);
    for (const p of gr.packages) h.update(`pkg:${p}@${packageVersion(p)}\n`);
    evidenceFp.set(file, h.digest('hex').slice(0, 24));
  }

  /** Union the graphs of `entries` into one hash with the global half. */
  const combine = (kind, id, entries) => {
    const files = new Set();
    const packages = new Set(['react', 'react-dom']);
    let volatile = false;
    let uncacheable = null;
    for (const e of entries) {
      const gr = byEntry.get(e);
      if (!gr || gr.error) {
        uncacheable = `its import graph could not be resolved (${paths.rel(e)}: ${gr?.error ?? 'missing'})`;
        continue;
      }
      if (gr.unfollowed) uncacheable = `${gr.unfollowed} imports something no static reader can follow`;
      if (gr.volatile) volatile = true;
      for (const f of gr.files) files.add(f);
      for (const p of gr.packages) packages.add(p);
    }
    if (!entries.length) uncacheable = 'no source file to fingerprint';
    if (uncacheable) return { fp: null, volatile, uncacheable, files: files.size };
    const h = sha().update(`${kind}:${id}\n${globalFp}\n`);
    for (const f of [...files].sort()) h.update(`${paths.rel(f)}:${hashFile(f)}\n`);
    for (const p of [...packages].sort()) h.update(`pkg:${p}@${packageVersion(p)}\n`);
    // Keyed on the day too: whatever reads the clock may render differently tomorrow.
    if (volatile) h.update(`day:${new Date().toISOString().slice(0, 10)}\n`);
    return { fp: h.digest('hex').slice(0, 24), volatile, uncacheable: null, files: files.size };
  };

  const islandFp = new Map(islands.map((k) => [k, combine('island', k, islandEntries.get(k) ?? [])]));
  const tagToKebab = (tag) => islands.find((k) => names(k).tag === tag);
  let dockGraph = {};
  try {
    dockGraph = dockGraphOnDisk(paths.archipelagosDir).graph;
  } catch {
    /* no dock graph: nothing composed */
  }
  const regionFp = new Map();
  for (const r of regions) {
    // A region renders its islands, so their graphs are its inputs; and a region composed with a dock
    // renders the other side of that dock as well.
    const entries = [...(regionEntries.get(r.id) ?? [])];
    for (const i of r.islands ?? []) {
      const k = tagToKebab(i.element);
      if (k) entries.push(...(islandEntries.get(k) ?? []));
    }
    // Both directions: the regions this one docks into, and the ones that dock into it.
    const docked = [
      ...new Set([
        ...(dockGraph[r.id]?.claims ?? []).map((c) => c.region),
        ...Object.entries(dockGraph)
          .filter(([, n]) => (n.claims ?? []).some((c) => c.region === r.id))
          .map(([other]) => other),
      ].filter((x) => x && x !== r.id)),
    ];
    for (const other of docked) {
      entries.push(...(regionEntries.get(other) ?? []));
      const o = regions.find((x) => x.id === other);
      for (const i of o?.islands ?? []) {
        const k = tagToKebab(i.element);
        if (k) entries.push(...(islandEntries.get(k) ?? []));
      }
    }
    regionFp.set(r.id, combine('region', r.id, [...new Set(entries)]));
  }

  lastEvidenceFp = evidenceFp;
  cached = {
    mode,
    global: globalFp.slice(0, 12),
    ms: Date.now() - started,
    island: (k) => islandFp.get(k) ?? { fp: null, uncacheable: 'not a known island' },
    region: (id) => regionFp.get(id) ?? { fp: null, uncacheable: 'not a known region' },
  };
  return cached;
}

/** For tests: forget this process's fingerprints and file hashes. */
export function resetFingerprints() {
  cached = null;
  lastEvidenceFp = new Map();
  fileHashes.clear();
  pkgVersions.clear();
}
