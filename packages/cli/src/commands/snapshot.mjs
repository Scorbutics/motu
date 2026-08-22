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
import { readRegions } from '../lib/eject.mjs';
import { readScenarios } from './verify.mjs';
import { changedScope } from '../lib/changed.mjs';
import { captureLagoon, captureRegionLagoon } from '../playwright-lagoon.mjs';
import { resolveBaselineHost, putShot, fetchShot, acceptShots, writeRemoteArtifacts } from '../lib/baselines.mjs';
import {
  compareBuffers,
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
  let viaNode = [];
  try {
    const mod = await import(`file://${file}?t=${Date.now()}`);
    viaNode = Array.isArray(mod.scenarios) ? mod.scenarios : [];
  } catch {
    /* handled by the cross-check below */
  }
  // TWO LOADERS FOR ONE FILE, and they disagree in silence — the exact failure `islandVerify` already
  // had to fix. A plain node import cannot resolve a `.js` specifier pointing at a `.ts` sibling,
  // which is the convention every evidence file here uses the moment it shares a fixture module. This
  // returned [] and the island was pictured ONCE, in its default state, while `data-flow` (which
  // loads through tsx) saw every scenario. Four new islands were baselined at half their coverage
  // before the shot count gave it away. Cross-check, and take the fuller answer.
  const viaTsx = readScenarios(file);
  return viaTsx.length > viaNode.length ? viaTsx : viaNode;
}

async function snapshotIsland(argv, kebab, host) {
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

    // THE HOST DECIDES. It knows what was accepted; this run only knows what it rendered. `new` is not
    // a failure — it is the first sight of a shot, waiting for someone to accept it.
    if (host) {
      let sent;
      try {
        sent = await putShot(host, kebab, file, shot.png);
      } catch (err) {
        return { kebab, error: err.message, results: [] };
      }
      if (sent.status !== 'changed') {
        results.push({ file, status: sent.status === 'match' ? 'match' : 'new', hash: sent.hash });
        continue;
      }
      // Differed: fetch the accepted bytes and show it, rather than report a percentage.
      const acceptedPng = await fetchShot(host, sent.accepted);
      const cmp = acceptedPng ? await compareBuffers(acceptedPng, shot.png) : { status: 'changed', diffPixels: 0, ratio: 1 };
      const artifact = writeRemoteArtifacts(kebab, file, shot.png, cmp.diff);
      results.push({ file, ...cmp, status: cmp.status === 'new' ? 'changed' : cmp.status, artifact });
      continue;
    }

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
  // Orphans are a question about FILES: with the host owning baselines there is nothing to be orphaned.
  const orphans = host ? [] : orphanBaselines(dir, shots.map((s) => snapshotName(s.scenario, s.viewport)));
  return { kebab, dir, results, orphans };
}


/**
 * Narrow a sweep to what this branch touched — the same flag, and the same discipline, as `motu check`.
 *
 * A full island sweep is 89s and a full region sweep 18s on a 20-island project, which is the cost of
 * a punctual gate, not of a loop. Scoped to one island and its region it is seconds, which is the
 * difference between a check an agent runs on the way past and one it learns to skip.
 *
 * NARROWING IS NEVER SILENT: `changedScope` widens back to everything the moment a file cannot be
 * attributed, and says why. And nothing examined is NOT a pass — a sweep that pictured no island
 * proves nothing about the project, so it exits 2 rather than printing green, the same rule this
 * repository keeps having to reinstate in whichever flag exists to examine less.
 */
function scopeTargets(argv, all, pick) {
  if (argv.changed === undefined) return { targets: all, scope: null };
  const scope = changedScope(typeof argv.changed === 'string' ? argv.changed : undefined);
  if (!scope.scoped) {
    console.log(color.dim(`  --changed: running everything — ${scope.reason}`));
    return { targets: all, scope };
  }
  return { targets: all.filter((id) => pick(scope).includes(id)), scope };
}

/** The shared verdict for a scoped run that found nothing to do. */
function nothingToPicture(kind) {
  console.log('');
  console.log(
    color.yellow(color.bold('NOTHING TO PICTURE')) +
      color.dim(`  no ${kind} changed — this run proves nothing about the project`),
  );
  process.exit(2);
}

