// The report every verify builds, how it prints, and what its exit code means.
// Split out of commands/verify.mjs; verify.mjs re-exports the public surface.
import { unchangedSinceLastRun } from '../../lib/finding-memory.mjs';
import { readLiveUrl } from '../../lib/live-url.mjs';
import { color } from '../../lib/util.mjs';

/**
 * Say what is happening while it happens.
 *
 * The runtime checks drive a real browser, and a run that prints nothing until the end is
 * indistinguishable from a run that has hung — which is exactly how it read at fifteen islands. With
 * `--verbose` each step names itself as it starts and reports what it cost, so a slow check is
 * identifiable rather than merely suspected.
 */
export let progressLabel = '';

export let verbose = false;

export function setProgressScope(label) {
  progressLabel = label;
}

/** Turned on once per command (`--verbose`), rather than threaded through every check's arguments. */
export function setVerbose(on) {
  verbose = !!on;
}

/**
 * Total time inside instrumented steps. Read by `motu check --verbose` to print the REMAINDER.
 *
 * A list of timed parts reads as a partition of the run, and it is not one: after the flow session was
 * merged into `regionFlowCheck` it stopped being wrapped, and a `--runtime` profile accounted for 13.8s
 * of 31.8 — 57% invisible, while every printed line looked precise. A profile that cannot say what it
 * missed is a profile you will optimise the wrong half of.
 */
export let stepMsTotal = 0;

export const profiledMs = () => stepMsTotal;

export async function step(name, run) {
  const started = Date.now();
  if (!verbose) {
    try {
      return await run();
    } finally {
      stepMsTotal += Date.now() - started;
    }
  }
  const at = Date.now();
  process.stderr.write(color.dim(`  · ${progressLabel ? `${progressLabel} ` : ''}${name}…`));
  try {
    return await run();
  } finally {
    stepMsTotal += Date.now() - at;
    process.stderr.write(color.dim(` ${((Date.now() - at) / 1000).toFixed(1)}s\n`));
  }
}

export function makeReport() {
  const findings = [];
  return {
    findings,
    error: (check, msg, line) => findings.push({ level: 'error', check, msg, line }),
    warn: (check, msg, line) => findings.push({ level: 'warn', check, msg, line }),
    /**
     * A claim that HELD — and, optionally, how much was looked at to say so.
     *
     * `seen` is not decoration. The worst bug of the Twenty adoption was `removal-check` printing
     * "no motu references in the host application" over a fully integrated app: it scanned the wrong
     * directories, examined ZERO files, and reported that as success. A check that looked at nothing
     * cannot have held, so passing `seen: 0` is converted to a `skip` here rather than trusted —
     * every call site gets the invariant whether or not its author thought about emptiness.
     */
    ok: (check, msg, seen) => {
      const n = Array.isArray(seen) ? seen.length : typeof seen === 'object' && seen ? seen.n : seen;
      const of = typeof seen === 'object' && seen && !Array.isArray(seen) ? seen.of : undefined;
      if (n === 0) {
        findings.push({
          level: 'skip',
          check,
          msg: `nothing to look at${of ? ` (no ${of})` : ''} — "${msg}" is not a result this run can claim`,
          examined: 0,
        });
        return;
      }
      findings.push({ level: 'ok', check, msg, ...(n === undefined ? {} : { examined: n, examinedOf: of }) });
    },
    /**
     * A rule that does not apply to this project's posture.
     *
     * Deliberately NOT `ok`: a rule silently reported as passing is indistinguishable from a rule that
     * ran, so the two host modes could drift apart with every report still green. `skip` always states
     * the reason.
     */
    skip: (check, msg) => findings.push({ level: 'skip', check, msg }),
    /**
     * COULD NOT LOOK — the check did not run, for a reason that is not the code's fault.
     *
     * A port that never opened, a browser that is not installed, a dev server that lost a race. A
     * human shrugs and re-runs. An AGENT reads `✗` and repairs a bug that does not exist, and with
     * several agents that is several confident wrong repairs — so this is the third outcome the
     * report needs, distinct from both "holds" and "contradicted", and the run exits 2 rather than 1
     * so a loop can tell "retry" from "fix".
     */
    inconclusive: (check, msg) => findings.push({ level: 'inconclusive', check, msg }),
  };
}

