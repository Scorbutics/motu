// `motu check` — one gate, one verdict: is the project's motu wiring still sound?
//
// Deliberately scoped to what MOTU owns. It does not run the host's typecheck or linter: those are the
// host's tools, configured by the host, and a framework that shells out to them has taken an opinion
// about a build it knows nothing about (the reference ocean is not even a node app). The host composes:
//
//   <host build> && motu check
//
// The one apparent exception is removal-check, which does run the host's typecheck — but that IS its
// subject: "the app still compiles without motu" cannot be answered any other way.
//
// Static by default, because this is meant to run on every change. `--runtime` adds the lagoon mounts
// (a browser per island), which belongs in CI or before a release, not in a tight loop.
import { screenFindings } from '../lib/screens.mjs';
import { worldFindings } from '../lib/worlds.mjs';
import { screenRuntimeFindings } from './verify/screens-runtime.mjs';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { readLiveUrl } from '../lib/live-url.mjs';
import { resolve } from 'node:path';
import { color, paths, hostStrictBoundaries } from '../lib/util.mjs';
import { listIslands } from '../lib/islands.mjs';
import { changedScope } from '../lib/changed.mjs';
import { profiledMs, runIslandVerify, runArchipelagoVerify, summaryOf, printSweep, sweepExitCode } from './verify.mjs';
import { ejectedEntryGaps, resolveLagoonRoot } from '../lib/lagoon-materialize.mjs';
import { runRemovalCheck } from './removal-check.mjs';
import { contractsDrift } from '../lib/contracts.mjs';
import { renderCoverageModule, COVERAGE_MODULE } from '../lib/archipelagos.mjs';
import { integrationResults } from './integration.mjs';
import { unchangedSinceLastRun } from '../lib/finding-memory.mjs';
import { names, islandComponentPath, islandComponentExport } from '../lib/util.mjs';
import { readRegions } from '../lib/eject.mjs';
import { loadMotuConfig } from '../lib/config.mjs';
import { projectFingerprints } from '../lib/fingerprint.mjs';
import { runtimeMode } from './verify/island.mjs';
import { readScenariosFor } from './verify/region-flows.mjs';
import { laneCount, runOnWorkers, workerMain } from '../lib/check-workers.mjs';
import { cachePolicy, lookupVerdict } from '../lib/verdict-cache.mjs';

/** Is `contracts.generated.ts` what the components say it should be? */
function islands0Drift() {
  const util = { names, islandComponentPath, islandComponentExport };
  const d = contractsDrift(paths.islandsDir, util);
  if (d.missing) return { stale: true, reason: 'contracts.generated.ts is missing' };
  if (d.drifted) return { stale: true, reason: 'a component changed since the contracts were generated' };
  return { stale: false, reason: null };
}

/**
 * Is `coverage.generated.ts` what motu.config.json says it should be?
 *
 * The same question `islands0Drift` asks, for the region side. It matters more here than it looks:
 * the file's whole job is a SIDE EFFECT, so a stale one does not fail to compile, does not fail a
 * type check, and does not fail to import. It quietly configures the wrong thing — or nothing — and
 * the only symptom is coverage that never records, which is indistinguishable from a region nobody
 * has visited.
 */
function coverageDrift() {
  const file = resolve(paths.archipelagosDir, COVERAGE_MODULE);
  const want = renderCoverageModule(paths.coverage);
  // ABSENT IS FINE WHEN COVERAGE IS OFF, and demanding it otherwise was wrong. A project that never
  // enabled coverage has no generated module and no import of one — a perfectly consistent state, and
  // failing it would make every existing project red until somebody ran a command that changes
  // nothing. The file becomes required the moment it is switched on, or the moment one exists.
  if (!existsSync(file)) {
    return paths.coverage?.enabled
      ? { stale: true, reason: `${COVERAGE_MODULE} is missing — run \`motu sync\`` }
      : { stale: false, reason: null };
  }
  if (readFileSync(file, 'utf8') !== want)
    return { stale: true, reason: `${COVERAGE_MODULE} does not match motu.config.json — run \`motu sync\`` };
  return { stale: false, reason: null };
}

