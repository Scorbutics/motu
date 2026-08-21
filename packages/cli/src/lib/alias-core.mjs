// The alias map, shared by the ESM hook and the CJS patch so the two cannot disagree.
//
// Two module systems reach for the same specifier: an island's ESM `import` and, further down, a
// dependency's CJS `require`. peps got past `@/app` through the ESM hook and then died on
// `require('@/lib/utils')`, because a resolver hook is not in that path at all.
import { existsSync, statSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** A bundler resolves these; node cannot even parse them. */
export const ASSET = /\.(css|scss|sass|less|svg|png|jpe?g|gif|webp|avif|woff2?|ttf|eot)(\?.*)?$/i;
/** What an asset import becomes: an inert module, so the component's own code still runs. */
export const ASSET_STUB = resolvePath(HERE, '..', 'asset-stub.mjs');
export const ASSET_STUB_CJS = resolvePath(HERE, '..', 'asset-stub.cjs');

const CANDIDATES = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '/index.ts', '/index.tsx', '/index.js'];

export function aliasEntries() {
  return JSON.parse(process.env.MOTU_NODE_ALIASES ?? '[]').map((e) => ({
    find: e.source ? new RegExp(e.source, e.flags) : e.find,
    replacement: e.replacement,
  }));
}

/** A bundler finds `app/index.tsx` for `@/app`; node looks for a file called exactly `app`. */
export function onDisk(base) {
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

/** The file this specifier means, or null to let the host resolver have it. */
export function mapSpecifier(specifier, entries) {
  for (const { find, replacement } of entries) {
    const hit = find instanceof RegExp ? find.test(specifier) : specifier === find;
    if (!hit) continue;
    const mapped = find instanceof RegExp ? specifier.replace(find, replacement) : replacement;
    return onDisk(resolvePath(mapped));
  }
  return null;
}
