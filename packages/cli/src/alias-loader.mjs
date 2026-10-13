// A node ESM resolve hook that speaks the LAGOON's aliases.
//
// The happy-dom path (`--fast`) is plain node, which knows nothing about `@/…`, `motu-islands` or the
// raw-TypeScript `@motu/*` checkout — so it could not load an island that imports anything from its
// own app, which is every island in a real project.
//
// NOT tsconfig `paths`, which is the obvious answer and the wrong one: those are a TYPE resolution
// map, and a project may legitimately point one at a `.d.ts`. acme maps `react` to
// `@types/react/index.d.ts` on purpose, to force one React type definition across a checkout boundary
// — follow that at runtime and node tries to execute a declaration file.
//
// The aliases here are the ones motu already gives Vite, so the browser path and the node path resolve
// the same specifier to the same file by construction rather than by two lists someone keeps in sync.
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ASSET, ASSET_STUB, aliasEntries, mapSpecifier } from './lib/alias-core.mjs';

const entries = aliasEntries();

export async function resolve(specifier, context, nextResolve) {
  // A stylesheet is not a module. Answering with an inert one keeps the component's own code running,
  // which is the thing being checked; refusing would fail an island for importing its own CSS.
  if (ASSET.test(specifier)) return { url: pathToFileURL(ASSET_STUB).href, shortCircuit: true };

  const file = mapSpecifier(specifier, entries);
  if (file) {
    try {
      return asModuleSource(await nextResolve(pathToFileURL(file).href, context));
    } catch {
      // An alias that resolves to nothing loadable is not fatal — fall through, so one stale entry
      // cannot make every import fail, and node reports the original specifier honestly.
    }
  }
  return asModuleSource(await nextResolve(specifier, context));
}

const SOURCE = /\.(ts|tsx|jsx)$/;
const ESM_SYNTAX = /^\s*(import|export)\b/m;

/**
 * An application's own TypeScript is ESM, whatever its `package.json` says.
 *
 * A Next or Vite app is written in `import`/`export` and compiled by a bundler, so its package.json
 * routinely has no `"type": "module"`. Plain node then classifies every `.tsx` in it as CommonJS, tsx
 * compiles it that way, and the island's named import of it fails — "does not provide an export
 * named 'ActionsGuide'" — because node cannot see esbuild's CJS exports. The registry imports every
 * island, so ONE such file made `--fast` die for every island in the project, under an error naming
 * an unrelated one. Bundlers never ask this question; this lane has to answer it the way they do.
 *
 * Narrow on purpose: only a TS/JSX source outside node_modules that node would load as CommonJS and
 * that is written in ESM syntax. A genuinely CommonJS file keeps its format.
 */
function asModuleSource(result) {
  if (!result?.url?.startsWith('file:') || result.format === 'module') return result;
  if (!SOURCE.test(result.url) || result.url.includes('/node_modules/')) return result;
  if (result.format && result.format !== 'commonjs') return result;
  try {
    if (!ESM_SYNTAX.test(readFileSync(fileURLToPath(result.url), 'utf8'))) return result;
  } catch {
    return result;
  }
  return { ...result, format: 'module' };
}