export async function checkCommand(argv) {
  // A LANE of a parallel runtime sweep — driven over IPC by the parent (lib/check-workers.mjs).
  if (argv.worker) return workerMain();
  const startedAt = Date.now();
  // `--runtime` opts IN, the same way it does for a single `verify` — the sub-checks read the flag
  // directly, so this only has to pass it through.
  // SCOPED RUNTIME: `--region <id>[,<id>]` and `--island <name>[,<name>]` drive the browser for what
  // they name — a region brings its member islands — and keep the STATIC checks over everything. The
  // full `--runtime` sweep belongs to CI; the scoped one is what you run on the region you just built.
  const scope = runtimeScope(argv);
  if (scope?.unknown.length) {
    console.error(
      color.red(`motu check: no such ${scope.unknown.map((u) => `${u.kind} "${u.id}"`).join(', ')}`) +
        color.dim(` — regions: ${scope.allRegions.join(', ') || '(none)'}`),
    );
    process.exit(2);
  }
  // `--audit` implies `--runtime`: asking whether the UI is usable at every viewport, for everyone,
  // only means anything against something that rendered. A scope implies it too.
  const audit = argv.audit === true;
  const runtime = argv.runtime === true || Boolean(scope);
  const sub = { ...argv, runtime: runtime || audit, audit, fast: argv.fast };
  const staticOnly = { ...argv, runtime: false, audit: false };
  const inScope = (kind, id) => !scope || scope[kind].has(id);

  // ONE graph pass for the whole run (~2s on 80 islands + 24 regions): every runtime verdict is keyed
  // on it, and so is every evidence read — which is what makes the static sweep cheap on a warm tree.
  await projectFingerprints({ mode: runtimeMode(sub) }).catch(() => null);

  // The generated half, first and cheaply: every island's contract is READ from its component, so the
  // only way it can be wrong is by being stale. One comparison answers that for the whole project.
  const drift = islands0Drift();
  const regionDrift = coverageDrift();
  const allIslands = listIslands(paths.islandsDir);

  // `--changed`: verify what this branch touched. Widens back to everything the moment a change
  // cannot be attributed to one island or region, and says so — a run that is fast because it skipped
  // your change is worse than a slow one.
  const changed = argv.changed ? changedScope(typeof argv.changed === 'string' ? argv.changed : undefined) : null;
  if (changed && !changed.scoped) {
    console.log(color.dim(`  --changed: running everything — ${changed.reason}`));
  }
  const islands = changed?.scoped ? allIslands.filter((i) => changed.islands.includes(i.kebab)) : allIslands;

  const regionIds = existsSync(paths.archipelagosDir)
    ? readdirSync(paths.archipelagosDir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && existsSync(paths.archipelagoFile(e.name)))
        .map((e) => e.name)
    : [];
  // A touched ISLAND is a touched region too: its contract is what the region declares against.
  const regionsToRun = changed?.scoped ? regionIds.filter((id) => changed.regions.includes(id)) : regionIds;

  // THE PLAN, then the run. Every target that will actually DRIVE a browser — runtime asked for, and
  // no clean verdict to replay — can go to a lane of its own (lib/check-workers.mjs); static ones and
  // replays are milliseconds and stay here. Results come back in the order the plan lists them.
  const plan = [
    ...islands.map((i) => ({ kind: 'island', id: i.kebab, argv: inScope('islands', i.kebab) ? sub : staticOnly })),
    ...regionsToRun.map((id) => ({ kind: 'region', id, argv: inScope('regions', id) ? sub : staticOnly })),
  ];
  const drives = await drivingTasks(plan);
  const lanes = laneCount(argv, drives.length);
  const remote = lanes > 1 ? await laneResults(drives, lanes, argv) : new Map();
  const islandResults = [];
  const regionResults = [];
  for (const t of plan) {
    const r =
      remote.get(`${t.kind}:${t.id}`) ??
      (t.kind === 'island' ? await runIslandVerify(t.argv, t.id) : await runArchipelagoVerify(t.argv, t.id));
    (t.kind === 'island' ? islandResults : regionResults).push(r);
  }
  if (changed?.scoped) {
    console.log(
      color.dim(
        `  --changed: ${islands.length}/${allIslands.length} island(s), ` +
          `${regionsToRun.length}/${regionIds.length} region(s) — from ${changed.files} changed file(s)`,
      ),
    );
    // NOTHING CHECKED IS NOT A PASS. `--changed` with no changes verified zero islands and printed
    // green — the same "a check that examined nothing has not passed" rule this project keeps
    // relearning, reproduced in the flag whose whole purpose is to examine less.
    if (!islands.length && !regionsToRun.length) {
      console.log('');
      console.log(
        color.yellow(color.bold('NOTHING TO CHECK')) +
          color.dim('  no island or region changed — this run proves nothing about the project'),
      );
      process.exit(2);
    }
  }

  // AN EJECTED ENTRY DOES NOT FOLLOW THE FRAMEWORK, and nothing said so until now. `lagoon eject`
  // hands the project its entry and stops regenerating it, which is the point — and it means every
  // option added to the scaffold afterwards reaches that project only if somebody copies it down.
  // Twice in this repo's own demo-app the answer was "nobody did": `evidence` (every declared state
  // unreachable in a browser) and `lens.onPicked` (the crosshair could not scope). Both silent.
  const gaps = ejectedEntryGaps(paths);
  if (gaps) {
    console.log(color.bold('\nmotu check — ejected entry\n'));
    if (!gaps.missing.length) {
      console.log(`  ${color.green('✓')} ${color.dim('entry-current'.padEnd(20))}${color.dim(`${gaps.entry} passes every option the scaffold does`)}`);
    } else {
      // A WARNING: an entry may legitimately drop an option (a project with no frames, say), and a
      // check that turns an ejected project red for exercising the escape hatch it was given is one
      // people switch off. What it cannot do is stay quiet.
      console.log(
        `  ${color.yellow('!')} ${color.dim('entry-current'.padEnd(20))}` +
          `${gaps.entry} never mentions ${gaps.missing.map((m) => `\`${m}\``).join(', ')} — ` +
          color.dim('the scaffold passes these; an ejected entry only gets them by hand'),
      );
    }
  }

  // The LAST MILE. Everything above looks at motu's own files, so all of it can be green while the
  // application composes none of it — which is exactly how a region can verify for a day without a
  // browser ever rendering it. Static, cheap, and it belongs in the same verdict.
  const integration = integrationResults();
  // EXPERIMENTAL: the declared screens, and whether every navigation a region asks for goes somewhere.
  // Null when the project declares no screens — then the section is not printed at all.
  const screens = screenFindings();
  // AT RUNTIME, the screens are opened too: the app's own layout makes calls no region's flow does
  // (Peps' badge counts and feature grants), and screen flows click its links and navigate.
  // Project-wide, so not part of a scoped run — which says so below.
  if (screens && (runtime || audit) && !scope) screens.findings.push(...((await screenRuntimeFindings()) ?? []));
  const screensOk = !screens || screens.findings.every((f) => f.level !== 'error');
  // WORLDS: every name resolves, every world has a caller, nothing pins a source's key. Null (and not
  // printed) when the project declares none.
  const worlds = worldFindings();
  const worldsOk = !worlds || worlds.findings.every((f) => f.level !== 'error');

  // Last, and only when the rest holds up: it rewrites the host on disk (and restores it), so running
  // it after a failure that is already fatal buys nothing and costs a typecheck of the whole app.
  const integrationOk = integration.every((r) => r.findings.every((f) => f.level !== 'error'));
  // Integration is deliberately NOT part of this: removal-check asks whether the app compiles WITHOUT
  // motu, and a region the host has not adopted yet is the easiest case for that surgery, not a reason
  // to skip it. Only broken wiring makes the rewrite pointless.
  const structureOk =
    !drift.stale &&
    !regionDrift.stale &&
    islandResults.every((r) => r.errors.length === 0) &&
    regionResults.every((r) => r.errors.length === 0);
  const removal = structureOk ? await runRemovalCheck(argv, { quiet: true }) : null;

  const pass = structureOk && integrationOk && screensOk && worldsOk && (removal?.pass ?? false);
  // COULD NOT RUN, across the sweep: a member whose runtime checks were inconclusive has not passed,
  // and `pass` above only counts errors — so `motu check --runtime` printed PASS and exited 0 over a
  // region whose flows never ran. Nothing contradicted is still not "holds": exit 2, retry.
  const unrun = sweepExitCode([...islandResults, ...regionResults]) === 2;
  const exitCode = pass ? (unrun ? 2 : 0) : 1;

  if (argv.json) {
    console.log(
      JSON.stringify(
        {
          pass,
          runtime,
          runtimeScope: scope ? { regions: [...scope.regions], islands: [...scope.islands] } : null,
          replayed: runtimeTally(islandResults, regionResults).replayed,
          contracts: drift,
          islands: islandResults.map(summaryOf),
          archipelagos: regionResults.map(summaryOf),
          integration,
          screens: screens?.findings ?? null,
          worlds: worlds?.findings ?? null,
          removal: removal ?? { skipped: 'structure checks failed first' },
          inconclusive: unrun,
        },
        null,
        2,
      ),
    );
    process.exit(exitCode);
  }

  console.log(color.bold('\nmotu check — contracts\n'));
  {
    // The mechanical half of `default-props`: an island must render from defaults alone, which means
    // the EMPTY case too, and `strict` alone lets `list[0].x` compile. Audited, never enforced — the
    // host owns its build. Unknown is silent: a project with no tsconfig gets no finding.
    const b = hostStrictBoundaries();
    if (b.known && !b.enabled)
      console.log(
        `  ${color.yellow('!')} ${color.dim('strict-boundaries'.padEnd(20))}` +
          `${color.yellow('noUncheckedIndexedAccess is off')} in ${paths.rel(b.file)} — \`list[0].x\` on a list that can be ` +
          `empty compiles under \`strict\` and throws in the browser, which is a bug this project has already shipped once. ` +
          `Turning it on makes forgetting a compile error; scope it to a tsconfig over the island + ui files if the ` +
          `app-wide flip is too large today.`,
      );
    else if (b.known)
      console.log(
        `  ${color.green('✓')} ${color.dim('strict-boundaries'.padEnd(20))}${color.dim('noUncheckedIndexedAccess is on — an unguarded index is a compile error')}`,
      );
  }
  console.log(
    drift.stale
      ? `  ${color.red('✗')} ${color.dim('generated'.padEnd(20))} ${color.red(drift.reason)} — run \`motu sync\``
      : `  ${color.green('✓')} ${color.dim('generated'.padEnd(20))}${color.dim('every island contract matches its component')}`,
  );
  // THE REGION SIDE, which fails silently in a way the island side does not. `coverage.generated.ts`
  // exists for a side effect, so a stale one still compiles, still type-checks and still imports —
  // it just configures the wrong thing, and the symptom is coverage that never records, which looks
  // exactly like a region nobody has visited.
  console.log(
    regionDrift.stale
      ? `  ${color.red('✗')} ${color.dim('region-generated'.padEnd(20))} ${color.red(regionDrift.reason)}`
      : `  ${color.green('✓')} ${color.dim('region-generated'.padEnd(20))}${color.dim(
          paths.coverage?.enabled
            ? 'coverage config matches motu.config.json'
            : existsSync(resolve(paths.archipelagosDir, COVERAGE_MODULE))
              ? 'coverage off, and nothing names @motujs/coverage'
              : 'coverage off, and no generated module to keep in step',
        )}`,
  );

  printSweep('motu check — islands', islandResults);
  printSweep('motu check — regions', regionResults);
  console.log(color.bold('\nmotu check — integration\n'));
  for (const r of integration) {
    const errs = r.findings.filter((f) => f.level === 'error');
    const warns = r.findings.filter((f) => f.level === 'warn');
    const mark = errs.length ? color.red('✗') : warns.length ? color.yellow('!') : color.green('✓');
    console.log(
      `  ${mark} ${color.dim(r.id.padEnd(20))}` +
        color.dim(errs.length ? `${errs.length} error(s)${warns.length ? `, ${warns.length} warning(s)` : ''}` : warns.length ? `${warns.length} warning(s)` : 'composed, mounted, placed, read'),
    );
    for (const f of [...errs, ...warns]) {
      const again = unchangedSinceLastRun(f) ? color.dim('  · unchanged') : '';
      console.log(`      ${f.level === 'error' ? color.red('✗') : color.yellow('!')} ${color.dim(f.check.padEnd(12))} ${f.msg}${again}`);
    }
  }

  if (screens) {
    console.log(color.bold('\nmotu check — screens') + color.dim('  (experimental)') + '\n');
    for (const f of screens.findings) {
      const mark = f.level === 'error' ? color.red('✗') : f.level === 'warn' ? color.yellow('!') : f.level === 'ok' ? color.green('✓') : color.dim('–');
      console.log(`  ${mark} ${color.dim(f.check.padEnd(20))}${f.level === 'ok' ? color.dim(f.msg) : f.msg}`);
    }
  }

  if (worlds) {
    console.log(color.bold('\nmotu check — worlds') + color.dim(`  ${worlds.worlds.length} declared in ${paths.rel(worlds.file)}`) + '\n');
    for (const f of worlds.findings) {
      const mark = f.level === 'error' ? color.red('✗') : f.level === 'warn' ? color.yellow('!') : f.level === 'ok' ? color.green('✓') : color.dim('–');
      console.log(`  ${mark} ${color.dim(f.check.padEnd(20))}${f.level === 'ok' ? color.dim(f.msg) : f.msg}`);
    }
  }

  console.log(color.bold('\nmotu check — removal\n'));
  if (!removal) {
    console.log(`  ${color.dim('–')} ${color.dim('skipped'.padEnd(20))} ${color.dim('structure checks failed first')}`);
  } else if (removal.skipped) {
    // A SKIP, NOT A TICK. The project declared `removable: false`, so nothing was examined — and
    // rendering that as `✓ removable  0 deleted, 0 unwrapped` is a green light from an empty search,
    // which is the exact failure this command was rewritten to stop reporting about itself.
    console.log(
      `  ${color.dim('–')} ${color.dim('removable'.padEnd(20))} ` +
        color.dim('not claimed — the project declares `removable: false`, so motu is meant to be load-bearing here'),
    );
  } else if (removal.pass) {
    const ejected = removal.ejected.reduce((n, e) => n + e.notes.length, 0);
    console.log(
      `  ${color.green('✓')} ${color.dim('removable'.padEnd(20))}` +
        color.dim(
          `${removal.deleted.length} deleted, ${removal.stripped.length} unwrapped, ${ejected} ejected` +
            // Say when it was not re-proved. A cached verdict is still a verdict, but a reader has to
            // know which one they are looking at.
            (removal.cached ? ' · unchanged since the last proof' : ''),
        ),
    );
  } else {
    console.log(`  ${color.red('✗')} ${color.dim('load-bearing'.padEnd(20))} ${color.red('the host does not compile without motu')}`);
    for (const line of removal.errors.slice(0, 5)) console.log(`      ${color.dim(line)}`);
  }

  console.log('');
  // WHAT THE PROFILE MISSED, said out loud. Timed steps are not a partition of the run — boot, the
  // static passes and anything nobody wrapped live in the gap — and a parts list that hides the
  // remainder gets you optimising the wrong half. This printed 13.8s of 31.8 once, every line precise.
  if (argv.verbose) {
    const wall = Date.now() - startedAt;
    const profiled = profiledMs();
    const rest = Math.max(0, wall - profiled);
    console.log(
      color.dim(
        `  profiled ${(profiled / 1000).toFixed(1)}s of ${(wall / 1000).toFixed(1)}s · ` +
          `${(rest / 1000).toFixed(1)}s (${Math.round((rest / wall) * 100)}%) outside any timed step`,
      ),
    );
  }
  // WHAT THE RUNTIME HALF ACTUALLY DID, on the line before the verdict — scoped, replayed or re-proved.
  if (runtime || audit) {
    const t = runtimeTally(islandResults, regionResults);
    const parts = [`${t.proved} re-proved`, `${t.replayed} replayed (inputs unchanged)`];
    if (scope) parts.push(`${t.staticOnly} static only (outside --region/--island)`);
    console.log(color.dim(`  runtime: ${parts.join(' · ')}${t.replayed ? ' — --no-cache re-proves all' : ''}`));
    if (scope) console.log(color.dim('  scoped: the full runtime sweep is CI\'s (`motu check --runtime`); screens were not opened'));
  }
  console.log(
    pass && unrun
      ? color.yellow(color.bold('INCONCLUSIVE')) +
        color.dim('  nothing contradicted, but some checks could not run (`?` above) — retry, do not repair')
      : pass
      ? color.green(color.bold('PASS')) +
        color.dim(
          `  ${islandResults.length} island(s), ${regionResults.length} region(s)` +
            // Only claim removability when it was actually proved. The verdict line is the one thing
            // a reader takes away, and "removable" on a run that never examined the host is the same
            // empty-search claim the line above it was just fixed to stop making.
            (removal?.skipped ? '' : ', removable'),
        )
      : color.red(color.bold('FAIL')) + color.dim('  see above'),
  );
  // WHAT THIS VERDICT DOES NOT COVER, said on the line a reader actually takes away.
  //
  // motu checks composition: that a region's islands are placed, that a declared coupling carries,
  // that every state renders. It runs no typecheck and no test runner, deliberately — and an agent
  // reading a green PASS has no way to know that from the output. Measured: a defect-detection
  // experiment injected eight regressions, six of them ordinary logic errors inside a component body,
  // and motu was scored as having "missed" them. It had not missed them; it had never been asked.
  //
  // A flow also emits an island's DECLARED OUTPUT rather than acting on the UI, so a bug between a
  // user's action and that declaration — a handler that ignores its argument — passes every flow. The
  // instrument for that is a unit test, and saying so here is cheaper than the confusion is.
  console.log(
    color.dim('  motu checks composition. Your typecheck and unit tests are yours and are not run here:'),
  );
  console.log(color.dim('  a logic bug inside a component, or a handler that drops its argument, passes every check above.'));
  // AND WHERE TO LOOK AT IT. `check` is the verdict an agent reads and quotes; without this line the
  // handover is a summary of files and nobody has opened the region the work is for.
  const live = readLiveUrl();
  console.log(live ? color.dim('  look at it: ') + live : color.dim('  no live lagoon — start one with: motu lagoon serve --watch --detach'));
  process.exit(exitCode);
}

