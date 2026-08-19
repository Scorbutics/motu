// motu project configuration. The CLI is layout-agnostic: WHERE each piece lands (islands, ui,
// archipelagos, contract, lagoon, bridge, the backend manifest) is declared here, not hardcoded, so
// motu adapts to any codebase filesystem. WHAT lives inside those roots stays motu's convention
// (islands/<kebab>/{element.ts,fixtures.mock.ts,index.ts} + ui/<kebab>/<Pascal>.tsx) — that's what
// keeps `motu island verify`/`create` deterministic.
//
// Config is discovered by walking UP from the cwd for the first `motu.config.json` (or a `motu` key
// in a package.json); that file's directory is the PROJECT ROOT. All paths default to the reference
// layout, so a project matching it needs no config at all.
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';

// Paths are relative to the APP root (root/<app>), except `manifest` which is relative to the project
// root (the backend build output often sits outside the frontend app).
const DEFAULTS = {
  app: '.',
  islands: 'src/islands',
  ui: 'src/ui',
  archipelagos: 'src/archipelagos',
  shared: 'src/shared',
  barrel: 'src/index.ts',
  contract: 'contract/src',
  lagoon: 'roots/lagoon',
  bridge: 'roots/bridge',
  manifest: 'target/motu-manifest.json',
  tagPrefix: 'x-',
  isolation: 'shadow',
  // The stack the islands are embedded INTO. It selects the adapter, and decides whether the
  // "legacy fit" gate applies: fitting an island to a legacy skin is only meaningful when there IS
  // a legacy skin. 'angularjs' = the reference ocean; 'next'/'none' = a modern React host, where an
  // island is mounted directly and there is nothing to fit to.
  host: 'angularjs',
  // Root of the HOST application (relative to the project root) — where a 'next' lagoon resolves the
  // host's own path aliases, Tailwind config and component library from. Defaults to the app root.
  hostRoot: '.',
};

/** Hosts that have a legacy skin an island must be proven to survive. */
const LEGACY_FIT_HOSTS = new Set(['angularjs']);

function findConfig(startDir) {
  let dir = startDir;
  for (;;) {
    const jsonPath = resolve(dir, 'motu.config.json');
    if (existsSync(jsonPath)) {
      try {
        return { dir, config: JSON.parse(readFileSync(jsonPath, 'utf8')) };
      } catch (e) {
        throw new Error(`motu: invalid ${jsonPath}: ${e.message}`);
      }
    }
    const pkgPath = resolve(dir, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
        if (pkg && pkg.motu) return { dir, config: pkg.motu };
      } catch {
        /* unreadable package.json — keep walking up */
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

let cached;

/** Resolve the motu project config (cached). All returned paths are absolute. */
export function loadMotuConfig() {
  if (cached) return cached;
  const found = findConfig(process.cwd());
  const root = found ? found.dir : process.cwd();
  const cfg = { ...DEFAULTS, ...(found?.config ?? {}) };
  const appRoot = resolve(root, cfg.app);
  const inApp = (p) => resolve(appRoot, p);
  cached = {
    root,
    appRoot,
    /** The npm package name whose barrel exports ELEMENT_REGISTRY (defaults to the app dir name). */
    appPackage: cfg.appPackage ?? basename(appRoot),
    tagPrefix: cfg.tagPrefix,
    isolation: cfg.isolation === 'light' ? 'light' : 'shadow',
    host: cfg.host ?? 'angularjs',
    /** Whether `legacy` fit is a required strategy + a verified runtime mount for this host. */
    legacyFit: cfg.legacyFit ?? LEGACY_FIT_HOSTS.has(cfg.host ?? 'angularjs'),
    hostRoot: resolve(root, cfg.hostRoot ?? cfg.app ?? '.'),
    islandsDir: inApp(cfg.islands),
    uiDir: inApp(cfg.ui),
    archipelagosDir: inApp(cfg.archipelagos),
    sharedDir: inApp(cfg.shared),
    barrel: inApp(cfg.barrel),
    contractSrcDir: inApp(cfg.contract),
    lagoonDir: inApp(cfg.lagoon),
    bridgeDir: inApp(cfg.bridge),
    manifest: resolve(root, cfg.manifest),
    configPath: found ? resolve(found.dir, 'motu.config.json') : null,
  };
  return cached;
}
