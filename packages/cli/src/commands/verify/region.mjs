// `motu archipelago verify` — the command and the per-region run `check` composes.
// Split out of commands/verify.mjs; verify.mjs re-exports the public surface.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { readRegions } from '../../lib/eject.mjs';
import { conditionalSlots } from '../../lib/lagoon-declares.mjs';
import { paths } from '../../lib/util.mjs';
import { pageRenderLagoon, runArchipelagoLagoon } from '../../playwright-lagoon.mjs';
import { cssChecks } from './island-static.mjs';
import { declaredReach, reportBrowserOverride, reportRuntimeDiagnostics } from './reach.mjs';
import { frameIsPageCheck } from './region-composition.mjs';
import { archipelagoConfigChecks } from './region-config.mjs';
import { catalogueCheck, regionFlowCheck, renderCoverageCheck, wiringProbe, writesCoveredCheck } from './region-flows.mjs';
import { channelSourceCheck, regionAuditCheck, regionRefCheck } from './region-sources.mjs';
import { environmentalCause, makeReport, printReport, printSweep, setProgressScope, setVerbose, step, summaryOf, sweepExitCode, verifyExitCode } from './report.mjs';

export async function archipelagoVerifyCommand(argv) {
  const id = argv._[0];
  if (!id && !argv.all) {
    console.error('usage: motu archipelago verify <id|--all> [--no-runtime] [--json]');
    process.exit(2);
  }

  if (argv.all) {
    const ids = existsSync(paths.archipelagosDir)
      ? readdirSync(paths.archipelagosDir, { withFileTypes: true })
          .filter((e) => e.isDirectory() && existsSync(paths.archipelagoFile(e.name)))
          .map((e) => e.name)
      : [];
    const results = [];
    for (const one of ids) results.push(await runArchipelagoVerify(argv, one));
    if (argv.json) {
      console.log(JSON.stringify({ archipelagos: results.map(summaryOf) }, null, 2));
    } else {
      printSweep('motu archipelago verify — all regions', results);
    }
    process.exit(sweepExitCode(results));
  }

  const result = await runArchipelagoVerify(argv, id);
  if (argv.json) {
    console.log(JSON.stringify({ archipelago: result.kebab, pass: result.errors.length === 0, findings: result.report.findings }, null, 2));
  } else {
    printReport(result.report, `motu archipelago verify — ${result.kebab}`, result.errors, result.warns);
  }
  process.exit(verifyExitCode(result));
}

