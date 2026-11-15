// SEVERAL LANES, NOT ONE — the runtime sweep spread over worker processes.
//
// The runtime lane is one dev server, one browser and one page, re-aimed per target. That is the right
// shape for a single region and the wrong one for a project: on Peps (80 islands, 23 regions) a cold
// `check --runtime` was 26 minutes on one core of a twelve-core machine, the regions alone ~11 of them.
// The lane keeps module-level state (its page pool, diagnostic sinks, paint clock), so lanes cannot
// share a process; each worker is its own `motu check --worker`, with its own lagoon and browser.
//
// THE PARENT STAYS THE ONLY VOICE. Workers run `runIslandVerify` / `runArchipelagoVerify` — the very
// functions the single-lane path runs — and send the result back as data. Ordering, printing, the
// exit code, finding memory, integration, screens and removal all stay in the parent, so a parallel
// run reads exactly like a sequential one.
//
// TWO RULES learned from running several dev servers on one project:
//   - The first worker boots ALONE and is handed a small island first. Vite optimises the lagoon's
//     dependencies into one shared cache on first boot; several processes doing that at once is a
//     race. The others start once the first has answered.
//   - A worker that dies does not take its target's verdict with it silently: the target comes back
//     INCONCLUSIVE (exit 2 — retry, do not repair) naming what the worker said last.
import { fork } from 'node:child_process';
import { availableParallelism, freemem, totalmem } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { color } from './util.mjs';

const CLI = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'cli.mjs');
/** What one lane costs in memory, measured on Peps: a Vite dev server plus a Chromium page. */
const LANE_BYTES = 1.5 * 1024 ** 3;

/**
 * How many lanes: `--jobs <n>`, `--jobs auto`, or (unset) auto when there is enough to share.
 *
 * Auto is half the cores, bounded by memory and by 4 — past that the shared dev server and disk are
 * the bottleneck, not the browsers. A run with only a few targets to drive stays on one lane: a worker
 * boot (~15s) costs more than it saves there.
 */
export function laneCount(argv, queued) {
  const auto = () => {
    const byCpu = Math.floor((availableParallelism?.() ?? 2) / 2);
    const byMem = Math.floor(Math.max(freemem(), totalmem() / 2) / LANE_BYTES);
    return Math.max(1, Math.min(4, byCpu, byMem));
  };
  let n;
  if (argv.jobs === undefined || argv.jobs === true || argv.jobs === 'auto') n = queued >= 6 ? auto() : 1;
  else n = Math.max(1, Number.parseInt(String(argv.jobs), 10) || 1);
  return Math.max(1, Math.min(n, queued));
}

/** A result as plain data, and back — `errors`/`warns` are views of `findings`, rebuilt on arrival. */
export function serializeResult(r) {
  return { kebab: r.kebab, tag: r.tag, findings: r.report.findings, cached: r.cached ?? null, runtimeRan: Boolean(r.runtimeRan) };
}
export function deserializeResult(d) {
  const findings = d.findings ?? [];
  return {
    kebab: d.kebab,
    tag: d.tag,
    report: { findings },
    cached: d.cached ?? null,
    runtimeRan: d.runtimeRan,
    errors: findings.filter((f) => f.level === 'error'),
    warns: findings.filter((f) => f.level === 'warn'),
  };
}

/** The result a target gets when the worker running it never answered. */
function lostResult(task, why) {
  const findings = [
    {
      level: 'inconclusive',
      check: 'runtime-worker',
      msg: `the worker driving this ${task.kind} stopped before answering (${why}) — the environment, not the ${task.kind}; re-run`,
    },
  ];
  return deserializeResult({ kebab: task.id, tag: task.tag, findings, cached: null, runtimeRan: true });
}

/**
 * Run `tasks` (`{ kind: 'island'|'region', id, argv, cost }`) on `lanes` workers. Resolves to a Map
 * from `${kind}:${id}` to its result. Most expensive first, so the long regions do not start last.
 */
