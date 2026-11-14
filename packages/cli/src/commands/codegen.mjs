// `motu codegen [manifest] [outDir]` — regenerates the typed @motujs/contract from a motu-manifest.json
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

  // @motujs/codegen is NOT published: it serves the reference ocean's Java manifest and lives only in
  // the checkout. Installed from npm, spawning the path below would die with node's own
  // MODULE_NOT_FOUND naming `node_modules/@motujs/codegen/src/cli.mjs`, which reads as a broken
  // install rather than as a command that needs a checkout.
  if (!existsSync(paths.codegenCli)) {
    console.error(color.red('✗ motu codegen needs a motu checkout — @motujs/codegen is not published to npm.'));
    console.error(color.dim('  clone the motu repository and run it from there, or set MOTU_ROOT=<checkout>.'));
    process.exit(2);
  }
  const res = spawnSync(process.execPath, [paths.codegenCli, manifest, outDir], { stdio: 'inherit' });
  process.exit(res.status ?? 0);
}
