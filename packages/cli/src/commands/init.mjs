// `motu init [dir]` — bootstrap a fresh project so `motu island create` / `verify` work immediately.
// It writes motu.config.json (the layout declaration the rest of the CLI reads) plus the empty
// semantic roots + registries + barrel that islands slot into. It establishes the DEFAULT layout
// (src/islands, src/ui, src/archipelagos, src/shared) — the same convention the CLI defaults to — so
// the generated config only needs to name the app package. Lagoon/bridge roots are a project concern
// and intentionally NOT scaffolded here.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { color } from '../lib/util.mjs';

const CONFIG = `{
  "islands": "src/islands",
  "ui": "src/ui",
  "archipelagos": "src/archipelagos",
  "shared": "src/shared",
  "contract": "contract/src",
  "lagoon": "roots/lagoon",
  "bridge": "roots/bridge",
  "tagPrefix": "x-",
  "isolation": "shadow"
}
`;

const ISLANDS_REGISTRY = `// The project's element registry, assembled from each island's own element.ts. \`motu island create\`
// adds one import + one row here; the framework turns this into custom-element registrations.
import type { ElementSpec } from '@motu/react';

export const ELEMENT_REGISTRY: ElementSpec[] = [];
`;

const ARCHIPELAGOS_REGISTRY = `// Registry of the project's archipelagos by id, so a composition root (or the lagoon / CLI) can
// resolve one by name. \`motu archipelago create\` adds one import + one row here.
import type { ArchipelagoConfig } from '@motu/core';

export const ARCHIPELAGOS: Record<string, ArchipelagoConfig> = {};

/** Resolve an archipelago config by id (undefined if unknown). */
export function getArchipelago(id: string): ArchipelagoConfig | undefined {
  return ARCHIPELAGOS[id];
}
`;

const BARREL = `// Public surface of the project: the element registry and the archipelago configs + resolver.
// Composition roots (and the motu lagoon / CLI harness) import everything they need from here.
export { ELEMENT_REGISTRY } from './islands/registry.js';
export { ARCHIPELAGOS, getArchipelago } from './archipelagos/registry.js';
`;

function writeNew(path, contents, created) {
  if (existsSync(path)) return false;
  mkdirSync(resolve(path, '..'), { recursive: true });
  writeFileSync(path, contents);
  created.push(path);
  return true;
}

export async function initCommand(argv) {
  const root = resolve(process.cwd(), argv._[0] ?? '.');
  const configPath = resolve(root, 'motu.config.json');
  if (existsSync(configPath) && !argv.force) {
    console.error(color.red(`✗ ${basename(root)}/motu.config.json already exists — use --force to overwrite`));
    process.exit(1);
  }

  const created = [];
  mkdirSync(root, { recursive: true });
  writeFileSync(configPath, CONFIG);
  created.push(configPath);

  writeNew(resolve(root, 'src/islands/registry.ts'), ISLANDS_REGISTRY, created);
  writeNew(resolve(root, 'src/archipelagos/registry.ts'), ARCHIPELAGOS_REGISTRY, created);
  writeNew(resolve(root, 'src/index.ts'), BARREL, created);
  // Empty roots the conventions live under (keep them tracked so the layout is visible up front).
  writeNew(resolve(root, 'src/ui/.gitkeep'), '', created);
  writeNew(resolve(root, 'src/shared/.gitkeep'), '', created);

  console.log(color.green(`✓ initialized motu project in ${basename(root)}/`));
  for (const p of created) console.log('  ' + color.dim(p.slice(root.length + 1)));
  console.log('');
  console.log('Next: ' + color.bold('motu island create <name>'));
}
