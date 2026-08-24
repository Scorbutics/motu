// Shared helpers: project layout + island name derivation. The layout (WHERE each piece lands) is
// declared in motu.config.json and resolved by loadMotuConfig(); the CLI holds no hardcoded app
// paths. WHAT lives inside each root stays motu's convention (islands/<kebab>/…, ui/<kebab>/…).
import { existsSync, readFileSync, mkdirSync, symlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative } from 'node:path';
import { loadMotuConfig } from './config.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const cfg = loadMotuConfig();

/** The motu project root (the directory that owns motu.config.json). */
export const REPO_ROOT = cfg.root;
/** Where the framework checkout lives (motu.config.json's `motuRoot`, or $MOTU_ROOT). */
export const MOTU_CHECKOUT = cfg.motuRoot;
/** The HOST application's root — where its instruction files and tsconfig live. */
export const HOST_ROOT = cfg.hostRoot;
/** The frontend app root (root/<app>) — everything below is motu-conventional. */
export const APP_ROOT = cfg.appRoot;
/** The npm package name whose barrel exports ELEMENT_REGISTRY (for the runtime harness). */
export const APP_PACKAGE = cfg.appPackage;
/** The stack the islands embed into ('angularjs' | 'next' | 'none') — selects host-specific gates. */
export const HOST = cfg.host;
/** Whether the `legacy` fit gate applies (only hosts that actually have a legacy skin). */
export const LEGACY_FIT = cfg.legacyFit;

const ISLANDS_DIR = cfg.islandsDir;
const ARCHIPELAGOS_DIR = cfg.archipelagosDir;
// UI components live OUTSIDE islands so mount points can't import each other — islands are pure mount
// points (element.ts + fixtures + index); the reusable component(s) live in ui/<kebab>/.
const UI_DIR = cfg.uiDir;

export const paths = {
  islandsDir: ISLANDS_DIR,
  /**
   * Shadow or light, from motu.config.json.
   *
   * `loadMotuConfig()` has always resolved it and this object never carried it, so every command that
   * reads config through `paths` saw `undefined` — which is how the generated registry took a silent
   * `'shadow'` default on a project that declares `light`. Same shape as the `hostSources` whitelist
   * bug: the value existed, one layer below where it was asked for.
   */
  isolation: cfg.isolation,
  /**
   * Coverage, from motu.config.json. On `paths` for the same reason `isolation` is: the registry
   * generator needs it, and a value that is whitelisted in the config loader but never surfaced here
   * is whitelisted into a dead end — which is precisely how `hostSources` shipped doing nothing.
   */
  coverage: cfg.coverage,
  /** Who this project is on a lagoon host, when the git repository is the wrong answer. */
  publishAs: cfg.publishAs,
  /** The ui/ root itself (uiDir(kebab) is one island's folder inside it). */
  uiRoot: UI_DIR,
  islandDir: (kebab) => resolve(ISLANDS_DIR, kebab),
  islandsRegistry: resolve(ISLANDS_DIR, 'registry.ts'),
  archipelagosDir: ARCHIPELAGOS_DIR,
  archipelagosRegistry: resolve(ARCHIPELAGOS_DIR, 'registry.ts'),
  archipelagoFile: (id) => resolve(ARCHIPELAGOS_DIR, id, `${id}.archipelago.ts`),
  /** A region's declared flows — beside its config, never inside it (evidence stays out of the bundle). */
  archipelagoEvidence: (id) => resolve(ARCHIPELAGOS_DIR, id, `${id}.evidence.ts`),
  barrel: cfg.barrel,
  contract: resolve(cfg.contractSrcDir, 'index.ts'),
  contractSrcDir: cfg.contractSrcDir,
  // Framework-internal path: relative to the CLI itself (packages/cli/src/lib), never the app.
  codegenCli: resolve(here, '../../../codegen/src/cli.mjs'),
  defaultManifest: cfg.manifest,
  lagoonDir: cfg.lagoonDir,
  bridgeDir: cfg.bridgeDir,
  // The component lives in ui/<kebab>/ (a mount point owns no component of its own).
  uiDir: (kebab) => resolve(UI_DIR, kebab),
  componentFile: (kebab, pascal) => resolve(UI_DIR, kebab, `${pascal}.tsx`),
  /**
   * The file declaring an island's ElementSpec, in either supported layout — flat
   * `<kebab>.island.ts(x)` (preferred) or the original `<kebab>/element.ts` (the reference ocean).
   * Falls back to the folder form so a not-yet-created island still reports a sensible path.
   */
  elementFile: (kebab) => {
    for (const p of [
      resolve(ISLANDS_DIR, `${kebab}.island.ts`),
      resolve(ISLANDS_DIR, `${kebab}.island.tsx`),
      resolve(ISLANDS_DIR, kebab, 'element.ts'),
    ]) {
      if (existsSync(p)) return p;
    }
    return resolve(ISLANDS_DIR, kebab, 'element.ts');
  },
  islandIndexFile: (kebab) => resolve(ISLANDS_DIR, kebab, 'index.ts'),
  /** An island's lagoon evidence: `<kebab>.evidence.ts` (flat) or `<kebab>/fixtures.mock.ts` (folder). */
  fixturesFile: (kebab) => {
    const flat = resolve(ISLANDS_DIR, `${kebab}.evidence.ts`);
    if (existsSync(flat)) return flat;
    return resolve(ISLANDS_DIR, kebab, 'fixtures.mock.ts');
  },
  /** The one shared island stylesheet (linted at region scope until islands own their own CSS). */
  sharedStyles: resolve(cfg.sharedDir, 'styles.css'),
  /** Project-relative display path for messages — derived from config, never hardcoded. */
  rel: (abs) => relative(cfg.root, abs) || '.',
};

