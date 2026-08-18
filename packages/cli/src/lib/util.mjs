// Shared helpers: project layout + island name derivation. The layout (WHERE each piece lands) is
// declared in motu.config.json and resolved by loadMotuConfig(); the CLI holds no hardcoded app
// paths. WHAT lives inside each root stays motu's convention (islands/<kebab>/…, ui/<kebab>/…).
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative } from 'node:path';
import { loadMotuConfig } from './config.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const cfg = loadMotuConfig();

/** The motu project root (the directory that owns motu.config.json). */
export const REPO_ROOT = cfg.root;
/** The frontend app root (root/<app>) — everything below is motu-conventional. */
export const APP_ROOT = cfg.appRoot;
/** The npm package name whose barrel exports ELEMENT_REGISTRY (for the runtime harness). */
export const APP_PACKAGE = cfg.appPackage;

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
  elementFile: (kebab) => resolve(ISLANDS_DIR, kebab, 'element.ts'),
  islandIndexFile: (kebab) => resolve(ISLANDS_DIR, kebab, 'index.ts'),
  fixturesFile: (kebab) => resolve(ISLANDS_DIR, kebab, 'fixtures.mock.ts'),
  /** The one shared island stylesheet (linted at region scope until islands own their own CSS). */
  sharedStyles: resolve(cfg.sharedDir, 'styles.css'),
  /** Project-relative display path for messages — derived from config, never hardcoded. */
  rel: (abs) => relative(cfg.root, abs) || '.',
};

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
