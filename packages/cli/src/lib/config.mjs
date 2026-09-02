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

// THE LAYOUT KEYS. Every one is relative to the APP root (root/<app>) except `manifest`, which is
// relative to the PROJECT root — see its comment; that asymmetry is load-bearing and is the single
// most common thing to get wrong here.
//
// Each key below says what READS it and what BREAKS when it points somewhere wrong, because "where
// the islands live" is obvious and "which command silently finds nothing" is not. A path key that is
// merely wrong rarely errors: the directory walk returns an empty list and the check that depended on
// it reports a pass over nothing, which is the failure mode `report.ok(check, msg, seen)` and the
// `seen: 0` -> skip rule exist to catch.
const DEFAULTS = {
  // The frontend app root, relative to the project root. EVERY path below resolves through it
  // (`inApp`), so this is the one key that moves all the others at once. Point it at a directory that
  // is not the app and every subsequent walk finds nothing — no error, just empty results everywhere.
  app: '.',
  // Island mount points, plus the two generated files beside them (`registry.ts`,
  // `contracts.generated.ts`). Read by `island create/sync/verify/snapshot`, by `check`, by
  // `--changed`'s file->island attribution (`lib/changed.mjs:87`), and by the lagoon's fixture glob
  // (`lib/lagoon-materialize.mjs:72`). Wrong, and `island verify --all` verifies zero islands
  // successfully.
  islands: 'src/islands',
  // The components the islands mount — `ui/<kebab>/<Pascal>.tsx`. Kept OUTSIDE `islands/` on purpose:
  // mount points must not be able to import each other, and a directory boundary is what enforces it
  // (`util.mjs:29-31`). Read by `island create`, by `island verify`'s component resolution
  // (`verify.mjs:1191`), and by `integrate check`'s "what does motu own" set (`integration.mjs:51`).
  ui: 'src/ui',
  // Regions: `<id>.archipelago.ts`, `<id>.evidence.ts`, `registry.ts`, `coverage.generated.ts`. Read
  // by every `archipelago` verb, by `integrate check` (`integration.mjs:845`) and by `--changed`'s
  // file->region attribution (`changed.mjs:100`). Wrong, and a project reports zero regions rather
  // than failing to find them.
  archipelagos: 'src/archipelagos',
  // Holds exactly one file motu cares about: `<shared>/styles.css`, the single island stylesheet the
  // lagoon aliases as `<appPackage>/styles.css` (`lagoon-vite.mjs:212`). Wrong, and the lagoon builds
  // fine and renders every island unstyled.
  shared: 'src/shared',
  // The module that exports ELEMENT_REGISTRY. It is the app's PUBLIC entry: the runtime harness
  // imports it by path (`runtime-harness.mjs:88`), the lagoon aliases the bare package specifier onto
  // it (`lagoon-vite.mjs:213`), and `archipelago create` edits it to add re-exports
  // (`archipelago.mjs:97`). Wrong, and every `--runtime` check fails to import the registry at all.
  barrel: 'src/index.ts',
  // Output directory of `motu codegen` — where the generated `@motu/contract` package is written, and
  // whose `index.ts` is the contract entry the lagoon aliases (`util.mjs:78`). Read only by
  // `codegen.mjs:10`, as the default when no out-dir argument is given.
  contract: 'contract/src',
  // The lagoon root: its entries and `lagoon.config.json` (viewports, a11y policy, chrome, mount).
  // Read by every `lagoon` verb, by every `--runtime` check, and by the materializer, which decides
  // whether the PROJECT owns its lagoon by looking for `index.html` here
  // (`lagoon-materialize.mjs:47`). Wrong, and motu materializes a second lagoon beside the real one.
  lagoon: 'roots/lagoon',
  // The ocean composition root — `bridge.js`, the embedded IIFE injected into legacy pages.
  //
  // DECLARED, NOT DRIVEN. `motu init` writes it for `angularjs` hosts only (`init.mjs:180`), and it is
  // resolved to `paths.bridgeDir` — but NO CLI command reads that path. The bridge is built by the
  // project's own vite (`pnpm --filter @demo-app/bridge build`), because it is an application
  // artifact with an application's dependencies, not something motu generates. The key exists so the
  // layout is declared in one place rather than assumed by whoever writes the build script.
  //
  // So: changing it moves nothing on its own. Move the directory and update your build script too.
  bridge: 'roots/bridge',
  // THE ONE PATH RELATIVE TO THE PROJECT ROOT, not the app root. The backend build emits it — for the
  // reference ocean, a Maven build in a sibling tree — so it routinely sits outside the frontend app
  // and could not resolve through `inApp` (`config.mjs`'s `manifest:` line uses `resolve(root, …)`).
  // Read only by `codegen.mjs:9`, as the default input when no manifest argument is given.
  manifest: 'target/motu-manifest.json',
  // Prefix of every custom element tag: `names(x).tag = tagPrefix + kebab` (`util.mjs:359`). It exists
  // because a custom element name MUST contain a hyphen, and because a host page needs a namespace it
  // can reserve. Read by `island create` and `verify`, by the lagoon materializer
  // (`lagoon-materialize.mjs:68`), and by the tag->island reverse lookup (`verify.mjs:2899`).
  //
  // CHANGING IT ON A LIVE PROJECT RENAMES EVERY TAG. The registry is regenerated with new tags while
  // the host's own markup still says the old ones, so every island silently fails to upgrade — a
  // custom element that is not defined renders as an empty unknown element, with no error.
  tagPrefix: 'x-',
  // Shadow or light, project-wide. Baked into the generated registry as `setDefaultIsolation(...)`
  // (`islands.mjs:78-92`); an `isolation` attribute on <motu-archipelago> still wins per region
  // (`archipelago-element.ts:100-103`).
  //
  // 'shadow' gives a region one shadow root and one adopted stylesheet — right for an ocean, whose
  // global CSS would otherwise bleed into the islands. 'light' uses no shadow and injects styles
  // globally — right for a React host, where the app's stylesheet IS the point and a shadow root
  // would cut islands off from it, Tailwind included. `motu init` therefore defaults it to 'light'
  // for every host but 'angularjs' (`init.mjs:164`).
  //
  // What breaks: 'shadow' on a Tailwind host renders every island unstyled, in the lagoon and in the
  // page, with NO check failing. That is also why `renderRegistry` throws rather than defaulting on an
  // unrecognised value (`islands.mjs:54-58`) — a silent default is exactly how this key's own `paths`
  // dead-end bug shipped.
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
 * SO THE CONFIG KEY IS GONE. It was kept for a while as an override for "a differently-placed checkout
 * or a CI image", but `$MOTU_ROOT` already answers both and answers them better: the one property the
 * config key had that the environment variable does not is that it gets COMMITTED, which is precisely
 * the bug. A key whose only distinguishing feature is the failure mode is not an escape hatch.
 *
 * Verified rather than assumed: if the derived directory holds no motu checkout, FRAMEWORK_ROOT is
 * null and we fall back to the project root instead of resolving every @motu/* to nothing.
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
    /**
     * The npm package name whose barrel exports ELEMENT_REGISTRY. Defaults to the app directory name.
     *
     * It is a NAME, not a path: it is the specifier generated code imports from. The lagoon aliases
     * it onto `paths.barrel` (`lagoon-vite.mjs:193`), the materialized entries import from it
     * (`lagoon-materialize.mjs:67`), and `archipelago init` writes it into the composition root it
     * scaffolds (`archipelago-init.mjs:187`). So it has to match the `name` in the app's own
     * package.json, and `basename(appRoot)` is right only when the directory and the package agree.
     *
     * WHAT BREAKS, and it has: this is the key whose silent `undefined` generated an import of a
     * package that does not exist. `loadMotuConfig` resolved it and `paths` did not carry it, so
     * `archipelago init` read `paths.appPackage ?? 'motu-islands'` and got the fallback — a file that
     * imports from a package nobody installed, failing at the app's build rather than at motu's. It
     * is on `paths` now; the shape of the bug is the allowlist dead end described
     * at the top of this file (`util.mjs:58-67`).
     *
     * Set it explicitly whenever the directory name is not the package name — a project whose motu
     * lives in `motu/` but publishes its islands as `motu-islands` must say so.
     */
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
     * HOW HARD `root` IS PUSHED — 'encouraged' (the default) or 'required'.
     *
     * A region composes either from its archipelago's `root`, which is safe by construction, or from
     * a hand-written lagoon frame, which is a second description of the page and is only as safe as
     * the checks comparing it. Both work. The difference is a real refactor of the host's pages, and
     * a tool that fails a project on its first day for not having done it is a tool nobody adopts.
     *
     * So the default SAYS SO and passes; a project that has finished migrating sets 'required' and
     * the frame becomes an error, which is what stops the old shape creeping back in.
     */
    regionRoot: cfg.regionRoot === 'required' ? 'required' : 'encouraged',
    /**
     * WHICH STATES A REGION ACTUALLY REACHES — the coverage fold, and the one part of motu designed
     * to run in production.
     *
     * DEPLOYMENT FACTS ONLY. Whether a key is a closed set is a fact about the key and is declared on
     * the archipelago beside it (`coverage.enums`), where it travels with the region. What lives here
     * is whether the fold runs at all, where a corpus is posted, and which regions are watched.
     *
     * Baked into the generated island registry by `motu island sync`, so no application file mentions
     * coverage and no host's bundler has to define a constant. `enabled` defaults to FALSE: a thing
     * that runs in production is a thing somebody switched on.
     */
    coverage: {
      enabled: cfg.coverage?.enabled === true,
      // NO ADDRESSES HERE. They would be baked into the generated island registry, which the lagoon
      // imports and publishes as a public page. The application renders them as meta tags; see
      // `metaContent` in @motu/coverage. `corpusUrl` is different — it is read by the CLI on a
      // developer's machine and never reaches a browser.
      corpusUrl: typeof cfg.coverage?.corpusUrl === 'string' ? cfg.coverage.corpusUrl : null,
      regions: Array.isArray(cfg.coverage?.regions) ? cfg.coverage.regions : null,
      /** Where the current known set is served from, so it is not frozen at build time. */
    },
    /**
     * Does this project CLAIM motu is removable?
     *
     * `removal-check` asks one question — delete motu, does the application still compile? — and it
     * is the right question for a host that ADOPTED motu: the promise is that islands leave no
     * runtime trace. It is not a question motu's own tools can answer. The baseline review console
     * composes regions with `createRegion` and paints from `@motu/chrome/react`; motu is meant to be
     * load-bearing there, and it will never compile without it.
     *
     * Reported as a SKIP rather than a pass, because a project opting out has not proved anything —
     * and reported at all, because an opt-out nobody can see is how a check quietly stops running.
     * Default true: a host must say so deliberately, and the answer for an adopting app stays FAIL.
     */
    removable: cfg.removable !== false,
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
    /**
     * Whether `legacy` fit is a required strategy AND a second verified runtime mount for this host.
     *
     * Derived from `host` — true only for the ocean — and overridable for a host with a legacy skin
     * motu does not know about. Three things read it: `island create` scaffolds `legacy: 'fill'` into
     * a new island (`create.mjs:50`), `island verify` requires the strategy to be declared
     * (`verify.mjs:393`), and the runtime lane drives BOTH fits instead of one
     * (`verify.mjs:1236`, `:2433`). It also reaches the browser as `__MOTU_LEGACY_FIT__`
     * (`lagoon-vite.mjs:285`), so the lagoon can offer the fit chip.
     *
     * WHAT BREAKS, in both directions. Turned ON for a modern host, every island is asked to declare a
     * fit to a skin that does not exist and the runtime lane pays a second browser mount per scenario
     * for nothing — roughly double the cost of the most expensive tier. Turned OFF for an ocean, the
     * `legacy` mount is never driven, so an island that renders correctly standalone and collapses
     * inside the legacy page's CSS passes green: the check that exists precisely to catch that is the
     * one you switched off.
     */
    legacyFit: cfg.legacyFit ?? LEGACY_FIT_HOSTS.has(cfg.host ?? 'angularjs'),
    hostRoot: resolve(root, cfg.hostRoot ?? cfg.app ?? '.'),
    /**
     * Where the motu framework checkout lives. @motu/* are unpublished packages whose entry point is
     * raw TypeScript, so a project resolves them BY PATH rather than through node_modules — which is
     * what lets a project adopt motu with no install step. DERIVED from the running CLI (see
     * FRAMEWORK_ROOT); `$MOTU_ROOT` overrides it for a differently-placed checkout or a CI image.
     *
     * There is no config key. See the FRAMEWORK_ROOT comment for why the environment is the only
     * override: this value must not be committed.
     */
    motuRoot: process.env.MOTU_ROOT ? resolve(process.env.MOTU_ROOT) : (FRAMEWORK_ROOT ?? root),
    /** Generated, never-committed build inputs (see `.gitignore`: `.motu/`). */
    cacheDir: resolve(root, '.motu/cache'),
    /**
     * The parsed config verbatim, defaults merged in — an escape hatch for keys the CLI does not
     * model.
     *
     * NOTHING IN packages/cli READS IT, and that is the honest state rather than an oversight to fix.
     * It was added as the documented way around the allowlist this file opens with, and every time a
     * key has actually been needed the right answer was to add it to the allowlist properly — where
     * it gets a type, a default, a comment, and a place on `paths`. A command reading `raw` would be
     * re-creating the untyped, undefaulted, uncommented surface the allowlist exists to prevent.
     *
     * Kept because it costs one line and it is the correct seam for a genuinely project-specific key
     * — one motu should not model. If you reach for it, ask first whether the key deserves modelling.
     */
    raw: cfg,
    // The layout, resolved to absolute paths once. What each one drives, and what breaks when it is
    // wrong, is documented on the corresponding key in DEFAULTS at the top of this file.
    islandsDir: inApp(cfg.islands),
    uiDir: inApp(cfg.ui),
    archipelagosDir: inApp(cfg.archipelagos),
    sharedDir: inApp(cfg.shared),
    /**
     * The app barrel — DERIVED from where the islands actually live, unless stated.
     *
     * `barrel` defaulted to a literal `src/index.ts` no matter where the project's motu directories
     * were, so a layout that is not `src/`-shaped pointed it at a file that does not exist. Measured
     * on a Rails application whose JS root is `app/javascript`: the adopter moved motu's directories
     * to match, and `archipelago create` died with a raw ts-morph `File not found: …/src/index.ts` —
     * an exception from a library the adopter has no reason to have heard of, naming a path they had
     * deliberately not used. `barrel` was configurable all along and mentioned in no output.
     *
     * The islands directory already says where motu lives, so its parent is the answer. An explicit
     * `barrel` still wins.
     */
    barrel: found?.config?.barrel ? inApp(cfg.barrel) : resolve(dirname(inApp(cfg.islands)), 'index.ts'),
    contractSrcDir: inApp(cfg.contract),
    lagoonDir: inApp(cfg.lagoon),
    /** Declared for the layout's sake; no CLI command reads it. See `bridge` in DEFAULTS. */
    bridgeDir: inApp(cfg.bridge),
    /** PROJECT root, not app root — the backend build output sits outside the frontend app. */
    manifest: resolve(root, cfg.manifest),
    configPath: found ? resolve(found.dir, 'motu.config.json') : null,
  };

  // A REMOVED KEY MUST NOT BE A SILENT ONE.
  //
  // Dropping `motuRoot` quietly would be the exact failure this file's own allowlist comment is about:
  // a project keeps a line that used to mean something, nothing reads it, and the CLI resolves
  // somewhere else without saying so. `motuRoot` in particular used to point @motu/* at a checkout, so
  // a project whose line was doing real work needs to hear that the environment now carries it.
  if (cfg.motuRoot !== undefined && !process.env.MOTU_MUTE_DEPRECATED) {
    const where = cached.configPath ?? 'motu.config.json';
    process.emitWarning(
      `motu: \`motuRoot\` was removed and is being ignored (${where}).\n` +
        `  The framework checkout is derived from the running CLI: ${cached.motuRoot}\n` +
        `  Delete the line. If that path is wrong, export MOTU_ROOT=<checkout> instead — it is the\n` +
        `  same override without committing a machine-specific path.`,
      'MotuDeprecationWarning',
    );
  }

  return cached;
}