/**
 * Strip comments and trailing commas from JSONC (tsconfig/jsconfig), string-aware.
 *
 * Regex stripping is wrong here in a way that looks fine until it silently destroys the file: a
 * tsconfig's `paths` is full of `"@/*": ["./*"]`, and the `/*` inside those string literals opens a
 * block comment that the regex then closes at the next comment terminator far below, deleting
 * everything between. So scan characters, and only treat comment openers outside strings as comments.
 */
function stripJsonc(text) {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      out += c;
      if (c === '\\') {
        out += text[++i] ?? '';
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++;
    } else {
      out += c;
    }
  }
  // Trailing commas are legal in JSONC, not in JSON.
  return out.replace(/,(\s*[}\]])/g, '$1');
}

/**
 * Path aliases declared by the HOST application's tsconfig (e.g. Next's `@/*` -> `./*`).
 *
 * An island that wraps a component the app already owns imports it the way the app does. Resolving
 * that import means speaking the host's alias language, so read it from the host's own tsconfig
 * rather than assuming a convention.
 */
function hostTsconfigAliases() {
  const out = [];
  for (const name of ['tsconfig.json', 'jsconfig.json']) {
    const file = resolve(cfg.hostRoot, name);
    if (!existsSync(file)) continue;
    try {
      const json = JSON.parse(stripJsonc(readFileSync(file, 'utf8')));
      const paths = json?.compilerOptions?.paths ?? {};
      const base = resolve(cfg.hostRoot, json?.compilerOptions?.baseUrl ?? '.');
      for (const [pattern, targets] of Object.entries(paths)) {
        if (!Array.isArray(targets) || !targets.length) continue;
        out.push({ prefix: pattern.replace(/\*$/, ''), target: resolve(base, targets[0].replace(/\*$/, '')) });
      }
    } catch {
      /* unreadable host tsconfig — aliases just stay unresolved */
    }
    break;
  }
  return out;
}

const HOST_ALIASES = hostTsconfigAliases();

const TS_EXTENSIONS = ['', '.tsx', '.ts', '/index.tsx', '/index.ts'];

/** Resolve a module specifier found in an island's element.ts to a file on disk (null if it can't). */
export function resolveModuleSpecifier(spec, fromDir) {
  let base = null;
  if (spec.startsWith('.')) base = resolve(fromDir, spec);
  else {
    const alias = HOST_ALIASES.find((a) => a.prefix && spec.startsWith(a.prefix));
    if (alias) base = resolve(alias.target, spec.slice(alias.prefix.length));
  }
  if (!base) return null;
  // TS source is imported with a '.js' specifier under NodeNext; try the source extensions too.
  const candidates = base.endsWith('.js') ? [base.slice(0, -3), base] : [base];
  for (const c of candidates) {
    for (const ext of TS_EXTENSIONS) {
      const p = c + ext;
      if (existsSync(p) && !p.endsWith('/')) return p;
    }
  }
  return null;
}