export async function runOnWorkers(tasks, lanes, { verbose = false } = {}) {
  const results = new Map();
  if (!tasks.length) return results;
  const byCost = [...tasks].sort((a, b) => b.cost - a.cost);
  // The first worker warms the shared dependency cache on the cheapest target, alone.
  const warm = byCost.pop();
  const queue = byCost;
  const key = (t) => `${t.kind}:${t.id}`;
  const started = Date.now();
  let done = 0;
  const total = tasks.length;

  const progress = (lane, t, ms) => {
    done++;
    if (verbose) {
      process.stderr.write(color.dim(`  [lane ${lane}] ${t.kind} ${t.id} ${(ms / 1000).toFixed(1)}s · ${done}/${total}\n`));
    }
  };

  const spawnWorker = (lane, first = null) =>
    new Promise((resolveWorker) => {
      const child = fork(CLI, ['check', '--worker'], {
        env: { ...process.env, MOTU_CHECK_LANE: String(lane) },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      });
      let tail = '';
      const keep = (buf) => {
        tail = (tail + buf.toString()).slice(-2000);
        // A worker's own step progress, prefixed, under --verbose; never onto stdout, which may be --json.
        if (verbose) process.stderr.write(buf.toString().replace(/^(?=.)/gm, color.dim(`[lane ${lane}] `)));
      };
      child.stdout.on('data', keep);
      child.stderr.on('data', keep);
      let current = null;
      let currentAt = 0;
      let pendingFirst = first;
      const next = () => {
        current = pendingFirst ?? queue.shift() ?? null;
        pendingFirst = null;
        if (!current) {
          child.send({ type: 'stop' });
          return;
        }
        currentAt = Date.now();
        child.send({ type: 'run', kind: current.kind, id: current.id, argv: current.argv });
      };
      child.on('message', (m) => {
        if (m?.type !== 'result' || !current) return;
        results.set(key(current), deserializeResult(m.result));
        progress(lane, current, Date.now() - currentAt);
        const wasWarm = current === warm;
        current = null;
        if (wasWarm) onWarm();
        next();
      });
      child.on('exit', (code, signal) => {
        if (current) {
          // Died mid-target: that target is INCONCLUSIVE, the rest go to the other lanes.
          results.set(key(current), lostResult(current, signal ?? `exit ${code}${tail ? ` — ${tail.trim().split('\n').pop()}` : ''}`));
          progress(lane, current, Date.now() - currentAt);
          if (current === warm) onWarm();
        }
        resolveWorker();
      });
      next();
    });

  let onWarm = () => {};
  const warmed = new Promise((r) => {
    onWarm = r;
  });
  const workers = [spawnWorker(1, warm)];
  await warmed;
  for (let lane = 2; lane <= lanes; lane++) workers.push(spawnWorker(lane));
  await Promise.all(workers);
  if (verbose) process.stderr.write(color.dim(`  ${lanes} lane(s), ${total} target(s), ${((Date.now() - started) / 1000).toFixed(1)}s\n`));
  return results;
}

/** The worker side: `motu check --worker`, driven over IPC by `runOnWorkers`. */
export async function workerMain() {
  const { runIslandVerify, runArchipelagoVerify } = await import('../commands/verify.mjs');
  process.on('message', async (m) => {
    if (m?.type === 'stop') process.exit(0);
    if (m?.type !== 'run') return;
    let result;
    try {
      result = m.kind === 'island' ? await runIslandVerify(m.argv, m.id) : await runArchipelagoVerify(m.argv, m.id);
      process.send({ type: 'result', result: serializeResult(result) });
    } catch (err) {
      // A bug in a check is a bug, not an environment: say it as an error on the target.
      process.send({
        type: 'result',
        result: {
          kebab: m.id,
          findings: [{ level: 'error', check: 'runtime-worker', msg: `the check threw: ${String(err?.stack ?? err).split('\n').slice(0, 3).join(' · ')}` }],
          runtimeRan: true,
        },
      });
    }
  });
}