/**
 * The targets of `plan` that will drive a browser: runtime asked for, and no clean verdict to replay.
 * Each carries a rough COST so the lanes start on the long ones — a region's lane is its flows times
 * the islands null-island replays them against; an island is one unit.
 */
async function drivingTasks(plan) {
  const out = [];
  for (const t of plan) {
    if (!(t.argv.runtime || t.argv.audit)) continue;
    if (t.kind === 'region' && t.argv.fast) continue; // --fast skips every region runtime check
    const mode = runtimeMode(t.argv);
    const fps = await projectFingerprints({ mode });
    const fp = t.kind === 'island' ? fps.island(t.id) : fps.region(t.id);
    if (lookupVerdict(`${t.kind}-${mode}`, t.id, fp?.fp, cachePolicy(t.argv))) continue;
    let cost = 1;
    if (t.kind === 'region') {
      const region = readRegions(paths.archipelagosDir).find((r) => r.id === t.id);
      cost = 5 + readScenariosFor(t.id).length * ((region?.islands?.length ?? 0) + 1);
    }
    out.push({ ...t, cost });
  }
  return out;
}

/** Run the driving targets on `lanes` workers, after materialising the lagoon once, here. */
async function laneResults(drives, lanes, argv) {
  // One writer for the generated lagoon entry: every lane would otherwise race to render it.
  resolveLagoonRoot(loadMotuConfig());
  if (!argv.json) console.log(color.dim(`  runtime: ${drives.length} target(s) to drive, on ${lanes} lanes (--jobs 1 for one)`));
  return runOnWorkers(drives, lanes, { verbose: Boolean(argv.verbose) });
}