/**
 * Where an island's component actually lives.
 *
 * The reference layout puts it at ui/<kebab>/<Pascal>.tsx, because extracting from an AngularJS ocean
 * means WRITING a React component that did not exist. A React host is the other case entirely: the
 * component already exists and the island is only a mount point over it, so copying it into ui/ would
 * fork the app's own component and let the two drift. So: follow element.ts's import of the component
 * it mounts, and fall back to the ui/ convention when there is nothing to follow.
 */
/** The identifier an island file mounts, in either declaration form. */
export function islandComponentIdentifier(text) {
  return (
    text.match(/\bcomponent\s*:\s*([A-Za-z_$][\w$]*)/)?.[1] ??
    text.match(/\bisland\(\s*'[^']+'\s*,\s*([A-Za-z_$][\w$]*)/)?.[1] ??
    null
  );
}

export function islandComponentPath(kebab, pascal) {
  // Whichever layout the island uses. A relative import in the declaration resolves against the
  // FILE's own directory — the islands dir for a flat `<kebab>.island.ts`, the island's folder for
  // the original `<kebab>/element.ts` — so the base has to come from the resolved path, not a guess.
  const elementPath = paths.elementFile(kebab);
  if (existsSync(elementPath)) {
    const text = readFileSync(elementPath, 'utf8');
    // Either declaration form: the explicit `component:` property, or `island('x-tag', Component)`
    // — the short form, where everything derivable comes from the generated contracts file.
    const componentName = islandComponentIdentifier(text);
    if (componentName) {
      for (const m of text.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
        const named = m[1].split(',').map((n) => n.trim().split(/\s+as\s+/).pop().trim());
        if (!named.includes(componentName)) continue;
        const resolved = resolveModuleSpecifier(m[2], dirname(elementPath));
        if (resolved) return resolved;
      }
    }
  }
  return resolve(UI_DIR, kebab, `${pascal}.tsx`);
}

/**
 * The viewports a project checks its UI at, from `lagoon.config.json`.
 *
 * Motu had no notion of one: `fit` is footprint and skin, never width, so "does this work on a phone"
 * was left to whoever remembered to drag a browser window. Declared once, they drive the lagoon's own
 * width switcher and the responsive check — the same list, so what you look at is what CI measures.
 */
export function lagoonViewports() {
  const file = resolve(cfg.lagoonDir, 'lagoon.config.json');
  const declared = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')).viewports ?? null) : null;
  const map = declared ?? { mobile: 390, desktop: 1280 };
  return Object.entries(map).map(([name, width]) => ({ name, width: Number(width) }));
}

/**
 * How hard the accessibility check bites, from `lagoon.config.json`.
 *
 * Warnings by default, deliberately. A check that turns an existing codebase red on the day it ships
 * gets switched off, not acted on — and the first run here found violations owned by a UI library, not
 * by the app. Same adoption shape as key ownership: report, let a project get clean, then promote.
 *
 *   "a11y": { "fail": "critical" | "serious" | "never", "ignore": ["aria-allowed-attr"] }
 */
export function lagoonA11y() {
  const file = resolve(cfg.lagoonDir, 'lagoon.config.json');
  const declared = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')).a11y ?? {}) : {};
  return { fail: declared.fail ?? 'never', ignore: new Set(declared.ignore ?? []) };
}

/**
 * The name of the component an island mounts, as EXPORTED by the component's own file.
 *
 * Not the name derived from the island's own kebab: on a modern host an island wraps a component the
 * app already ships, whose name is the app's business (`WeekActionsView`, `NetworkStatsBanner`). Every
 * check that reads the component — default props, the `${Name}Props` interface — has to look for what
 * is actually there, or it reports "couldn't find" for a component sitting right in front of it.
 */
export function islandComponentExport(kebab, fallback) {
  const elementPath = paths.elementFile(kebab);
  if (!existsSync(elementPath)) return fallback;
  const text = readFileSync(elementPath, 'utf8');
  const local = islandComponentIdentifier(text);
  if (!local) return fallback;
  for (const m of text.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"][^'"]+['"]/g)) {
    for (const entry of m[1].split(',')) {
      const [exported, alias] = entry.split(/\s+as\s+/).map((n) => n.trim());
      if ((alias ?? exported) === local) return exported;
    }
  }
  return local;
}

/**
 * Locate the vite binary that serves/builds the lagoon.
 *
 * A single `REPO_ROOT/node_modules/vite` join only works when the project root is also the install
 * root. It is not, in the case motu has to support: a motu project living in a SUBFOLDER of an
 * existing app, where node_modules sits at the app root above it (or is hoisted further up still).
 * Walk up from the lagoon itself — the app that actually needs vite — then fall back to the motu
 * checkout's own install, so a project with no vite of its own can still close the loop.
 */
function findVite() {
  const candidates = [];
  for (let dir = cfg.lagoonDir; ; dir = dirname(dir)) {
    candidates.push(resolve(dir, 'node_modules/vite/bin/vite.js'));
    if (dirname(dir) === dir) break;
  }
  candidates.push(resolve(here, '../../node_modules/vite/bin/vite.js'));
  return candidates.find((p) => existsSync(p)) ?? candidates[0];
}

/** The vite binary the lagoon is served/built with (see findVite). */
export const VITE_BIN = findVite();

/** Accepts kebab-case, PascalCase or camelCase and returns the canonical names used throughout. */
export function names(input) {
  const words = String(input)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
  if (words.length === 0) throw new Error('island name is empty');
  const pascal = words.map((w) => w[0].toUpperCase() + w.slice(1)).join('');
  const camel = pascal[0].toLowerCase() + pascal.slice(1);
  const kebab = words.join('-');
  return { pascal, camel, kebab, tag: `${cfg.tagPrefix}${kebab}` };
}

export const color = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

/** ts-morph formatText settings matching the repo's 2-space style, applied after AST inserts. */
export const FMT = {
  indentSize: 2,
  tabSize: 2,
  convertTabsToSpaces: true,
  indentStyle: 2, // Smart
  ensureNewLineAtEndOfFile: true,
};

/**
 * An import specifier as an absolute path, so two spellings of one module compare equal.
 *
 * `@/app/x/y` and `./y` from inside `app/x` are the same file, and a check that compares the STRINGS
 * reports a page as not importing what it plainly imports. Returns null for a package specifier.
 */
export function resolveAppImport(fromFile, spec) {
  const strip = (p) => p.replace(/\.(js|ts|tsx)$/, '');
  if (spec.startsWith('@/')) return strip(resolve(HOST_ROOT, spec.slice(2)));
  if (spec.startsWith('.')) return strip(resolve(dirname(fromFile), spec));
  return null;
}

/**
 * Comments blanked, WITHOUT mistaking a string for one.
 *
 * The regex version (`/\/\*[\s\S]*?\*\//`) cannot tell code from text, and a path glob is text
 * containing `/*`: the moment an island declared `owns: 'src/modules/.../fields/**'`, everything from
 * that quote to the next `*\/` — two more islands and a JSDoc away — was blanked, and the archipelago
 * parsed as having ONE island instead of three. Silently, because a parser that finds less than is
 * there has nothing to complain about.
 *
 * So it scans. Strings and templates are skipped whole; only real comments become spaces, and newlines
 * survive so line numbers still mean something.
 */
export function blankComments(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    // A string or template: copy it verbatim, including whatever slashes and stars it contains.
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === '\\') j += 2;
        else if (text[j] === quote) break;
        else j++;
      }
      out += text.slice(i, Math.min(j + 1, text.length));
      i = j + 1;
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? text.length : end + 2;
      out += text.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
      continue;
    }
    if (ch === '/' && text[i + 1] === '/') {
      let j = i;
      while (j < text.length && text[j] !== '\n') j++;
      out += ' '.repeat(j - i);
      i = j;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/**
 * Make `@motu/*` resolvable BY NODE inside the project, without an install.
 *
 * The lagoon resolves the framework with Vite aliases and tsconfig maps it with `paths` — that is the
 * no-install posture and it works. What it does not cover is plain node: the runtime harness and the
 * evidence loaders `import()` the project's own files, which import `@motu/react`, and node knows
 * nothing about either alias. In a workspace this is invisible because the workspace already linked
 * them; in a standalone project `--fast` simply cannot load an island.
 *
 * So the links are created on demand, in the project's own gitignored `node_modules`, pointing at the
 * checkout `motuRoot` names. An agent building an island in a fresh project hand-built exactly these
 * by hand and inherited a duplicate-React problem for its trouble.
 */
export function ensureNoInstallLinks(root, motuRoot) {
  const dir = resolve(root, 'node_modules', '@motu');
  // `chrome` belongs here even though a host never imports it by name: `@motu/core`'s toolbar does
  // (`import { MOTU_CHROME } from '@motu/chrome'`). Leaving it out worked only as long as every host
  // resolved motu's files by their real path and so fell through to motu's own workspace copy. A host
  // that aliases `@motu/*` to source instead — the arrangement Next and Angular both want — resolves
  // from its own tree and gets an unresolved import from inside a package it never named.
  const wanted = ['core', 'react', 'runtime', 'types', 'debug-overlay', 'chrome', 'coverage'];
  let made = 0;
  for (const name of wanted) {
    const target = resolve(motuRoot, 'packages', name);
    if (!existsSync(target)) continue;
    const link = resolve(dir, name);
    try {
      if (existsSync(link)) continue;
      mkdirSync(dir, { recursive: true });
      symlinkSync(target, link, 'dir');
      made++;
    } catch {
      // A read-only checkout or a real install already there: nothing to do, and nothing to say.
    }
  }
  return made;
}

/**
 * Does the host's TypeScript config make an out-of-range index visible?
 *
 * `default-props` already requires an island to render from defaults alone — which means handling the
 * ABSENT case and the EMPTY one. motu checks the first mechanically and, until now, only hoped for the
 * second: `missions[0].weekNumber` on a list that can be empty compiles clean under `strict`, throws at
 * runtime, and is exactly the shape of a real bug this project has already fixed once.
 *
 * `noUncheckedIndexedAccess` types `missions[0]` as `MissionItem | undefined`, so forgetting is a
 * compile error and `missions[0]?.weekNumber ?? 0` is not. It is the mechanical half of a rule motu
 * already states, and it belongs in the island's own code rather than in a check that renders the
 * state and watches for a throw — the compiler gets there first, for free, at authoring time.
 *
 * AUDITED, NOT ENFORCED. This is the host's build, the same boundary as a foreign store: motu can say
 * the guarantee is missing and cannot install it.
 *
 * Follows `extends` (one chain, bounded) because a Next app keeps its strictness in a base config.
 */
export function hostStrictBoundaries(root = HOST_ROOT) {
  const seen = new Set();
  let file = resolve(root, 'tsconfig.json');
  // No tsconfig is not "the flag is off" — it is a project this check cannot speak about. Saying OFF
  // would put a finding on every non-TypeScript host.
  if (!existsSync(file)) return { known: false, enabled: false, file };
  for (let hop = 0; hop < 8 && existsSync(file) && !seen.has(file); hop++) {
    seen.add(file);
    // MATCHED, NOT PARSED. A tsconfig is JSONC, and stripping its comments with a regex ate the `/*`
    // inside a `"@/*"` path mapping — every project with a path alias came back "unknown". Two
    // targeted patterns need no parser and cannot be confused by the rest of the file. Whole-line
    // comments are dropped first, so a commented-out setting does not read as a setting.
    const raw = readFileSync(file, 'utf8').replace(/^\s*\/\/.*$/gm, '');
    const flag = raw.match(/"noUncheckedIndexedAccess"\s*:\s*(true|false)/);
    if (flag) return { known: true, enabled: flag[1] === 'true', file };
    const extends_ = raw.match(/"extends"\s*:\s*"([^"]+)"/);
    if (!extends_) break;
    const ext = extends_[1];
    // A package specifier ('next/tsconfig.json') is not resolved here — its value is not knowable
    // without walking node_modules, and reporting "off" for a base that enables it would be a lie.
    if (!ext.startsWith('.')) return { known: false, enabled: false, file };
    file = resolve(dirname(file), ext.endsWith('.json') ? ext : `${ext}.json`);
  }
  // Absent means OFF: `strict` does not include it, so silence in the config is a real answer.
  return { known: true, enabled: false, file };
}
