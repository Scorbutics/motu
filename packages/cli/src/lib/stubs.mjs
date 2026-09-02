// The seam where the lagoon's isolation can become a lie.
//
// A host stub stands in for a real module so an island can render with no backend. Nothing checked
// that it still stands in for all of it: in acme, two exports went missing from stubs and only
// surfaced because the lagoon BUILD happened to import them — a bundler error, by luck. An export
// nothing imports at build time would have gone unnoticed, and the lagoon would have been quietly
// green about a module it no longer mirrors.
//
// What is checked here is what the ISLANDS actually reach for: every named import of an aliased
// specifier, found by walking the import graph from each island's component. Demanding that a stub
// mirror a module's whole surface would be noise — the real missions service exports twenty things and
// the islands use four.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { paths, resolveModuleSpecifier } from './util.mjs';
import { listIslands, elementExportName } from './islands.mjs';

/** The lagoon's alias table: app specifier -> stub file (absolute). */
export function lagoonAliases() {
  const file = resolve(paths.lagoonDir, 'lagoon.config.json');
  if (!existsSync(file)) return [];
  const alias = JSON.parse(readFileSync(file, 'utf8')).alias ?? {};
  return Object.entries(alias).map(([specifier, target]) => ({
    specifier,
    stub: resolve(paths.lagoonDir, target),
  }));
}

/** Named exports a module declares, by source text — enough for a name-level comparison. */
function exportedNames(file) {
  if (!existsSync(file)) return null;
  const code = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ');
  const names = new Set();
  for (const m of code.matchAll(/export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) {
    names.add(m[1]);
  }
  // `export { a, b as c }` — the exported NAME is what an importer writes, so take the alias when there
  // is one.
  for (const block of code.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const entry of block[1].split(',')) {
      const [, exported] = entry.trim().match(/(?:(\w+)\s+as\s+)?(\w+)/) ?? [];
      if (exported) names.add(exported);
    }
  }
  return names;
}

/** Type-only imports never reach the runtime, so a stub owes them nothing. */
const TYPE_IMPORT = /^\s*import\s+type\b/;

/**
 * Every named import of `specifier` made by code an island can reach.
 *
 * Walks from each island's component through relative and aliased imports, staying inside the host's
 * own sources. That set is what the lagoon bundles, which is the only set a stub has to satisfy.
 */
export function islandReachableImports(specifiers) {
  const wanted = new Set(specifiers);
  const found = new Map(specifiers.map((s) => [s, new Set()]));
  const seen = new Set();
  const queue = [];

  for (const island of listIslands(paths.islandsDir)) {
    const elementFile = island.element;
    if (existsSync(elementFile)) queue.push(elementFile);
    void elementExportName;
  }

  while (queue.length) {
    const file = queue.shift();
    // A specifier can resolve to a directory (an index import); there is nothing to read there.
    if (seen.has(file) || !existsSync(file) || statSync(file).isDirectory()) continue;
    seen.add(file);
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/import\s+([^'"]*?)from\s*['"]([^'"]+)['"]/g)) {
      const clause = m[1];
      const spec = m[2];
      if (wanted.has(spec) && !TYPE_IMPORT.test(m[0])) {
        for (const named of clause.matchAll(/\{([^}]*)\}/g)) {
          for (const entry of named[1].split(',')) {
            const name = entry.trim().split(/\s+as\s+/)[0].trim().replace(/^type\s+/, '');
            if (name && !entry.trim().startsWith('type ')) found.get(spec).add(name);
          }
        }
      }
      // Keep walking the app's own code; node_modules and motu's packages are not the host's to stub.
      const next = resolveModuleSpecifier(spec, dirname(file));
      if (next && !next.includes('node_modules')) queue.push(next);
    }
  }
  return found;
}

/**
 * Compare each stub against the real module, over what the islands import.
 *
 * Returns [{ specifier, stub, missing, unresolved }] — `missing` is the finding that matters: an
 * island reaches for it, the stub does not have it.
 */
export function stubParity() {
  const aliases = lagoonAliases();
  if (!aliases.length) return [];
  const used = islandReachableImports(aliases.map((a) => a.specifier));
  return aliases.map(({ specifier, stub }) => {
    const stubExports = exportedNames(stub);
    const real = resolveModuleSpecifier(specifier, paths.lagoonDir);
    const needed = [...(used.get(specifier) ?? [])];
    if (!stubExports) return { specifier, stub, unresolved: 'stub file not found', missing: [], needed };
    const missing = needed.filter((name) => !stubExports.has(name));
    return { specifier, stub, real, missing, needed, unresolved: null };
  });
}
