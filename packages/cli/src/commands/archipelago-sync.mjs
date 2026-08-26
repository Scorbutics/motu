// `motu archipelago sync` — regenerate what the REGION side of a project derives from its config.
//
// The counterpart to `motu island sync`, and the reason it exists: coverage's deployment config was
// being emitted into the ISLAND registry, because that was the one generated module an application is
// guaranteed to import at startup. `regions: ["actions"]` names regions; it was never island-shaped.
//
// Today that is all this writes, and one generated file is enough to be worth its own verb — the
// alternative is `island sync` continuing to be quietly responsible for the region side, which is how
// nobody can tell what a command owns.
import { color, paths } from '../lib/util.mjs';
import { syncArchipelagos } from '../lib/archipelagos.mjs';

export function archipelagoSyncCommand() {
  const { path, enabled, registry } = syncArchipelagos(paths.archipelagosDir, paths.coverage);
  const regions = paths.coverage?.regions;
  const state = enabled
    ? `coverage on for ${!regions ? 'every region (no `regions` declared)' : regions.includes('*') ? 'every region (*)' : regions.join(', ')}`
    : 'coverage off — an empty module, so nothing names @motu/coverage';
  console.log(`${paths.rel(path)} — ${state}`);
  if (registry === 'import added') {
    console.log(color.dim(`  added the import to ${paths.rel(paths.archipelagosDir)}/registry.ts`));
  } else if (registry === 'no registry') {
    console.log(
      color.yellow(
        `  ! no registry.ts in ${paths.rel(paths.archipelagosDir)} — nothing imports this module, so it will not run`,
      ),
    );
  }
}