export async function snapshotCommand(argv) {
  const name = argv._[0];
  const wantsHost = argv.remote !== undefined || argv.accept !== undefined;
  const host = wantsHost ? resolveBaselineHost(argv) : null;
  if (wantsHost && !host) {
    console.error(color.red('✗ no lagoon host — pass --remote <url>, set MOTU_HOST_URL, or write ~/.config/motu/host.json'));
    process.exit(1);
  }

  // ACCEPT IS ITS OWN ACT. Not a flag on a checking run: "the UI should look like this now" is a
  // decision, and running it as a side effect of a check is exactly what `--update` got wrong.
  if (argv.accept !== undefined) {
    const island = typeof argv.accept === 'string' ? names(argv.accept).kebab : name ? names(name).kebab : null;
    let out;
    try {
      out = await acceptShots(host, island);
    } catch (err) {
      console.error(color.red(`✗ ${err.message}`));
      process.exit(1);
    }
    if (argv.json) {
      console.log(JSON.stringify({ ok: true, ...out }, null, 2));
      process.exit(0);
    }
    console.log('');
    console.log(
      out.count
        ? `${color.green('✓')} accepted ${out.count} shot(s)\n${out.accepted.map((a) => color.dim(`  ${a}`)).join('\n')}`
        : color.dim('nothing to accept — every shot already matches what was accepted'),
    );
    process.exit(0);
  }

  if (!name && !argv.all) {
    console.error('usage: motu island snapshot <name|--all> [--update|--remote] [--accept] [--json]');
    process.exit(2);
  }
  if (host && argv.update) {
    console.error(color.red('✗ --update writes files; --remote stores on the host. Use --remote then --accept.'));
    process.exit(2);
  }
  const allIslands = listIslands(paths.islandsDir).map((i) => i.kebab);
  const { targets, scope } = argv.all
    ? scopeTargets(argv, allIslands, (sc) => sc.islands)
    : { targets: [names(name).kebab], scope: null };
  if (scope?.scoped) {
    console.log(color.dim(`  --changed: ${targets.length}/${allIslands.length} island(s) — from ${scope.files} changed file(s)`));
    if (!targets.length) nothingToPicture('island');
  }

  const all = [];
  for (const kebab of targets) all.push(await snapshotIsland(argv, kebab, host));

  const failed = all.filter((r) => r.error || r.results.some((x) => x.status === 'changed' || x.status === 'resized'));

  if (argv.json) {
    console.log(JSON.stringify({ pass: failed.length === 0, islands: all }, null, 2));
    process.exit(failed.length === 0 ? 0 : 1);
  }

  console.log(
    color.bold(
      `\nmotu island snapshot — ${argv.update ? 'recording' : 'checking'} ${targets.length} island(s)` +
        (host ? color.dim(`  against ${host.base} · ${host.id.repo}`) : '') +
        '\n',
    ),
  );
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
      // `--remote` writes its artifacts under `.motu/`, not beside the evidence — print where they
      // ACTUALLY are, or the one instruction this output gives points at a file that does not exist.
      const artifact = r.artifact ?? resolve(island.dir, r.file.replace(/\.png$/, '.diff.png'));
      console.log(`        ${color.dim(relative(process.cwd(), artifact))}`);
    }
    for (const f of island.orphans ?? []) {
      console.log(`      ${color.yellow('!')} ${color.dim(f.padEnd(28))} baseline with no scenario behind it`);
    }
  }
  console.log('');
  console.log(
    failed.length === 0
      ? color.green(color.bold('PASS')) + color.dim(argv.update ? '  baselines written' : '  every baseline matches')
      : color.red(color.bold('FAIL')) +
        color.dim(
          `  ${failed.length} island(s) changed — look at the .diff.png, then ` +
            (host ? '`motu island snapshot --accept <island>` if intended' : '`--update` if intended'),
        ),
  );
  process.exit(failed.length === 0 ? 0 : 1);
}


/**
 * The states a region can be pictured in — its flows' seeds.
 *
 * A region declares no `scenarios`; it declares FLOWS, and each one opens by seeding the state it
 * needs. That seed list is the honest answer to "which shapes does this page take", and it is the
 * answer to the case a single picture misses: an actions page with an empty week is a different PAGE,
 * not a different value. A shape no flow seeds is an evidence gap — the same finding `render-coverage`
 * makes — and closing it with a flow is worth doing for its own sake.
 */
