// Shared helpers: project layout + island name derivation. The layout (WHERE each piece lands) is
// declared in motu.config.json and resolved by loadMotuConfig(); the CLI holds no hardcoded app
// paths. WHAT lives inside each root stays motu's convention (islands/<kebab>/…, ui/<kebab>/…).
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative } from 'node:path';
import { loadMotuConfig } from './config.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const cfg = loadMotuConfig();

/** The motu project root (the directory that owns motu.config.json). */
export const REPO_ROOT = cfg.root;
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
