// `motu island snapshot <name|--all> [--update]` — record or check an island's visual baselines.
//
// Without `--update` it CHECKS: capture every declared scenario × viewport and compare to what is
// committed. With `--update` it records, which is a deliberate, separate act — a baseline should change
// because someone decided the UI should, never as a side effect of running the checks.
//
// The failure artifacts matter as much as the verdict: on a difference it writes `.actual.png` and
// `.diff.png` beside the baseline, so the answer to "what changed?" is an image, not a percentage.
import { existsSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { color, paths, names, lagoonViewports } from '../lib/util.mjs';
import { listIslands } from '../lib/islands.mjs';
import { captureLagoon } from '../playwright-lagoon.mjs';
import {
  compareSnapshot,
  orphanBaselines,
  snapshotDir,
  snapshotName,
  writeBaseline,
  writeFailureArtifacts,
} from '../lib/snapshots.mjs';

/** The island's declared scenarios, or a single default state. */
async function scenariosFor(kebab) {
  const file = paths.fixturesFile(kebab);
  if (!existsSync(file)) return [];
  try {
    const mod = await import(`file://${file}?t=${Date.now()}`);
    return Array.isArray(mod.scenarios) ? mod.scenarios : [];
  } catch {
    // Evidence is TypeScript in most projects; the lagoon compiles it, node cannot. The capture still
    // runs — one shot of the island in its seeded state — it just cannot name the states.
    return [];
  }
}

async function snapshotIsland(argv, kebab) {
  const { tag } = names(kebab);
  const viewports = lagoonViewports();
  const scenarios = await scenariosFor(kebab);
  const dir = snapshotDir(paths.islandsDir, kebab);
  const port = 5300 + Math.floor(Math.random() * 400);

  let shots;
  try {
    shots = await captureLagoon({ tag, port, scenarios, viewports });
  } catch (err) {
    return { kebab, error: err.message, results: [] };
  }

  const results = [];
  for (const shot of shots) {
    const file = snapshotName(shot.scenario, shot.viewport);
    const baseline = resolve(dir, file);
    if (argv.update) {
      writeBaseline(dir, file, shot.png);
      results.push({ file, status: existsSync(baseline) ? 'updated' : 'recorded' });
      continue;
    }
    const cmp = await compareSnapshot(baseline, shot.png);
    if (cmp.status === 'changed' || cmp.status === 'resized') {
      writeFailureArtifacts(dir, file, shot.png, cmp.diff);
    } else if (cmp.status === 'new') {
      writeBaseline(dir, file, shot.png);
    }
    results.push({ file, ...cmp });
  }
  const orphans = orphanBaselines(dir, shots.map((s) => snapshotName(s.scenario, s.viewport)));
  return { kebab, dir, results, orphans };
}

export async function snapshotCommand(argv) {
  const name = argv._[0];
  if (!name && !argv.all) {
    console.error('usage: motu island snapshot <name|--all> [--update] [--json]');
    process.exit(2);
  }
  const targets = argv.all ? listIslands(paths.islandsDir).map((i) => i.kebab) : [names(name).kebab];

  const all = [];
  for (const kebab of targets) all.push(await snapshotIsland(argv, kebab));

  const failed = all.filter((r) => r.error || r.results.some((x) => x.status === 'changed' || x.status === 'resized'));

  if (argv.json) {
    console.log(JSON.stringify({ pass: failed.length === 0, islands: all }, null, 2));
    process.exit(failed.length === 0 ? 0 : 1);
  }

  console.log(color.bold(`\nmotu island snapshot — ${argv.update ? 'recording' : 'checking'} ${targets.length} island(s)\n`));
  for (const island of all) {
    if (island.error) {
      console.log(`  ${color.red('✗')} ${color.dim(island.kebab.padEnd(20))} ${color.red(island.error)}`);
      continue;
    }
    const changed = island.results.filter((r) => r.status === 'changed' || r.status === 'resized');
    const fresh = island.results.filter((r) => r.status === 'new' || r.status === 'recorded');
    const mark = changed.length ? color.red('✗') : fresh.length ? color.yellow('+') : color.green('✓');
    const tally = changed.length
      ? color.red(`${changed.length} changed`)
      : color.dim(`${island.results.length} shot(s)${fresh.length ? `, ${fresh.length} new` : ''}`);
    console.log(`  ${mark} ${color.dim(island.kebab.padEnd(20))} ${tally}`);
    for (const r of changed) {
      const detail =
        r.status === 'resized'
          ? `size ${r.from?.join('×')} → ${r.to?.join('×')}`
          : `${r.diffPixels} px (${(r.ratio * 100).toFixed(2)}%)`;
      console.log(`      ${color.red('✗')} ${color.dim(r.file.padEnd(28))} ${detail}`);
      console.log(`        ${color.dim(relative(process.cwd(), resolve(island.dir, r.file.replace(/\.png$/, '.diff.png'))))}`);
    }
    for (const f of island.orphans ?? []) {
      console.log(`      ${color.yellow('!')} ${color.dim(f.padEnd(28))} baseline with no scenario behind it`);
    }
  }
  console.log('');
  console.log(
    failed.length === 0
      ? color.green(color.bold('PASS')) + color.dim(argv.update ? '  baselines written' : '  every baseline matches')
      : color.red(color.bold('FAIL')) + color.dim(`  ${failed.length} island(s) changed — look at the .diff.png, then --update if intended`),
  );
  process.exit(failed.length === 0 ? 0 : 1);
}