async function regionStates(id) {
  const file = paths.archipelagoEvidence(id);
  if (!existsSync(file)) return [];
  try {
    const mod = await import(`file://${file}?t=${Date.now()}`);
    const flows = Array.isArray(mod.scenarios) ? mod.scenarios : [];
    const seen = new Set();
    const out = [];
    for (const f of flows) {
      const name = f.name ?? 'flow';
      // Two flows that start from the same state are one picture, not two.
      const key = JSON.stringify(f.seed ?? {});
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name, seed: f.seed ?? {} });
    }
    return out;
  } catch {
    // Evidence is TypeScript in most projects; node cannot load it. One picture of the default state
    // is still worth having — it just cannot be named after the flow that would have seeded it.
    return [];
  }
}

async function snapshotRegion(argv, id, host) {
  const viewports = lagoonViewports();
  const states = await regionStates(id);
  const port = 5300 + Math.floor(Math.random() * 400);
  const dir = snapshotDir(paths.archipelagosDir, id);

  let shots;
  try {
    shots = await captureRegionLagoon({ id, port, states, viewports });
  } catch (err) {
    return { kebab: id, error: err.message, results: [] };
  }

  const results = [];
  for (const shot of shots) {
    const file = snapshotName(shot.scenario, shot.viewport);
    if (host) {
      let sent;
      try {
        sent = await putShot(host, `region-${id}`, file, shot.png);
      } catch (err) {
        return { kebab: id, error: err.message, results: [] };
      }
      if (sent.status !== 'changed') {
        results.push({ file, status: sent.status === 'match' ? 'match' : 'new' });
        continue;
      }
      const acceptedPng = await fetchShot(host, sent.accepted);
      const cmp = acceptedPng ? await compareBuffers(acceptedPng, shot.png) : { status: 'changed', diffPixels: 0, ratio: 1 };
      const artifact = writeRemoteArtifacts(`region-${id}`, file, shot.png, cmp.diff);
      results.push({ file, ...cmp, status: cmp.status === 'new' ? 'changed' : cmp.status, artifact });
      continue;
    }
    const baseline = resolve(dir, file);
    if (argv.update) {
      writeBaseline(dir, file, shot.png);
      results.push({ file, status: existsSync(baseline) ? 'updated' : 'recorded' });
      continue;
    }
    const cmp = await compareSnapshot(baseline, shot.png);
    if (cmp.status === 'changed' || cmp.status === 'resized') writeFailureArtifacts(dir, file, shot.png, cmp.diff);
    else if (cmp.status === 'new') writeBaseline(dir, file, shot.png);
    results.push({ file, ...cmp });
  }
  return { kebab: id, dir, results, orphans: [], members: readRegions(paths.archipelagosDir).find((r) => r.id === id)?.islands ?? [] };
}


/**
 * `motu archipelago snapshot <id|--all>` — picture the composed page.
 *
 * ATTRIBUTION IS THE POINT, and it is what makes a page-level diff usable rather than noise. Any island
 * edit changes the region picture, so on its own this signal churns and people stop accepting it. But
 * the islands are separately baselined here, so a region diff can be explained: when a member island
 * changed too, the region changed BECAUSE of it. A region diff with NO member changed is an
 * ARRANGEMENT regression — the class no island shot can see, and the one that shipped once already.
 */
