// A node ESM resolve hook that speaks the LAGOON's aliases.
//
// The happy-dom path (`--fast`) is plain node, which knows nothing about `@/…`, `motu-islands` or the
// raw-TypeScript `@motu/*` checkout — so it could not load an island that imports anything from its
// own app. Every island in a real project does.
//
// NOT tsconfig `paths`, which is the obvious answer and the wrong one: those are a TYPE resolution
// map, and a project may legitimately point one at a `.d.ts`. peps maps `react` to
// `@types/react/index.d.ts` on purpose, to force one React type definition across a checkout boundary
// — follow that at runtime and node tries to execute a declaration file.
//
// The aliases here are the ones motu already gives Vite, so the browser path and the node path resolve
// the same specifier to the same file by construction rather than by two lists someone keeps in sync.
import { existsSync, statSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';

// EXTENSIONS AND INDEX FILES, because a bundler does this and node does not. `@/app` maps to a
// DIRECTORY; Vite finds `app/index.tsx` and node reports "Cannot find package '@/app'", which reads
// exactly like the alias never applied. It did — it just landed somewhere node would not look.
const CANDIDATES = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '/index.ts', '/index.tsx', '/index.js'];

function onDisk(base) {
  for (const suffix of CANDIDATES) {
    const candidate = base + suffix;
    try {
      if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

const entries = JSON.parse(process.env.MOTU_NODE_ALIASES ?? '[]').map((e) => ({
  find: e.source ? new RegExp(e.source, e.flags) : e.find,
  replacement: e.replacement,
}));

export async function resolve(specifier, context, nextResolve) {
  for (const { find, replacement } of entries) {
    const hit = find instanceof RegExp ? find.test(specifier) : specifier === find;
    if (!hit) continue;
    const mapped = find instanceof RegExp ? specifier.replace(find, replacement) : replacement;
    const file = onDisk(resolvePath(mapped));
    if (!file) break; // aliased to nothing that exists — let node try the original and report honestly
    try {
      return await nextResolve(pathToFileURL(file).href, context);
    } catch {
      break;
    }
  }
  return nextResolve(specifier, context);
}