/** How many runtime verdicts were driven, replayed, or not asked for. */
function runtimeTally(islandResults, regionResults) {
  const all = [...islandResults, ...regionResults];
  const replayed = all.filter((r) => r.cached).length;
  const proved = all.filter((r) => r.runtimeRan && !r.cached).length;
  return { replayed, proved, staticOnly: all.length - replayed - proved };
}

/**
 * `--region a,b --island x`: which runtime targets a scoped run drives. Null when none is named.
 * A region brings its member islands, because a region's picture is its members composed.
 */
export function runtimeScope(argv) {
  const list = (v) => (typeof v === 'string' ? v.split(',').map((x) => x.trim()).filter(Boolean) : []);
  const wantRegions = list(argv.region);
  const wantIslands = list(argv.island);
  if (!wantRegions.length && !wantIslands.length) {
    if (argv.region === true || argv.island === true) {
      console.error(color.red('motu check: --region / --island need a name (comma-separated for several)'));
      process.exit(2);
    }
    return null;
  }
  const all = readRegions(paths.archipelagosDir);
  const kebabs = listIslands(paths.islandsDir).map((i) => i.kebab);
  const unknown = [];
  const regions = new Set();
  const islands = new Set();
  for (const id of wantRegions) {
    const r = all.find((x) => x.id === id);
    if (!r) {
      unknown.push({ kind: 'region', id });
      continue;
    }
    regions.add(id);
    for (const i of r.islands ?? []) {
      const k = kebabs.find((kb) => names(kb).tag === i.element);
      if (k) islands.add(k);
    }
  }
  for (const k of wantIslands) {
    if (kebabs.includes(k)) islands.add(k);
    else unknown.push({ kind: 'island', id: k });
  }
  return { regions, islands, unknown, allRegions: all.map((r) => r.id) };
}
