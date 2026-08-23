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
import { fileURLToPath } from 'node:url';
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

/**
 * WHERE THE FRAMEWORK IS, derived from the binary that is running.
 *
 * `packages/cli/src/lib` → the checkout root. This is not a guess: the CLI file being executed lives
 * inside the checkout, so the answer is always available, and `lagoon-vite.mjs` has always computed it
 * this way to resolve vite and the build plugins.
 *
 * Which made `motuRoot` in every adopting project's config a bug rather than a configuration: two
 * modules of the same package disagreed about a knowable fact, and the one that asked put a
 * machine-specific path (`"../../motu"`, `"../../../../motu"`) into a committed file — the single line
 * that made a clone fail on someone else's machine.
 *
 * Kept as an override, because it is genuinely needed for a differently-placed checkout or a CI image;
 * it is just no longer required. Verified rather than assumed: if that directory holds no motu
 * checkout, fall back to the previous behaviour instead of resolving every @motu/* to nothing.
 */
const CLI_DIR = dirname(fileURLToPath(import.meta.url));
const OWN_CHECKOUT = resolve(CLI_DIR, '../../../..');
const FRAMEWORK_ROOT = existsSync(resolve(OWN_CHECKOUT, 'packages/core/src/index.ts')) ? OWN_CHECKOUT : null;

/** Hosts that have a legacy skin an island must be proven to survive. */
const LEGACY_FIT_HOSTS = new Set(['angularjs']);

/**
 * WHICH PROJECT AM I? Not "whatever is above my cwd", when the cwd is not the project's.
 *
 * The runtime harness is spawned with `cwd` set to the CLI package — it has to be, or `--import tsx`
 * does not resolve — and this walked up from there, straight into motu's OWN motu.config.json. So
 * `motu island verify <name> --runtime --fast`, run in any project, loaded MOTU'S demo app and
 * verified that instead, failing on a file the user's project has never heard of. `MOTU_PROJECT_ROOT`
 * lets the spawner say which project it means, exactly as `MOTU_ROOT` says where the framework is.
 */
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
  const found = findConfig(process.env.MOTU_PROJECT_ROOT ? resolve(process.env.MOTU_PROJECT_ROOT) : process.cwd());
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
    /**
     * The host's own top-level source directories, when the guess is wrong.
     *
     * This whitelist is the config surface: a key absent from it is silently dropped, whatever the
     * project wrote. `hostSources` was added to removal-check with a comment telling users to set it,
     * and it did nothing at all until it appeared here — the escape hatch for a bug, itself broken in
     * the same way the bug was.
     */
    hostSources: Array.isArray(cfg.hostSources) ? cfg.hostSources : undefined,
    /**
     * WHO THIS PROJECT IS ON A LAGOON HOST, when the git repository is the wrong answer.
     *
     * Publishing normally identifies a project by its git remote, which is right until a repository
     * holds more than one publishable app: motu's own demo-app and the baseline review console both
     * live in `Scorbutics/motu` and would land on the same `repo:slug`, each overwriting the other —
     * and a gallery that takes one lagoon per repo would show whichever published last.
     *
     * Either half can be set; whatever is absent keeps its derived value.
     */
    publishAs: {
      repo: typeof cfg.publishAs?.repo === 'string' ? cfg.publishAs.repo : null,
      slug: typeof cfg.publishAs?.slug === 'string' ? cfg.publishAs.slug : null,
    },
    /** Whether `legacy` fit is a required strategy + a verified runtime mount for this host. */
    legacyFit: cfg.legacyFit ?? LEGACY_FIT_HOSTS.has(cfg.host ?? 'angularjs'),
    hostRoot: resolve(root, cfg.hostRoot ?? cfg.app ?? '.'),
    /**
     * Where the motu framework checkout lives. @motu/* are unpublished packages whose entry point is
     * raw TypeScript, so a project resolves them BY PATH rather than through node_modules — which is
     * what lets a project adopt motu with no install step. Derived from the running CLI by default
     * (see FRAMEWORK_ROOT); `$MOTU_ROOT` then `motuRoot` in motu.config.json override it, in that
     * order, for a differently-placed checkout or a CI image.
     */
    motuRoot: process.env.MOTU_ROOT
      ? resolve(process.env.MOTU_ROOT)
      : cfg.motuRoot
        ? resolve(root, cfg.motuRoot)
        : (FRAMEWORK_ROOT ?? root),
    /** Generated, never-committed build inputs (see `.gitignore`: `.motu/`). */
    cacheDir: resolve(root, '.motu/cache'),
    /** The raw config object, for keys the CLI does not model. */
    raw: cfg,
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