export async function runArchipelagoVerify(argv, id) {
  setVerbose(argv?.verbose);
  setProgressScope(id);
  const report = makeReport();
  const hasLayout = archipelagoConfigChecks(report, id);
  // Static, and project-wide in what it reads: a cycle is a property of the graph, not of one file.
  if (existsSync(paths.archipelagoFile(id))) regionRefCheck(report, id);

  // The inbound seam: a channel that orchestrates must install the app's logic, not restate it.
  const region = readRegions(paths.archipelagosDir).find((r) => r.id === id);
  if (region) channelSourceCheck(report, id, region);

  // Is what the lagoon draws the page's own code, or a second copy of it?
  frameIsPageCheck(report, id, region);

  // The other half of what a source is worth: a flow drives it through the screen, and the branches
  // no screen tells apart need a test that drives it directly.

  // Static, so an uncovered slot shows up in the fast loop rather than behind a browser.
  renderCoverageCheck(report, id);
  writesCoveredCheck(report, id);

  // Membership as data: static, so it runs whether or not a browser was asked for.
  if (region?.membership === 'catalogue') await catalogueCheck(report, id, region);

  // Region styling: until islands own their CSS, the shared sheet is the region's stylesheet — lint it.
  if (existsSync(paths.sharedStyles)) {
    cssChecks(report, readFileSync(paths.sharedStyles, 'utf8'), paths.rel(paths.sharedStyles));
  }

  // Same line as the islands: static by default, browser on request (see runIslandVerify).
  if ((argv.runtime === true || argv.audit === true) && argv.fast) {
    // `--fast` means NO BROWSER, and a region's runtime checks are browser-only: flows, mutation and
    // the region render all drive the lagoon. Running them anyway made `--fast` an island-only flag
    // whose regions still booted chromium — 43s of an 87s run, most of what was left after the islands
    // got cheaper. Skipped, and SAID, because a flag that quietly does half of what it claims is worse
    // than one that costs more.
    report.skip(
      'region-runtime',
      'flows, mutation and the region render need a browser — re-run without --fast before handing over',
    );
  } else if (argv.runtime === true || argv.audit === true) {
    reportBrowserOverride(report);
    // FIRST, before anything that drives the mountpoints view. The lane reuses one page and a warm
    // re-aim keeps whatever view it already had, so running this after the wiring probe measured a
    // DIAGNOSTIC layout and reported a page that overflows by 197px as fitting every viewport. The
    // trap this file already documents, walked into by the check that needed the region view most.
    if (hasLayout && argv.audit === true) await regionAuditCheck(report, id, 5300 + Math.floor(Math.random() * 400));
    if (hasLayout) await wiringProbe(report, id, 5300 + Math.floor(Math.random() * 400));
    // THE COMPOSED PAGE, at each declared viewport. Island `responsive` mounts each island alone, so
    // every one of them fits and the arrangement still overflows — a fixed-rail grid fits nothing on
    // a phone and no island in it is at fault. Only under `--audit`, beside the island checks whose
    // answer changes when the RENDERING changes rather than when a key moves.
    // One call, both questions: do the flows hold, and could they have failed.
    if (hasLayout) await regionFlowCheck(report, id, 5300 + Math.floor(Math.random() * 400), region);
    if (!hasLayout) {
      // NAME WHERE THE ARRANGEMENT WAS LOOKED FOR. The old wording ("islands are placed individually
      // across the host") describes the PAGE, and was read as a claim about the lagoon frame — so an
      // author who had just written a `layout` saw motu deny it and had no idea which of the three
      // places it looks at came up empty.
      report.warn(
        'lagoon-render',
        'no arrangement for this region, so the composed render was skipped. Looked for: `root:` or ' +
          `\`layout:\` on ${paths.rel(paths.archipelagoFile(id))}, and a \`layout\` for '${id}' in the ` +
          'lagoon overrides (`regions` or the kind-first `layout` map). Without one the islands are ' +
          'only ever placed individually by the host, and the arrangement is not checked anywhere',
      );
    } else {
      const port = 5300 + Math.floor(Math.random() * 400);
      try {
        const r = await step('region-mount', () => runArchipelagoLagoon({ id, port }));
        if (r.region) {
          const unmounted = r.islands.filter((i) => !i.tag);
          if (r.islands.length === 0) {
            report.error('lagoon-render', 'archipelago region rendered no island slots');
          } else if (unmounted.length === 0) {
            // "all N" used to mean "all N I happened to find". A slot the arrangement never places —
            // an island behind a closed drawer, a conditional branch — simply was not in the list, so
            // the check congratulated itself on a region missing an island. Say what is declared.
            const declaredRegion = readRegions(paths.archipelagosDir).find((x) => x.id === id);
            // A planned island has nothing to mount yet; demanding it here would make the survey red.
            const declared =
              declaredRegion?.membership === 'catalogue'
                ? []
                : (declaredRegion?.islands ?? []).filter((i) => !i.planned).map((i) => i.slot);
            const placed = new Set(r.islands.map((i) => i.slot).filter(Boolean));
            const unplaced = declared.filter((slot) => !placed.has(slot));
            report.ok('lagoon-render', `region + all ${r.islands.length} island(s) mounted in the lagoon`, {
              n: r.islands.length,
              of: 'mounted island(s)',
            });
            if (unplaced.length) {
              report.warn(
                'lagoon-render',
                `${unplaced.join(', ')} declared but not placed by this arrangement — behind an overlay or a ` +
                  `conditional branch. Declared wires are still driven (the probe uses the mountpoints view), ` +
                  `but nothing here shows it to a human: confirm that is what the page does.`,
              );
            }
          } else {
            report.error('lagoon-render', `slot(s) with no island mounted: ${unmounted.map((i) => i.slot || '?').join(', ')}`);
          }
        } else {
          report.error('lagoon-render', `archipelago <${id}> did not render — unknown id or boot failure`);
        }
        reportRuntimeDiagnostics(report, r, 'region', declaredReach({ regionId: id }));

        // THE PAGE ITSELF — the only check here that renders the application rather than the region.
        // Reuses the same pooled page: the whole runtime lane is one browser re-aimed per check, and
        // a second boot for this would double the cost of a region's run for one navigation.
        const pr = await step('page-render', () => pageRenderLagoon({ id, port }));
        if (!pr.declared) {
          report.ok('page-render', `no \`page\` declared for '${id}' — the application's own page is not checked`, {
            n: 0,
            of: 'page(s)',
          });
        } else if (pr.crashed) {
          report.error(
            'page-render',
            `the application's own page threw while rendering:\n      ${pr.crashed.split('\n').slice(0, 6).join('\n      ')}`,
          );
        } else {
          const declaredRegion2 = readRegions(paths.archipelagosDir).find((x) => x.id === id);
          const declared2 =
            declaredRegion2?.membership === 'catalogue'
              ? []
              : (declaredRegion2?.islands ?? []).filter((i) => !i.planned).map((i) => i.slot);
          const reached = new Set(pr.slots.filter((x) => x.len > 0).map((x) => x.slot));
          // DEDUPED, because a slot name appears both in the root's mapping and in the island entry,
          // so the raw list said "1/4" and named `login-form` twice for a region with two slots.
          const slots2 = [...new Set(declared2)];
          // AND A CONDITIONAL SLOT IS NOT A MISS. The region declares its own either/or with
          // `when`/`unless`; a slot the page did not take because the region says it is an alternative
          // is the page behaving, not a finding.
          const conditional = conditionalSlots(paths.archipelagoFile(id));
          const missing = slots2.filter((slot) => !reached.has(slot) && !conditional.has(slot));
          if (!reached.size) {
            // NOTHING AT ALL. The page mounted and reached no declared slot, so whatever it drew, it
            // was not this region. That is a failure however the page is written.
            report.error(
              'page-render',
              `the page renders and reaches NONE of its ${slots2.length} declared slot(s) — it mounted ` +
                `without throwing and drew none of the region. Open ?region=${id}&view=page to see what ` +
                `it did instead`,
            );
          } else if (missing.length) {
            // A WARNING, LIKE `lagoon-render`'s, AND FOR THE SAME REASON. A slot the page did not reach
            // is sometimes exactly right: two slots can be ALTERNATIVES — peps' login passes the error
            // banner or the form and never both — and no check can tell a deliberate either/or from an
            // accidentally unreachable branch. What is not right is not knowing, so it is named.
            //
            // It was an error for one run, which made a correctly-written exclusive region red. An
            // error nobody can act on is how a check teaches people to ignore it.
            report.warn(
              'page-render',
              `the page renders and reaches ${reached.size}/${slots2.length} declared slot(s); not ` +
                `reached: ${missing.join(', ')} — either an alternative the page deliberately did not ` +
                `take (an error banner instead of a form), or a branch that never runs. Open ` +
                `?region=${id}&view=page and confirm which`,
            );
          } else {
            report.ok('page-render', `the application's own page renders and reaches all ${slots2.length} slot(s)`, {
              n: slots2.length,
              of: 'slot(s) reached by the page',
            });
          }
        }
      } catch (err) {
        const msg = String(err?.message || err).split('\n')[0];
        const env = environmentalCause(err);
        if (/Executable doesn't exist|playwright install/i.test(msg)) {
          report.inconclusive('lagoon-render', `Chromium not installed — run \`npx playwright install chromium\` (in packages/cli)`);
        } else if (env) {
          report.inconclusive('lagoon-render', `could not boot the lagoon: ${env} — the environment, not the region`);
        } else {
          report.error('lagoon-render', `lagoon failed: ${msg}`);
        }
      }
    }
  }

  return {
    kebab: id,
    report,
    errors: report.findings.filter((f) => f.level === 'error'),
    warns: report.findings.filter((f) => f.level === 'warn'),
  };
}
