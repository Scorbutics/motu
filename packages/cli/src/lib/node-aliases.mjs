// The lagoon's alias list, serialised for the node loader (RegExp does not survive JSON).
import { buildLagoonViteConfig } from './lagoon-vite.mjs';
import { loadMotuConfig } from './config.mjs';

export async function nodeAliasEnv() {
  try {
    const cfg = loadMotuConfig();
    const vite = await buildLagoonViteConfig(cfg, process.env);
    const alias = vite?.resolve?.alias ?? [];
    return JSON.stringify(
      alias
        .filter((a) => typeof a?.replacement === 'string')
        .map((a) =>
          a.find instanceof RegExp
            ? { source: a.find.source, flags: a.find.flags, replacement: a.replacement }
            : { find: String(a.find), replacement: a.replacement },
        ),
    );
  } catch {
    return '[]';
  }
}
