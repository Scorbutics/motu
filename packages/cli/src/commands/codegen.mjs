// `motu codegen [manifest] [outDir]` — regenerates the typed @motu/contract from a motu-manifest.json
// emitted by dev.motu:apt. Thin wrapper over packages/codegen/src/cli.mjs so contract regeneration is
// reachable from the one `motu` entry point, with the same defaults as `pnpm gen:contract`.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { paths, color } from '../lib/util.mjs';

export async function codegenCommand(argv) {
  const manifest = argv._[0] || paths.defaultManifest;
  const outDir = argv._[1] || paths.contractSrcDir;

  if (!existsSync(manifest)) {
    console.error(color.red(`✗ manifest not found: ${manifest}`));
    console.error(color.dim('  build the backend so dev.motu:apt emits motu-manifest.json, or pass an explicit path.'));
    process.exit(1);
  }

  const res = spawnSync(process.execPath, [paths.codegenCli, manifest, outDir], { stdio: 'inherit' });
  process.exit(res.status ?? 0);
}