/**
 * Condense a lagoon boot failure into one actionable line.
 *
 * startLagoon attaches vite's own stdout/stderr to the error, but taking only the first line threw it
 * away — so every misconfiguration surfaced as "vite did not open port N in time", which says nothing
 * about the cause. Keep the headline, then append the first line of vite output that actually names
 * the problem.
 */
/**
 * Was this the ENVIRONMENT failing, rather than the code?
 *
 * Decided on two signals, and the second one matters more than the first: a known environmental
 * signature, AND the absence of any application cause in the output. `lagoonFailure` already appends
 * the first line of vite's output that names a problem — when that line exists, something in the
 * project is broken and this is a finding, whatever the headline says.
 */
/*
 * RESOURCE EXHAUSTION BELONGS HERE, and its absence was measured rather than guessed. On a machine
 * running several agents at once, Vite's dev server died with
 * `ENOSPC: System limit for number of file watchers reached` — the box was out of inotify watches,
 * nothing to do with the island — and `island verify --runtime` reported it as exit 1, FAIL. That is
 * precisely the outcome the three-code design exists to prevent: an unattended agent reads `✗` and
 * repairs a bug that does not exist. Two arms of one bench run hit it.
 *
 * ENOSPC is listed with its siblings (EMFILE/ENFILE — descriptors, ENOMEM — memory) because they are
 * the same class: the machine ran out of something, and no edit to the project changes that.
 */
export const ENVIRONMENTAL =
  /did not open port .* in time|Executable doesn't exist|playwright install|EADDRINUSE|ECONNREFUSED|ETIMEDOUT|Target page, context or browser has been closed|browserType\.launch|ENOSPC|System limit for number of file watchers|EMFILE|ENFILE|ENOMEM|JavaScript heap out of memory/i;

export function environmentalCause(err) {
  const full = String(err?.message || err);
  if (!ENVIRONMENTAL.test(full)) return null;
  // An application cause anywhere in the output disqualifies it: the port never opened BECAUSE the
  // project does not build, and that is a finding.
  // …but the environmental line itself is not an application cause, and it usually LOOKS like one:
  // node prints `Error: ENOSPC: System limit for number of file watchers reached`, which matches the
  // `^Error` disqualifier and sent the whole classification back to FAIL. Skip any line that is
  // itself a known environmental signature before deciding the project is at fault.
  const appCause = full
    .split('\n')
    .find(
      (l) =>
        /^(Error|\s*failed to|.*ERR_[A-Z_]+|.*Cannot find)/.test(l) &&
        !l.includes('did not open port') &&
        !ENVIRONMENTAL.test(l),
    );
  return appCause ? null : full.split('\n')[0];
}

export function lagoonFailure(err) {
  const full = String(err?.message || err);
  const headline = full.split('\n')[0];
  const detail = full
    .split('\n')
    .find((l) => /^(Error|\s*failed to|.*ERR_[A-Z_]+|.*Cannot find)/.test(l) && !l.includes('did not open port'));
  return detail ? `${headline} — ${detail.trim()}` : headline;
}

/**
 * 0 pass · 1 contradicted · 2 could not look.
 *
 * The third code is the whole point: an unattended loop must be able to tell "the declarations are
 * wrong, fix them" from "the check never ran, try again". Collapsing them into 1 is what makes an
 * agent repair a bug that does not exist.
 */
export function verifyExitCode(result) {
  if (result.errors.length) return 1;
  return result.report.findings.some((f) => f.level === 'inconclusive') ? 2 : 0;
}

/**
 * A SWEEP's exit code: the worst verdict any member reached.
 *
 * Both sweeps used to gate on `errors.length === 0` alone, which made them the one path where an
 * inconclusive run reported success — no Chromium, every runtime check unanswered, `--all` exits 0
 * and CI goes green on a question nobody asked. The single-target form has always used
 * `verifyExitCode`; this is the same rule applied across members.
 *
 * An error still beats an inconclusive, exactly as it does for one member: a run that found something
 * wrong has an answer, and that answer is 1.
 */
