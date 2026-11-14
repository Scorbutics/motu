// `motu sync` — regenerate everything motu derives from the files on disk and the config.
//
// ONE VERB, because the derived files are one kind of thing: never edited by hand, and stale is a
// build error. There used to be two — `island sync` (the element registry and the contracts) and
// `archipelago sync` (the region-side module coverage's deployment config lives in) — split by noun
// so each command owned what it named. The split was right about ownership and wrong about use:
// nobody runs half a regeneration on purpose, and running the half that was not stale left `motu
// check` red with a message naming the other verb. `island sync` / `archipelago sync` still answer,
// and run this.
import { paths, color, names, islandComponentPath, islandComponentExport } from '../lib/util.mjs';
import { syncRegistry } from '../lib/islands.mjs';
import { syncContracts } from '../lib/contracts.mjs';
import { syncArchipelagos } from '../lib/archipelagos.mjs';

export function syncCommand() {
  // The ISLAND side: the element registry and the contracts read from each component.
  //
  // Static imports in the registry rather than a glob, because the barrel that exports it is consumed
  // by the host application's bundler, which has no `import.meta.glob`.
  const { path, count } = syncRegistry(paths.islandsDir, paths.isolation);
  console.log(`${paths.rel(path)} — ${count} island(s)`);
  const contracts = syncContracts(paths.islandsDir, { islandComponentPath, islandComponentExport, names });
  console.log(`${paths.rel(contracts.path)} — ${contracts.count} contract(s)${contracts.changed ? '' : ' (unchanged)'}`);

  // The REGION side: coverage's deployment config. It names regions (`regions: ["actions"]`), so it
  // is generated beside the archipelagos, not baked into the island registry it once rode in.
  const regions = syncArchipelagos(paths.archipelagosDir, paths.coverage);
  const wanted = paths.coverage?.regions;
  const state = regions.enabled
    ? `coverage on for ${!wanted ? 'every region (no `regions` declared)' : wanted.includes('*') ? 'every region (*)' : wanted.join(', ')}`
    : 'coverage off — an empty module, so nothing names @motujs/coverage';
  console.log(`${paths.rel(regions.path)} — ${state}`);
  if (regions.registry === 'import added') {
    console.log(color.dim(`  added the import to ${paths.rel(paths.archipelagosDir)}/registry.ts`));
  } else if (regions.registry === 'no registry') {
    console.log(color.yellow(`  ! no registry.ts in ${paths.rel(paths.archipelagosDir)} — nothing imports this module, so it will not run`));
  }
}
