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
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveLagoonRoot } from './lagoon-materialize.mjs';

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

/**
 * Vite's own API (named exports: `build`, `createServer`, `preview`).
 *
 * Separate from `resolveBuildDep` below, which unwraps a default export for plugins — Vite has none,
 * it is a namespace.
 */
export async function resolveVite(paths) {
  const roots = [FRAMEWORK_ROOT, paths.lagoonDir];
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
    { find: /^@motu\/core$/, replacement: motu('packages/core/src/index.ts') },
    { find: /^@motu\/react$/, replacement: motu('packages/react/src/index.ts') },
    { find: /^@motu\/react\/define$/, replacement: motu('packages/react/src/defineReactElement.ts') },
    { find: /^@motu\/runtime\/mock$/, replacement: motu('packages/runtime/src/mock.ts') },
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

  const ctx = { paths, lagoonJson, env, resolveBuildDep: (n) => resolveBuildDep(n, paths.lagoonDir) };
  const host = await hostContribution(ctx);

  return {
    root,
    // The whole point: no vite.config.ts on disk in the project.
    configFile: false,
    // The host's React transform wins when it has one: two JSX transforms in one pipeline is a
    // duplicated runtime, and it surfaces as hooks failing with nothing to point at.
    plugins: [...(host.ownsReactTransform ? [] : [react()]), ...(host.plugins ?? [])],
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
      alias: [...noInstallAliases(paths), ...(host.alias ?? [])],
      // e.g. `tsconfigPaths: true` — often the ONLY thing mapping a Vite app's `@/…` imports.
      ...(host.resolveExtra ?? {}),
    },
    ...(host.css ? { css: host.css } : {}),
    build: {
      ...(singleFile ? { cssCodeSplit: false, assetsInlineLimit: 100_000_000 } : {}),
      rollupOptions: {
        input: singleFile
          ? { [singleFile]: resolve(root, singleFile === 'lagoon' ? 'lagoon.html' : 'index.html') }
          : {
              main: resolve(root, 'index.html'),
              lagoon: resolve(root, 'lagoon.html'),
            },
        ...(singleFile ? { output: { inlineDynamicImports: true } } : {}),
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
      ...(host.server ?? {}),
    },
  };
}
