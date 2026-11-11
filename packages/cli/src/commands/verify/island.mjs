// `motu island verify` — the command and the per-island run `check` composes.
// Split out of commands/verify.mjs; verify.mjs re-exports the public surface.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { listIslands } from '../../lib/islands.mjs';
import { LEGACY_FIT, islandComponentExport, islandComponentPath, names, paths } from '../../lib/util.mjs';
import { a11yCheck, adapterChecks, inputCoverageCheck, readScenarios, responsiveCheck, runtimeCheckBrowser, runtimeCheckFast, runtimeDifferentiationCheck, runtimeErrorCheck, seedTransportCheck } from './island-runtime.mjs';
import { configChecks, cssChecks, islandOwnCss, staticChecks } from './island-static.mjs';
import { reportBrowserOverride } from './reach.mjs';
import { makeReport, printReport, printSweep, setProgressScope, setVerbose, summaryOf, sweepExitCode, verifyExitCode } from './report.mjs';

export async function verifyCommand(argv) {
  const name = argv._[0];
  if (!name && !argv.all) {
    console.error('usage: motu island verify <name|--all> [--no-runtime] [--fast] [--standalone] [--json]');
    process.exit(2);
  }

  // --all: every island in the project, one after another. Sequential on purpose — each runtime check
  // boots a lagoon on its own port, and a CI box does not thank you for fourteen browsers at once.
  if (argv.all) {
    const islands = listIslands(paths.islandsDir);
    const results = [];
    for (const island of islands) results.push(await runIslandVerify(argv, island.kebab));
    if (argv.json) {
      console.log(JSON.stringify({ islands: results.map(summaryOf) }, null, 2));
    } else {
      printSweep('motu island verify — all islands', results);
    }
    process.exit(sweepExitCode(results));
  }

  const result = await runIslandVerify(argv, name);
  if (argv.json) {
    console.log(JSON.stringify({ island: result.kebab, tag: result.tag, pass: result.errors.length === 0, findings: result.report.findings }, null, 2));
  } else {
    printReport(result.report, `motu island verify — ${result.kebab} (${result.tag})`, result.errors, result.warns);
  }
  process.exit(verifyExitCode(result));
}

/** One island's checks, as data — printing and exiting belong to the caller (see `--all`). */
export async function runIslandVerify(argv, name) {
  setVerbose(argv?.verbose);
  const { pascal, kebab, tag } = names(name);
  setProgressScope(kebab);
  // Follow element.ts to the component it mounts: on a React host the island wraps a component the
  // app already owns, which does not live under ui/.
  const componentPath = islandComponentPath(kebab, pascal);
  // What the component is actually CALLED where it lives — see islandComponentExport.
  const componentName = islandComponentExport(kebab, pascal);
  const uiDir = paths.uiDir(kebab);
  const isReactIsland = existsSync(componentPath);
  // An AngularJS island has no React `.tsx` — its component is a `*.ng.ts` spec (in ui/<kebab>/).
  const isAdapterIsland =
    !isReactIsland &&
    existsSync(uiDir) &&
    readdirSync(uiDir).some((f) => f.endsWith('.ng.ts'));
  const report = makeReport();
  if (!isReactIsland && !isAdapterIsland) {
    report.error('component', `no island component at ${paths.rel(componentPath)}`);
    return { kebab, tag, report, errors: report.findings, warns: [] };
  }

  let componentProps = null;
  let resolvedTag = tag;
  if (isReactIsland) {
    componentProps = staticChecks(report, componentPath, componentName);
    resolvedTag = configChecks(report, kebab, componentName, tag, argv.standalone, componentProps, componentPath) ?? tag;
  } else {
    // A SKIP, NOT AN OK. This says the React-only checks did not run — which is the report model's own
    // definition of a skip ("a rule silently reported as passing is indistinguishable from a rule that
    // ran"). Reported as `ok` it added a green tick for checks that never happened.
    report.skip('adapter-island', `AngularJS island (no React component) — the React checks do not apply; running config-lite + adapter + runtime`);
  }

  // Adapter-owned checks (e.g. the AngularJS host-scope contract) fold in regardless of island kind.
  await adapterChecks(report, kebab, isReactIsland ? componentPath : null);

  // CSS lint of the island's OWN stylesheet if it owns one (opt-in; the shared sheet is linted at
  // region scope by `motu archipelago verify`).
  const ownCss = islandOwnCss(kebab);
  if (ownCss) cssChecks(report, readFileSync(ownCss, 'utf8'), paths.rel(ownCss));

  // OPT-IN, not default. `verify` answers "has this island drifted from what it declares?", and that
  // question is static: props against the component, contract against the generated one, imports,
  // registration. Everything below drives a real browser once per scenario × viewport, which is a
  // different question ("does it still behave?") and a different cost — a few seconds per island, so a
  // migrated project pays minutes for a check most edits do not need. It belongs in `--runtime`
  // (and in `motu check --runtime`), where someone asked for it.
  if (argv.runtime === true || argv.audit === true) {
    // Randomize the base port so parallel/back-to-back verifies don't collide on a strict port.
    let port = 5300 + Math.floor(Math.random() * 400);
    const fixturesPath = existsSync(paths.fixturesFile(kebab)) ? paths.fixturesFile(kebab) : '';
    // Reading the evidence costs a tsx spawn, so this rides with the tiers that already load it rather
    // than slowing the static sweep. It needs no browser and runs under `--fast` too.
    if (fixturesPath) inputCoverageCheck(report, readScenarios(fixturesPath));
    // The island lane drives a browser too, unless --fast put it under happy-dom.
    if (!argv.fast) reportBrowserOverride(report);
    // 'legacy' fit re-mounts the island under the host's legacy skin. Skip it where there is no
    // legacy skin — it would verify the same thing twice and double the wall clock.
    for (const fit of LEGACY_FIT ? ['native', 'legacy'] : ['native']) {
      if (argv.fast) {
        await runtimeCheckFast(report, resolvedTag, fixturesPath, fit);
      } else {
        await runtimeCheckBrowser(report, resolvedTag, fit, port++);
      }
    }
    // Error-resilience mount (real browser only; the happy-dom --fast path can't host the lagoon).
    if (!argv.fast) await runtimeErrorCheck(report, resolvedTag, port++);
    // A seed only helps if it SURVIVES the trip. Checked before the checks that use one, because
    // every one of them fails misleadingly otherwise.
    if (!argv.fast) await seedTransportCheck(report, kebab);
    // Data-flow differentiation (opt-in via declared `scenarios`).
    await runtimeDifferentiationCheck(report, resolvedTag, fixturesPath, port++, Boolean(argv.fast));
    // Every declared viewport — the phone included, which nothing checked before.
    // AUDIT, not dev loop. Layout at every viewport and axe over every scenario answer "is this fit
    // for people", which changes when the RENDERING changes — not on the edit that moved a key. They
    // are the two most expensive per-island checks and they belong where their answer is acted on:
    // before integrating, and in CI as a non-regression gate. `--audit` asks for them.
    if (!argv.fast && argv.audit) await responsiveCheck(report, resolvedTag, kebab, port++);
    // Accessibility, in the browser that is already open.
    if (!argv.fast && argv.audit) await a11yCheck(report, resolvedTag, kebab, port++);
    if (!argv.fast && !argv.audit) {
      report.skip('audit', 'responsive + a11y not run — they are the `--audit` gate (before integrating, and in CI)');
    }
  }

  return {
    kebab,
    tag: resolvedTag,
    report,
    errors: report.findings.filter((f) => f.level === 'error'),
    warns: report.findings.filter((f) => f.level === 'warn'),
  };
}