export function sweepExitCode(results) {
  const codes = results.map(verifyExitCode);
  if (codes.includes(1)) return 1;
  return codes.includes(2) ? 2 : 0;
}

/** `--json` shape for one member of a sweep. */
export function summaryOf(r) {
  return { name: r.kebab, tag: r.tag, pass: r.errors.length === 0, findings: r.report.findings };
}

/**
 * A sweep's result: one line per member, and findings only for those that have something to say.
 *
 * A full report per island is unreadable at fourteen of them, and what a sweep answers is "is anything
 * wrong, and where" — so a clean island costs one line.
 */
/** Per-sweep tally of how much of this section the reader has already seen. */
export const sweepSeen = { total: 0, repeated: 0 };

export function printSweep(title, results) {
  console.log(color.bold(`\n${title}\n`));
  for (const r of results) {
    const mark = r.errors.length ? color.red('✗') : r.warns.length ? color.yellow('!') : color.green('✓');
    const tally = r.errors.length
      ? color.red(`${r.errors.length} error(s)`) + color.dim(`, ${r.warns.length} warning(s)`)
      : color.dim(`${r.warns.length} warning(s)`);
    console.log(`  ${mark} ${color.dim(r.kebab.padEnd(20))} ${tally}`);
    for (const f of r.report.findings) {
      if (f.level !== 'error' && f.level !== 'warn') continue;
      const m = f.level === 'error' ? color.red('✗') : color.yellow('!');
      const again = unchangedSinceLastRun(f) ? color.dim('  · unchanged') : '';
      sweepSeen.total++;
      if (again) sweepSeen.repeated++;
      console.log(`      ${m} ${color.dim(f.check.padEnd(18))} ${f.msg}${again}${f.line ? color.dim(`  (line ${f.line})`) : ''}`);
    }
  }
  const failed = results.filter((r) => r.errors.length).length;
  const warned = results.reduce((n, r) => n + r.warns.length, 0);
  console.log('');
  const head = failed
    ? color.red(color.bold('FAIL')) + `  ${failed}/${results.length} with errors`
    : color.green(color.bold('PASS')) + `  ${results.length}/${results.length} clean`;
  // WHAT MOVED, on the line a reader piping through `tail` will actually see.
  const { total, repeated } = sweepSeen;
  const delta =
    total && repeated === total
      ? color.dim(' · all unchanged since your last run')
      : repeated
        ? color.dim(` · ${repeated} unchanged, ${total - repeated} new since your last run`)
        : '';
  console.log(head + color.dim(` · ${warned} warning(s) total`) + delta);
  sweepSeen.total = 0;
  sweepSeen.repeated = 0;
}

