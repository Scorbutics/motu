// PROVENANCE, WITHOUT ANYONE HAVING TO ASK FOR IT.
//
// Every entry in lagoon.config.json's "alias" is a host module the lagoon stands DOWN — which is
// exactly the statement that it is a boundary this screen's data comes across. So each one is loaded
// through a wrapper that records the calls islands make into it, and the seam lens can say where a
// rendered row came from.
//
// This was per-export (`traced(...)` by hand in the stub) and that is the wrong shape for a fact
// about the boundary rather than about the function: acme's club stub had opted in, so the club region
// showed its two fetches while the actions and directory regions — whose stubs nobody had wrapped —
// reported "traced export(s), none called", which reads as "these islands fetched nothing" and is a
// different claim entirely. A stub added tomorrow is traced the day it lands.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PREFIX = '\0motu-traced:';

/**
 * The names a module exports at runtime, by reading its source.
 *
 * Deliberately regex and deliberately allowed to miss: the wrapper below re-exports the real module
 * with `export *` FIRST, and ESM lets an explicit export shadow a star. A name missed here is still
 * exported — unwrapped and unrecorded — rather than missing, so the worst case is a gap in the lens
 * and never a build that fails on an import.
 */
function exportedNames(code) {
  const out = new Set();
  for (const m of code.matchAll(/^\s*export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) out.add(m[1]);
  for (const m of code.matchAll(/^\s*export\s*\{([^}]*)\}(?!\s*from)/gm))
    for (const part of m[1].split(',')) out.add((part.split(/\bas\b/).pop() ?? '').trim());
  // `export type` / `export interface` are erased before this runs anywhere it matters, and the
  // patterns above do not match them.
  return [...out].filter((n) => n && n !== 'default');
}

/** Wrap every aliased host module so its calls are recorded. Debug builds only. */
export function motuProvenance(alias, lagoonDir) {
  // BY RESOLVED FILE, NOT BY SPECIFIER. Vite's own alias plugin runs BEFORE user `pre` plugins, so a
  // `resolveId` matching '@/lib/services/directory' is never called with it — the specifier is already
  // the stub's path by then. This cost a whole build to find, because the one region that did record
  // was the one whose stub had been wrapped by hand: the plugin looked like it worked.
  const stubs = new Map();
  for (const [spec, rel] of Object.entries(alias ?? {})) stubs.set(resolve(lagoonDir, rel), spec);
  return {
    name: 'motu:provenance',
    enforce: 'pre',
    resolveId(source, importer) {
      // The wrapper's own `import … from '<the stub>'` must reach the real file, or this recurses.
      if (importer?.startsWith(PREFIX)) return null;
      if (source.startsWith(PREFIX)) return source;
      return stubs.has(source) ? PREFIX + source : null;
    },
    load(id) {
      if (!id.startsWith(PREFIX)) return null;
      const file = id.slice(PREFIX.length);
      const spec = stubs.get(file);
      let code = '';
      try {
        code = readFileSync(file, 'utf8');
      } catch {
        return null; // unreadable: let the normal path take it and fail where it usually would
      }
      const path = JSON.stringify(file);
      return [
        `import * as __impl from ${path};`,
        `import { traceModule } from '@motu/core';`,
        `export * from ${path};`,
        `const __traced = traceModule(${JSON.stringify(spec)}, __impl);`,
        ...exportedNames(code).map((n) => `export const ${n} = __traced[${JSON.stringify(n)}];`),
        /(^|\n)\s*export\s+default\b/.test(code) ? 'export default __impl.default;' : '',
      ].join('\n');
    },
  };
}