export async function archipelagoSnapshotCommand(argv) {
  const name = argv._[0];
  const wantsHost = argv.remote !== undefined || argv.accept !== undefined;
  const host = wantsHost ? resolveBaselineHost(argv) : null;
  if (wantsHost && !host) {
    console.error(color.red('✗ no lagoon host — pass --remote <url>, set MOTU_HOST_URL, or write ~/.config/motu/host.json'));
    process.exit(1);
  }
  if (argv.accept !== undefined) {
    const island = typeof argv.accept === 'string' ? `region-${argv.accept}` : name ? `region-${name}` : null;
    const out = await acceptShots(host, island).catch((err) => {
      console.error(color.red(`✗ ${err.message}`));
      process.exit(1);
    });
    console.log(out.count ? `${color.green('✓')} accepted ${out.count} shot(s)` : color.dim('nothing to accept'));
    process.exit(0);
  }
  if (!name && !argv.all) {
    console.error('usage: motu archipelago snapshot <id|--all> [--update|--remote] [--accept] [--json]');
    process.exit(2);
  }
  const allRegions = readRegions(paths.archipelagosDir).map((r) => r.id);
  // A changed ISLAND is a changed region here: the region's picture is its members composed, so an
  // island edit moves it even when no file under archipelagos/ was touched. `changedScope` already
  // maps islands to the regions that declare them.
  const { targets, scope } = argv.all ? scopeTargets(argv, allRegions, (sc) => sc.regions) : { targets: [name], scope: null };
  if (scope?.scoped) {
    console.log(color.dim(`  --changed: ${targets.length}/${allRegions.length} region(s) — from ${scope.files} changed file(s)`));
    if (!targets.length) nothingToPicture('region');
  }

  const all = [];
  for (const id of targets) all.push(await snapshotRegion(argv, id, host));

  // Which member islands ALSO differ, so a region diff can be explained instead of just reported.
  let changedIslands = new Set();
  let comparedIslands = new Set();
  if (host) {
    try {
      const res = await fetch(`${host.base}/api/baselines?repo=${encodeURIComponent(host.id.repo)}`);
      const body = await res.json();
      changedIslands = new Set(body.shots.filter((x) => x.status === 'changed').map((x) => x.island));
      // An island with NO accepted baseline can never report `changed`, so "no member changed" would
      // be true of an island nobody has ever compared. Claiming ARRANGEMENT on that is the check
      // reporting a conclusion it did not examine.
      comparedIslands = new Set(body.shots.filter((x) => x.accepted).map((x) => x.island));
    } catch {
      /* attribution is a nicety; its absence must not fail the run */
    }
  }

  const failed = all.filter((r) => r.error || r.results.some((x) => x.status === 'changed' || x.status === 'resized'));
  if (argv.json) {
    console.log(JSON.stringify({ pass: failed.length === 0, regions: all }, null, 2));
    process.exit(failed.length === 0 ? 0 : 1);
  }

  console.log(color.bold(`\nmotu archipelago snapshot — ${targets.length} region(s)${host ? color.dim(`  against ${host.base}`) : ''}\n`));
  for (const region of all) {
    if (region.error) {
      console.log(`  ${color.red('✗')} ${color.dim(region.kebab.padEnd(20))} ${color.red(region.error)}`);
      continue;
    }
    const changed = region.results.filter((r) => r.status === 'changed' || r.status === 'resized');
    const fresh = region.results.filter((r) => r.status === 'new' || r.status === 'recorded');
    const mark = changed.length ? color.red('✗') : fresh.length ? color.yellow('+') : color.green('✓');
    console.log(
      `  ${mark} ${color.dim(region.kebab.padEnd(20))} ` +
        (changed.length ? color.red(`${changed.length} changed`) : color.dim(`${region.results.length} shot(s)${fresh.length ? `, ${fresh.length} new` : ''}`)),
    );
    for (const r of changed) {
      const detail = r.status === 'resized' ? `size ${r.from?.join('×')} → ${r.to?.join('×')}` : `${r.diffPixels} px (${(r.ratio * 100).toFixed(2)}%)`;
      console.log(`      ${color.red('✗')} ${color.dim(r.file.padEnd(28))} ${detail}`);
      if (r.artifact) console.log(`        ${color.dim(relative(process.cwd(), r.artifact))}`);
    }
    if (changed.length) {
      const members = (region.members ?? []).map((m) => m.element?.replace(/^x-/, '') ?? '').filter(Boolean);
      const guilty = members.filter((k) => changedIslands.has(k));
      const uncompared = members.filter((k) => !comparedIslands.has(k));
      console.log(
        guilty.length
          ? color.dim(`        members that also changed: ${guilty.join(', ')} — the region changed because they did`)
          : uncompared.length
            ? color.dim(
                `        cannot attribute: ${uncompared.length}/${members.length} member(s) have no accepted baseline ` +
                  `(${uncompared.slice(0, 4).join(', ')}${uncompared.length > 4 ? '…' : ''}) — accept them and re-run to tell ` +
                  `an arrangement change from an island one`,
              )
            : color.yellow('        no member island changed — this is the ARRANGEMENT, which nothing else checks'),
      );
    }
  }
  console.log('');
  console.log(
    failed.length === 0
      ? color.green(color.bold('PASS'))
      : color.red(color.bold('FAIL')) + color.dim(`  ${failed.length} region(s) changed`),
  );
  process.exit(failed.length === 0 ? 0 : 1);
}