/** Pretty-print a report's findings + the PASS/FAIL summary line (shared by island + archipelago verify). */
export function printReport(report, title, errors, warns) {
  console.log(color.bold(`\n${title}\n`));
  const line = (f) => {
    const mark =
      f.level === 'error'
        ? color.red('✗')
        : f.level === 'warn'
          ? color.yellow('!')
          : f.level === 'skip'
            ? color.dim('–')
            : f.level === 'inconclusive'
              ? color.yellow('?')
              : color.green('✓');
    const at = f.line ? color.dim(`  (line ${f.line})`) : '';
    // WHAT IT LOOKED AT, on the line itself. A reader skimming a wall of green cannot tell a check
    // that examined forty files from one that examined none, and an agent reporting the former while
    // doing the latter is the failure this whole report exists to catch.
    const seen =
      f.examined === undefined ? '' : color.dim(`  · ${f.examined} ${f.examinedOf ?? 'examined'}`);
    // UNCHANGED SINCE THE LAST RUN OF THIS SAME COMMAND. Half of everything read in the check loop
    // was a repeat; saying so is what lets a reader skip it and look at the delta instead.
    const again = f.level === 'ok' || f.level === 'skip' ? '' : unchangedSinceLastRun(f) ? color.dim('  · unchanged') : '';
    console.log(`  ${mark} ${color.dim(f.check.padEnd(18))} ${f.msg}${seen}${again}${at}`);
  };

  // THE PASSES COLLAPSE; EVERYTHING ELSE DOES NOT.
  //
  // One island under `--runtime` printed 24 rows, 20 of them green, and `motu check --runtime` does
  // that once per island — so the findings worth reading were a fifth of the output and got skimmed
  // past. Warnings, errors, skips and inconclusives keep their own line, because each is something to
  // act on or to know was not run.
  //
  // The ids are still NAMED, not just counted. `report.ok(check, msg, 0)` already becomes a `skip`, so
  // a check that examined nothing is never inside this line — but a check that never RAN would leave
  // no trace at all, and the whole point of the seen-count is that silence must be legible. Listing
  // them keeps a missing check visible; `--verbose` prints the full rows with their counts.
  const passed = report.findings.filter((f) => f.level === 'ok');
  for (const f of report.findings) if (verbose || f.level !== 'ok') line(f);
  if (!verbose && passed.length) {
    console.log(`  ${color.green('✓')} ${color.dim('passed'.padEnd(18))} ${passed.length} check(s)`);
    // A pass that counted an island's PORTALED output (lib/island-render.mjs) keeps that on its name
    // even collapsed — "data-flow" passing on a dialog is a different claim from passing on the subtree.
    const named = (f) => (/\bportals?\b/.test(`${f.examinedOf ?? ''} ${f.msg}`) ? `${f.check} (incl. portal)` : f.check);
    console.log(`    ${color.dim(passed.map(named).join(', '))}`);
  }
  console.log('');
  const unknown = report.findings.filter((f) => f.level === 'inconclusive');
  // THE DELTA, ON THE VERDICT LINE. Every agent observed in the bench piped this report through
  // `tail`, so the end is the only part reliably read — which makes it where "what moved" belongs.
  const actionable = report.findings.filter((f) => f.level === 'error' || f.level === 'warn');
  const repeated = actionable.filter((f) => unchangedSinceLastRun(f)).length;
  const delta =
    repeated && repeated < actionable.length
      ? color.dim(` · ${repeated} unchanged, ${actionable.length - repeated} new since your last run`)
      : repeated && repeated === actionable.length
        ? color.dim(' · all unchanged since your last run')
        : '';
  if (errors.length) {
    console.log(color.red(color.bold('FAIL')) + `  ${errors.length} error(s), ${warns.length} warning(s)` + delta);
  } else if (unknown.length) {
    // NOT a pass: nothing contradicted the declarations, but some of them were never examined.
    console.log(
      color.yellow(color.bold('INCONCLUSIVE')) +
        color.dim(`  ${unknown.length} check(s) could not run, ${warns.length} warning(s) — retry, do not repair`),
    );
  } else {
    console.log(color.green(color.bold('PASS')) + color.dim(`  ${warns.length} warning(s)`));
  }
  printLagoonAvailability();
}

/**
 * WHERE A PERSON CAN LOOK AT THIS RIGHT NOW — printed under every verdict, pass or fail.
 *
 * A green report describes files. The thing the work is FOR is a rendered region, and for the whole
 * of a bench run no agent ever handed one over: each finished on a passing check and a summary, and
 * the person who asked for the work had nothing to open. The rules already said to look; nothing in
 * the loop ever mentioned it, so it was the step that quietly did not happen.
 *
 * This is a NUDGE, not a gate, and deliberately so. Failing a static check because no dev server is
 * running would make `motu check` depend on a process and a network — untrue to what it examines, and
 * unrunnable in CI. So: the URL when there is one, and how to get one when there is not.
 */
export function printLagoonAvailability() {
  const url = readLiveUrl();
  if (url) console.log(color.dim('  look at it: ') + url);
  else console.log(color.dim('  no live lagoon — start one with: motu lagoon serve --watch --detach'));
}
