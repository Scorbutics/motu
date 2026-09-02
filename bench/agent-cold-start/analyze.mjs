#!/usr/bin/env node
// Turn a bench run's trace into the numbers the run exists to produce.
//
//   node analyze.mjs [trace.jsonl] [--json]
//
// The trace is written by shim/motu — one record per `motu` invocation, from any shell, any agent.
// Everything here is derived from it, so no metric depends on an agent reporting honestly about
// itself. The journals (runs/<arm>/journal.md) carry the qualitative half; this carries the
// countable half, and the two are meant to be read together.
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const tracePath = args.find((a) => !a.startsWith('--')) ?? '/home/scorbutics/dev/motu-bench/runs/trace.jsonl';

const records = readFileSync(tracePath, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l));

/** An arm is a target repository. The cwd is the only thing the shim can attribute by. */
const ARMS = [
  { id: 'arm-a-next', match: /motu-bench\/formbricks/ },
  { id: 'arm-b-vite', match: /motu-bench\/novu/ },
  { id: 'arm-c-npm', match: /motu-bench\/shlink/ },
  { id: 'arm-d-foreign-store', match: /motu-bench\/mastodon/ },
  { id: 'control', match: /motu-bench\/control/ }, // control runs no motu commands; kept for future arms
];
const armOf = (cwd) => ARMS.find((a) => a.match.test(cwd))?.id ?? 'other';

/** The first argument that is not a flag — `island`, `check`, `lagoon`, … */
const family = (argv) => argv.trim().split(/\s+/).filter((t) => !t.startsWith('-'))[0] ?? '(none)';

/**
 * A VERBATIM RETRY is the same (cwd, argv) run again after it failed, with no other motu command in
 * between. It is the sharpest single reading of whether an error message taught anything: an agent
 * that understood the failure changes the command, and one that did not runs it again.
 */
function verbatimRetries(rows) {
  let n = 0;
  const found = [];
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1];
    const cur = rows[i];
    if (prev.exit !== 0 && prev.argv === cur.argv && prev.cwd === cur.cwd) {
      n++;
      found.push(cur.argv);
    }
  }
  return { n, found };
}

/**
 * Invocations up to and including the first command that PROVES a lagoon exists — `lagoon states`,
 * `lagoon dev`, `lagoon serve` or a green `check` — counted from the arm's first `init`.
 */
function toFirstLagoon(rows) {
  const start = rows.findIndex((r) => family(r.argv) === 'init');
  if (start < 0) return null;
  for (let i = start; i < rows.length; i++) {
    const f = family(rows[i].argv);
    if (rows[i].exit === 0 && (f === 'lagoon' || f === 'check')) {
      return { invocations: i - start + 1, seconds: Math.round((Date.parse(rows[i].t) - Date.parse(rows[start].t)) / 1000) };
    }
  }
  return null;
}

const report = { trace: tracePath, total: records.length, arms: {} };

for (const arm of [...new Set(records.map((r) => armOf(r.cwd)))]) {
  const rows = records.filter((r) => armOf(r.cwd) === arm);
  const failed = rows.filter((r) => r.exit !== 0);
  const byFamily = {};
  for (const r of rows) {
    const f = family(r.argv);
    byFamily[f] ??= { runs: 0, failed: 0, ms: 0 };
    byFamily[f].runs++;
    byFamily[f].ms += r.ms;
    if (r.exit !== 0) byFamily[f].failed++;
  }
  report.arms[arm] = {
    invocations: rows.length,
    failed: failed.length,
    failedRatio: rows.length ? +(failed.length / rows.length).toFixed(3) : 0,
    exit1: rows.filter((r) => r.exit === 1).length,
    exit2_inconclusive: rows.filter((r) => r.exit === 2).length,
    otherExit: failed.filter((r) => r.exit !== 1 && r.exit !== 2).length,
    verbatimRetries: verbatimRetries(rows),
    toFirstLagoon: toFirstLagoon(rows),
    cliSecondsTotal: Math.round(rows.reduce((s, r) => s + r.ms, 0) / 1000),
    wallSpanMinutes: rows.length
      ? Math.round((Date.parse(rows.at(-1).t) - Date.parse(rows[0].t)) / 60000)
      : 0,
    byFamily,
    failures: failed.map((r) => ({ argv: r.argv, exit: r.exit })),
  };
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`motu cold-start bench — ${report.total} motu invocation(s)\n`);
  for (const [arm, m] of Object.entries(report.arms)) {
    console.log(`\x1b[1m${arm}\x1b[0m`);
    console.log(`  invocations        ${m.invocations}  (${m.cliSecondsTotal}s of CLI time over ${m.wallSpanMinutes}min)`);
    console.log(`  failed             ${m.failed}  (${(m.failedRatio * 100).toFixed(0)}%)  — exit1 ${m.exit1}, exit2 ${m.exit2_inconclusive}, other ${m.otherExit}`);
    console.log(`  verbatim retries   ${m.verbatimRetries.n}${m.verbatimRetries.n ? '  → ' + m.verbatimRetries.found.join(' | ') : ''}`);
    console.log(`  init → lagoon      ${m.toFirstLagoon ? `${m.toFirstLagoon.invocations} invocations, ${m.toFirstLagoon.seconds}s` : 'never reached'}`);
    const fams = Object.entries(m.byFamily).sort((a, b) => b[1].runs - a[1].runs);
    console.log(`  by command         ${fams.map(([f, v]) => `${f}×${v.runs}${v.failed ? `(${v.failed}✗)` : ''}`).join('  ')}`);
    if (m.failures.length) {
      console.log(`  failing argv:`);
      for (const f of m.failures) console.log(`    exit ${f.exit}  motu ${f.argv}`);
    }
    console.log('');
  }
}
