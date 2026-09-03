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
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { color, paths, hostStrictBoundaries } from '../lib/util.mjs';
import { listIslands } from '../lib/islands.mjs';
import { changedScope } from '../lib/changed.mjs';
import { profiledMs, runIslandVerify, runArchipelagoVerify, summaryOf, printSweep } from './verify.mjs';
import { ejectedEntryGaps } from '../lib/lagoon-materialize.mjs';
import { runRemovalCheck } from './removal-check.mjs';
import { contractsDrift } from '../lib/contracts.mjs';
import { renderCoverageModule, COVERAGE_MODULE } from '../lib/archipelagos.mjs';
import { integrationResults } from './integration.mjs';
import { unchangedSinceLastRun } from '../lib/finding-memory.mjs';
import { names, islandComponentPath, islandComponentExport } from '../lib/util.mjs';

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
      ? { stale: true, reason: `${COVERAGE_MODULE} is missing — run \`motu archipelago sync\`` }
      : { stale: false, reason: null };
  }
  if (readFileSync(file, 'utf8') !== want)
    return { stale: true, reason: `${COVERAGE_MODULE} does not match motu.config.json — run \`motu archipelago sync\`` };
  return { stale: false, reason: null };
}

export async function checkCommand(argv) {
  const startedAt = Date.now();
  // `--runtime` opts IN, the same way it does for a single `verify` — the sub-checks read the flag
  // directly, so this only has to pass it through.
  const runtime = argv.runtime === true;
  // `--audit` implies `--runtime`: asking whether the UI is usable at every viewport, for everyone,
  // only means anything against something that rendered.
  const audit = argv.audit === true;
  const sub = { ...argv, runtime: runtime || audit, audit, fast: argv.fast };

  // The generated half, first and cheaply: every island's contract is READ from its component, so the
  // only way it can be wrong is by being stale. One comparison answers that for the whole project.
  const drift = islands0Drift();
  const regionDrift = coverageDrift();
  const allIslands = listIslands(paths.islandsDir);

  // `--changed`: verify what this branch touched. Widens back to everything the moment a change
  // cannot be attributed to one island or region, and says so — a run that is fast because it skipped
  // your change is worse than a slow one.
  const scope = argv.changed ? changedScope(typeof argv.changed === 'string' ? argv.changed : undefined) : null;
  if (scope && !scope.scoped) {
    console.log(color.dim(`  --changed: running everything — ${scope.reason}`));
  }
  const islands = scope?.scoped ? allIslands.filter((i) => scope.islands.includes(i.kebab)) : allIslands;

  const islandResults = [];
  for (const island of islands) islandResults.push(await runIslandVerify(sub, island.kebab));

  const regionIds = existsSync(paths.archipelagosDir)
    ? readdirSync(paths.archipelagosDir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && existsSync(paths.archipelagoFile(e.name)))
        .map((e) => e.name)
    : [];
  // A touched ISLAND is a touched region too: its contract is what the region declares against.
  const regionsToRun = scope?.scoped ? regionIds.filter((id) => scope.regions.includes(id)) : regionIds;
  const regionResults = [];
  for (const id of regionsToRun) regionResults.push(await runArchipelagoVerify(sub, id));

  if (scope?.scoped) {
    console.log(
      color.dim(
        `  --changed: ${islands.length}/${allIslands.length} island(s), ` +
          `${regionsToRun.length}/${regionIds.length} region(s) — from ${scope.files} changed file(s)`,
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

  const pass = structureOk && integrationOk && (removal?.pass ?? false);

  if (argv.json) {
    console.log(
      JSON.stringify(
        {
          pass,
          runtime,
          contracts: drift,
          islands: islandResults.map(summaryOf),
          archipelagos: regionResults.map(summaryOf),
          integration,
          removal: removal ?? { skipped: 'structure checks failed first' },
        },
        null,
        2,
      ),
    );
    process.exit(pass ? 0 : 1);
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
      ? `  ${color.red('✗')} ${color.dim('generated'.padEnd(20))} ${color.red(drift.reason)} — run \`motu island sync\``
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
              ? 'coverage off, and nothing names @motu/coverage'
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
        color.dim(errs.length ? `${errs.length} error(s)` : warns.length ? `${warns.length} warning(s)` : 'composed, mounted, placed, read'),
    );
    for (const f of [...errs, ...warns]) {
      const again = unchangedSinceLastRun(f) ? color.dim('  · unchanged') : '';
      console.log(`      ${f.level === 'error' ? color.red('✗') : color.yellow('!')} ${color.dim(f.check.padEnd(12))} ${f.msg}${again}`);
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
  console.log(
    pass
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
  process.exit(pass ? 0 : 1);
}
