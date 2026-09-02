// The lagoon's alias list, serialised for the node loader (RegExp does not survive JSON).
import { buildLagoonViteConfig, loadLagoonJson } from './lagoon-vite.mjs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { loadMotuConfig } from './config.mjs';

/**
 * The browser env the lagoon declares, for the node harness.
 *
 * `lagoon.config.json`'s `env` is what the app's modules read at import time — acme's Supabase client
 * throws without it. Vite hands it to the browser through `define`; nothing handed it to node, so an
 * island whose graph touches that client died on a missing variable rather than on anything about the
 * island. One declaration, both paths.
 */
export function lagoonEnv() {
  try {
    return { ...(loadLagoonJson(loadMotuConfig()).env ?? {}) };
  } catch {
    return {};
  }
}

/**
 * ONE React, resolved from the project — node's answer to Vite's `dedupe: ['react', 'react-dom']`.
 *
 * The framework's packages resolve their own copy and the project resolves its own, so a component
 * that calls a hook meets a null dispatcher. It is the failure that made `--fast` unusable for any
 * island with state, and it is not the island's fault: the same island mounts fine in the browser,
 * where vite dedupes. Pointing both at the project's copy is the same fix in the other module system.
 */
function reactDedupe(root) {
  const out = [];
  try {
    const require = createRequire(resolve(root, 'package.json'));
    for (const [specifier, pattern] of [
      ['react', '^react$'],
      ['react/jsx-runtime', '^react/jsx-runtime$'],
      ['react/jsx-dev-runtime', '^react/jsx-dev-runtime$'],
      ['react-dom', '^react-dom$'],
      ['react-dom/client', '^react-dom/client$'],
    ]) {
      try {
        out.push({ source: pattern, flags: '', replacement: require.resolve(specifier) });
      } catch {
        // Not installed here — nothing to dedupe to, and inventing a path would be worse.
      }
    }
  } catch {
    /* no package.json to resolve from */
  }
  return out;
}

export async function nodeAliasEnv() {
  try {
    const cfg = loadMotuConfig();
    const vite = await buildLagoonViteConfig(cfg, process.env);
    const alias = vite?.resolve?.alias ?? [];
    // The project's React wins, and it is listed FIRST so nothing else can claim the specifier.
    return JSON.stringify(
      [...reactDedupe(cfg.hostRoot), ...reactDedupe(cfg.root)].concat(
      alias
        .filter((a) => typeof a?.replacement === 'string')
        .map((a) =>
          a.find instanceof RegExp
            ? { source: a.find.source, flags: a.find.flags, replacement: a.replacement }
            : { find: String(a.find), replacement: a.replacement },
        )),
    );
  } catch {
    return '[]';
  }
}
