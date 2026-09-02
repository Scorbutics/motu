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
import { pathToFileURL } from 'node:url';
import { ASSET, ASSET_STUB, aliasEntries, mapSpecifier } from './lib/alias-core.mjs';

const entries = aliasEntries();

export async function resolve(specifier, context, nextResolve) {
  // A stylesheet is not a module. Answering with an inert one keeps the component's own code running,
  // which is the thing being checked; refusing would fail an island for importing its own CSS.
  if (ASSET.test(specifier)) return { url: pathToFileURL(ASSET_STUB).href, shortCircuit: true };

  const file = mapSpecifier(specifier, entries);
  if (file) {
    try {
      return await nextResolve(pathToFileURL(file).href, context);
    } catch {
      // An alias that resolves to nothing loadable is not fatal — fall through, so one stale entry
      // cannot make every import fail, and node reports the original specifier honestly.
    }
  }
  return nextResolve(specifier, context);
}
