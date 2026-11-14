// `motu diff --base <ref>` — what a change did to the FLOWS, for the agent that made it.
//
// WHY. Two agents each added an island to one region and both extended the lagoon frame's `rowFor`
// ternary. The naive merge made one widget render as Notes, and `archipelago verify` was
// byte-identical between the correct merge and the broken one: the frame is undeclared arrangement,
// and every check compares the code to itself. A flow REPLAYED on both sides shows that slot's text
// changing. So this replays every flow of the regions a change touches, at the base and at the
// working tree, and lists what moved — per flow, per step:
//
//   keys         what the region holds after the step
//   render       what each slot renders (the `expectRender` surface)
//   calls        which backend calls the step made, and how they were answered
//   declaration  islands, slots, writes, binds and flows, as the archipelago declares them
//
// It does not judge right or wrong. Every finding has a stable id, and an agent must say, for each,
// that it was intended (with one line saying why: `--explain <file>`) or fix it. An unexplained
// change is exit 1. That makes the agent state which behaviour changes it MEANT — the one thing a
// reader of the diff is never told.
//
// AND IT MAY NOT EXPLAIN EVERYTHING. A region whose archipelago and evidence did not change must not
// change behaviour: those findings are LOCKED, and `--explain` cannot waive them — the explanation
// would come from the agent that made the change (docs/proposals/constraint-loop.md, item 1). The
// evidence is compared as spec, clause by clause, and a change that makes it check less is said as
// such (`weakens`) and printed first, for the person who reviews the spec.
//
// THE BASE RUNS IN A GIT WORKTREE of the base commit, with the working tree's node_modules borrowed by
// symlink (the worktree is temporary and never committed), and with THIS checkout's motu: the
// question is what the project's change did, not what motu's did. Base results are cached per base
// commit, region set and motu version, so a second run against the same base replays only HEAD.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { color, paths, REPO_ROOT } from '../lib/util.mjs';
import { loadMotuConfig } from '../lib/config.mjs';
import { CLI_VERSION, INSTALLED } from '../lib/framework.mjs';
import { readRegions } from '../lib/eject.mjs';
import { changedScope } from '../lib/changed.mjs';
import { runRegionFlows, closeLagoonPool } from '../playwright-lagoon.mjs';
import { readScenariosFor } from './verify/region-flows.mjs';

const CLI = fileURLToPath(new URL('../cli.mjs', import.meta.url));
const FRAMEWORK = fileURLToPath(new URL('../../../..', import.meta.url));
const full = loadMotuConfig();

// ── one side: `motu flows trace` ─────────────────────────────────────────────────────────────────

/** What a region declares, in the shape the diff compares: one entry per slot, and the flow names. */
function declarations(regionIds) {
  const out = {};
  for (const r of readRegions(paths.archipelagosDir)) {
    if (!regionIds.includes(r.id)) continue;
    const slots = {};
    for (const i of r.islands ?? []) {
      slots[i.slot] = {
        element: i.element ?? null,
        writes: i.writes ?? {},
        bind: i.bind ?? null,
        reads: i.reads ?? [],
        ...(i.member ? { member: i.member } : {}),
      };
    }
    const flows = readScenariosFor(r.id);
    out[r.id] = {
      slots,
      flows: flows.map((f) => f.name ?? 'flow'),
      // THE EVIDENCE IS SPEC TOO. What each step asserts, as clauses — so a change that rewrites a
      // flow is a DECLARATION change a reviewer sees, and one that weakens it is said in so many words.
      evidence: Object.fromEntries(flows.map((f) => [f.name ?? 'flow', (f.steps ?? []).map(assertionClauses)])),
    };
  }
  return out;
}

/**
 * What one flow step ASSERTS, as `clause -> value`: each `expect` key, each slot's `expectRender`
 * text and notText, and the `expectCalls` list. The stimulus is not here — changing what a step does
 * is a different finding from changing what it checks.
 */
export function assertionClauses(step) {
  const out = {};
  for (const [k, v] of Object.entries(step?.expect ?? {})) out[`expect ${k}`] = JSON.stringify(v);
  for (const [slot, want] of Object.entries(step?.expectRender ?? {})) {
    const w = typeof want === 'string' ? { text: want } : (want ?? {});
    if (w.text != null) out[`render ${slot} text`] = String(w.text);
    if (w.notText != null) out[`render ${slot} notText`] = String(w.notText);
  }
  if (step?.expectCalls !== undefined) out.calls = JSON.stringify([...step.expectCalls].map(String).sort());
  return out;
}

/**
 * Does replacing `before` with `after` make the clause hold in MORE cases than it used to?
 * A text it must contain that got shorter and is still part of the old one (`'Main shlink'` → `'Main'`),
 * or a calls list that now allows calls it did not. A different text is a change, not a weakening:
 * motu cannot know whether the new one is stronger.
 */
export function relaxes(clause, before, after) {
  if (clause.endsWith(' text')) return after.length < before.length && before.toLowerCase().includes(after.toLowerCase());
  if (clause === 'calls') {
    const b = new Set(JSON.parse(before));
    return JSON.parse(after).some((c) => !b.has(c)) && [...b].every((c) => JSON.parse(after).includes(c));
  }
  return false;
}

/**
 * Replay the given regions' flows with tracing on, and write what every step left behind.
 * Internal: `motu diff` runs it twice, once in a base worktree and once here.
 */
export async function flowsTraceCommand(argv) {
  const regions = String(argv.regions ?? '').split(',').filter(Boolean);
  const out = typeof argv.out === 'string' ? argv.out : null;
  const result = { regions: {}, declarations: declarations(regions) };
  for (const id of regions) {
    const scenarios = readScenariosFor(id);
    if (!scenarios.length) {
      result.regions[id] = { flows: {}, note: 'no flows declared' };
      continue;
    }
    try {
      const run = await runRegionFlows({ id, port: 5900 + Math.floor(Math.random() * 300), scenarios, trace: true });
      // A LAGOON THAT NEVER MOUNTED is not a region whose flows changed. Every step then fails the
      // same way before doing anything, and comparing that against the other side produced fifteen
      // confident findings about a build that did not run.
      const steps = run.flows ?? [];
      const unmounted = steps.length && steps.every((st) => /no emit seam|no island mounted/.test(String(st.error ?? '')));
      if (unmounted) {
        const why = (run.diagnostics ?? []).map((d) => d.text ?? d.message ?? String(d)).find(Boolean);
        result.regions[id] = { flows: {}, error: `the lagoon never mounted ${id}${why ? `: ${String(why).slice(0, 200)}` : ''}` };
        continue;
      }
      const flows = {};
      for (const step of run.flows ?? []) {
        (flows[step.scenario] ??= []).push({
          ok: step.ok,
          error: step.error ?? null,
          keys: step.trace?.keys ?? {},
          surface: step.trace?.surface ?? {},
          calls: step.trace?.calls ?? [],
        });
      }
      result.regions[id] = { flows };
    } catch (err) {
      result.regions[id] = { flows: {}, error: String(err?.message ?? err).split('\n')[0] };
    }
  }
  await closeLagoonPool().catch(() => {});
  const text = JSON.stringify(result);
  if (out) writeFileSync(out, text);
  else console.log(text);
  return 0;
}

// ── the comparison ───────────────────────────────────────────────────────────────────────────────

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const idOf = (...parts) => createHash('sha1').update(parts.join('\u0000')).digest('hex').slice(0, 10);
const show = (v) => (v === undefined ? '(absent)' : typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v));
const clip = (s, n = 160) => (s.length > n ? `${s.slice(0, n)}…` : s);

/**
 * Two long texts, each cut to the stretch around where they first differ. A slot renders a whole table
 * and the change is one number in row three; clipping from the start showed two identical prefixes
 * and hid the only thing that moved.
 */
export function aroundDifference(a, b, context = 70) {
  if (a === b) return [a, b];
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let ja = a.length;
  let jb = b.length;
  while (ja > i && jb > i && a[ja - 1] === b[jb - 1]) {
    ja--;
    jb--;
  }
  const from = Math.max(0, i - context);
  const cut = (s, end) => (from > 0 ? '…' : '') + s.slice(from, Math.min(s.length, end + context)) + (end + context < s.length ? '…' : '');
  return [cut(a, ja), cut(b, jb)];
}

/** Count a list as a multiset, so the same call made twice is not the same as once. */
function tally(list) {
  const m = new Map();
  for (const x of list) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
}

/** Every difference between two traces, each with a stable id. Pure, so it is tested directly. */
export function compareTraces(base, head) {
  // ONE FINDING PER CHANGE, listing every flow step it appears in. A shared value that moved shows in
  // every step that renders it — 80 findings for one edit on the demo — and an agent asked to explain
  // each would explain the same thing 80 times. The id is the change itself (region, kind, subject,
  // before, after), so an explanation holds for exactly that change and goes stale when it differs.
  const byChange = new Map();
  const add = (f) => {
    const id = idOf(f.region, f.kind, f.subject, f.before, f.after);
    const at = f.flow ? { flow: f.flow, step: f.step } : null;
    const known = byChange.get(id);
    if (known) {
      if (at) known.where.push(at);
      return;
    }
    const { flow, step, ...rest } = f;
    byChange.set(id, { id, ...rest, where: at ? [at] : [] });
  };
  const regions = new Set([...Object.keys(base.regions ?? {}), ...Object.keys(head.regions ?? {})]);

  for (const region of regions) {
    // DECLARATIONS: slots, their elements, writes, binds and reads; flows added or removed.
    const bd = base.declarations?.[region] ?? { slots: {}, flows: [] };
    const hd = head.declarations?.[region] ?? { slots: {}, flows: [] };
    for (const slot of new Set([...Object.keys(bd.slots), ...Object.keys(hd.slots)])) {
      const b = bd.slots[slot];
      const h = hd.slots[slot];
      if (!b || !h) {
        add({ region, kind: 'declaration', subject: `slot ${slot}`, before: b ? `${b.element}` : '(no slot)', after: h ? `${h.element}` : '(no slot)', file: paths.rel(paths.archipelagoFile(region)) });
        continue;
      }
      for (const field of ['element', 'writes', 'bind', 'reads', 'member']) {
        if (!same(b[field], h[field])) {
          add({ region, kind: 'declaration', subject: `slot ${slot} · ${field}`, before: show(b[field]), after: show(h[field]), file: paths.rel(paths.archipelagoFile(region)) });
        }
      }
    }
    const evidenceFile = paths.rel(paths.archipelagoEvidence(region));
    for (const f of new Set([...bd.flows, ...hd.flows])) {
      const inB = bd.flows.includes(f);
      const inH = hd.flows.includes(f);
      // A FLOW REMOVED is evidence lost — the region now promises less than it did.
      if (inB !== inH) add({ region, kind: 'declaration', subject: `flow "${f}"`, before: inB ? 'declared' : '(absent)', after: inH ? 'declared' : '(absent)', file: evidenceFile, ...(inB ? { weakens: true } : {}) });
    }
    // WHAT EACH STEP ASSERTS, for flows on both sides. Read from the declarations, not the replay, so
    // a step whose assertion was rewritten is found even when the replay of both sides holds.
    const be = bd.evidence ?? {};
    const he = hd.evidence ?? {};
    for (const flow of Object.keys(he).filter((f) => be[f])) {
      for (let i = 0; i < Math.min(be[flow].length, he[flow].length); i++) {
        const b = be[flow][i] ?? {};
        const h = he[flow][i] ?? {};
        for (const clause of new Set([...Object.keys(b), ...Object.keys(h)])) {
          if (b[clause] === h[clause]) continue;
          const weakens = h[clause] === undefined || (b[clause] !== undefined && relaxes(clause, b[clause], h[clause]));
          add({
            region,
            flow,
            step: i + 1,
            kind: 'declaration',
            subject: `asserts ${clause}`,
            before: b[clause] ?? '(not asserted)',
            after: h[clause] ?? '(not asserted)',
            file: evidenceFile,
            ...(weakens ? { weakens: true } : {}),
          });
        }
      }
    }

    // OUTCOMES, per flow that exists on both sides, per step.
    const bf = base.regions?.[region]?.flows ?? {};
    const hf = head.regions?.[region]?.flows ?? {};
    for (const flow of Object.keys(hf).filter((f) => bf[f])) {
      const steps = Math.max(bf[flow].length, hf[flow].length);
      for (let i = 0; i < steps; i++) {
        const b = bf[flow][i];
        const h = hf[flow][i];
        const step = i + 1;
        if (!b || !h) {
          add({ region, flow, step, kind: 'declaration', subject: `step ${step}`, before: b ? 'present' : '(absent)', after: h ? 'present' : '(absent)', file: paths.rel(paths.archipelagoEvidence(region)), ...(b ? { weakens: true } : {}) });
          continue;
        }
        if (b.ok !== h.ok) {
          add({ region, flow, step, kind: 'outcome', subject: 'assertion', before: b.ok ? 'holds' : `fails: ${b.error ?? 'mismatch'}`, after: h.ok ? 'holds' : `fails: ${h.error ?? 'mismatch'}` });
        }
        for (const key of new Set([...Object.keys(b.keys), ...Object.keys(h.keys)])) {
          if (!same(b.keys[key], h.keys[key])) {
            add({ region, flow, step, kind: 'keys', subject: key, before: clip(show(b.keys[key])), after: clip(show(h.keys[key])) });
          }
        }
        for (const slot of new Set([...Object.keys(b.surface), ...Object.keys(h.surface)])) {
          if (b.surface[slot] !== h.surface[slot]) {
            const [before, after] = aroundDifference(b.surface[slot] ?? '(not rendered)', h.surface[slot] ?? '(not rendered)');
            add({ region, flow, step, kind: 'render', subject: slot, before, after });
          }
        }
        const bc = tally(b.calls);
        const hc = tally(h.calls);
        for (const call of new Set([...bc.keys(), ...hc.keys()])) {
          if ((bc.get(call) ?? 0) !== (hc.get(call) ?? 0)) {
            add({ region, flow, step, kind: 'calls', subject: call, before: `×${bc.get(call) ?? 0}`, after: `×${hc.get(call) ?? 0}` });
          }
        }
      }
    }
  }
  return [...byChange.values()];
}

/**
 * Mark each finding `locked` (behaviour that moved in a region whose declaration did not — no
 * explanation accepted) or `intended` (explained), and return what is left unexplained and what the
 * spec now says differently. Pure, so the rule is tested without a worktree or a browser.
 */
export function account(findings, explained = {}) {
  const declared = new Set(findings.filter((f) => f.kind === 'declaration').map((f) => f.region));
  for (const f of findings) {
    if (f.kind !== 'declaration' && !declared.has(f.region)) f.locked = true;
    const why = explained[f.id];
    if (!f.locked && typeof why === 'string' && why.trim()) f.intended = why.trim();
  }
  return {
    unexplained: findings.filter((f) => !f.intended),
    spec: findings.filter((f) => f.kind === 'declaration'),
  };
}

// ── the base side, in a worktree ─────────────────────────────────────────────────────────────────

const git = (args, cwd = REPO_ROOT) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** Every node_modules directory in the working tree (not inside another), to borrow into a worktree. */
function nodeModulesDirs(root, depth = 4) {
  const found = [];
  const walk = (dir, d) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory() || e.name === '.git' || e.name === '.motu') continue;
      const p = join(dir, e.name);
      if (e.name === 'node_modules') found.push(p);
      else if (d > 0) walk(p, d - 1);
    }
  };
  walk(root, depth);
  return found;
}

/**
 * Trace the base commit: a worktree of it, the working tree's node_modules and submodules borrowed
 * by symlink, and the trace run there with this checkout's motu. Removed afterwards; only the trace
 * is kept (cached).
 */
function traceBase({ sha, regions, gitRoot, cacheFile }) {
  const tree = resolve(full.cacheDir ?? resolve(REPO_ROOT, '.motu/cache'), 'diff-base', sha.slice(0, 12));
  if (existsSync(tree)) {
    try {
      git(['worktree', 'remove', '--force', tree], gitRoot);
    } catch {
      rmSync(tree, { recursive: true, force: true });
    }
  }
  mkdirSync(dirname(tree), { recursive: true });
  git(['worktree', 'add', '--detach', tree, sha], gitRoot);
  try {
    // SUBMODULES FIRST. A worktree does not check them out, and an empty one is a build that cannot
    // resolve. First, because borrowing node_modules puts a link INSIDE a submodule directory
    // (`backend/node_modules`), after which it no longer looks empty and was never linked — Peps'
    // base then could not load its shared backend code, and every flow step failed to mount.
    // Borrowed at their CURRENT checkout, not the base's pinned commit: said in the report.
    let subs = '';
    try {
      subs = git(['config', '--file', '.gitmodules', '--get-regexp', 'path'], gitRoot);
    } catch {
      subs = '';
    }
    for (const line of subs.split('\n').filter(Boolean)) {
      const rel = line.split(/\s+/)[1];
      const target = join(tree, rel);
      const empty = !existsSync(target) || readdirSync(target).length === 0;
      if (empty && existsSync(join(gitRoot, rel))) {
        rmSync(target, { recursive: true, force: true });
        symlinkSync(join(gitRoot, rel), target, 'dir');
      }
    }
    // BORROWED, never copied: the same installed dependencies on both sides. A node_modules inside a
    // submodule linked above already exists through that link, and is skipped.
    for (const nm of nodeModulesDirs(gitRoot)) {
      const target = join(tree, relative(gitRoot, nm));
      if (!existsSync(dirname(target)) || existsSync(target)) continue;
      symlinkSync(nm, target, 'dir');
    }
    const projectInTree = join(tree, relative(gitRoot, REPO_ROOT));
    const res = spawnSync(process.execPath, [CLI, 'flows', 'trace', '--regions', regions.join(','), '--out', cacheFile], {
      cwd: projectInTree,
      env: { ...process.env, MOTU_FS_ALLOW: [gitRoot, process.env.MOTU_FS_ALLOW].filter(Boolean).join(':') },
      encoding: 'utf8',
      timeout: 15 * 60 * 1000,
    });
    if (res.status !== 0 || !existsSync(cacheFile)) {
      throw new Error(`the base (${sha.slice(0, 12)}) could not be replayed:\n${((res.stderr || '') + (res.stdout || '')).trim().split('\n').slice(-8).join('\n')}`);
    }
  } finally {
    try {
      git(['worktree', 'remove', '--force', tree], gitRoot);
    } catch {
      rmSync(tree, { recursive: true, force: true });
      try {
        git(['worktree', 'prune'], gitRoot);
      } catch {
        /* nothing to prune */
      }
    }
  }
}

function frameworkVersion() {
  // INSTALLED there is no git history to ask — `git rev-parse` in node_modules answers for whatever
  // repository the APP is, so every app commit would have looked like a new motu. The package
  // version is the framework's identity there, and it changes exactly when motu does.
  if (INSTALLED) return `npm-${CLI_VERSION}`;
  try {
    const sha = git(['rev-parse', 'HEAD'], FRAMEWORK);
    // An uncommitted framework change is part of the version: a fix to motu itself must not reuse a
    // base replayed by the code it fixed.
    const changes = git(['diff', 'HEAD', '--', 'packages'], FRAMEWORK);
    return sha.slice(0, 12) + (changes ? `-${idOf(changes)}` : '');
  } catch {
    return 'unknown';
  }
}

// ── `motu diff` ──────────────────────────────────────────────────────────────────────────────────

export async function diffCommand(argv) {
  const json = argv.json === true;
  const baseRef = typeof argv.base === 'string' ? argv.base : 'HEAD';
  let gitRoot;
  let sha;
  try {
    gitRoot = git(['rev-parse', '--show-toplevel']);
    sha = git(['rev-parse', '--verify', `${baseRef}^{commit}`]);
  } catch {
    console.error(color.red(`✗ cannot resolve --base ${baseRef} in a git repository`));
    return 2;
  }

  // WHICH REGIONS: the ones the change touches, or every region when a change cannot be attributed —
  // said, because a diff that quietly compared less than the change reached is the worse failure.
  const all = readRegions(paths.archipelagosDir).map((r) => r.id);
  let regions;
  let scopeNote;
  const explicit = [].concat(argv.region ?? []).flatMap((x) => (typeof x === 'string' ? x.split(',') : [])).filter(Boolean);
  if (explicit.length) {
    regions = explicit;
    scopeNote = `--region ${explicit.join(', ')}`;
  } else {
    const scope = changedScope(sha);
    if (!scope.scoped) {
      regions = all;
      scopeNote = `every region — ${scope.reason}`;
    } else {
      const byIsland = new Set(scope.islands);
      const touched = new Set(scope.regions);
      for (const r of readRegions(paths.archipelagosDir)) {
        const prefix = full.tagPrefix ?? 'x-';
        const kebabOf = (el) => (String(el ?? '').startsWith(prefix) ? String(el).slice(prefix.length) : String(el ?? ''));
        if ((r.islands ?? []).some((i) => byIsland.has(kebabOf(i.element)))) touched.add(r.id);
      }
      regions = [...touched].filter((r) => all.includes(r));
      scopeNote = `${regions.length} region(s) touched by ${scope.files ?? 'the'} changed file(s)`;
    }
  }
  if (!regions.length) {
    const msg = 'no region is touched by this change — nothing to replay';
    if (json) console.log(JSON.stringify({ ok: true, base: sha, regions: [], findings: [], note: msg }, null, 2));
    else console.log(color.dim(`– ${msg}`));
    return 0;
  }

  const cacheDir = resolve(full.cacheDir ?? resolve(REPO_ROOT, '.motu/cache'), 'diff');
  mkdirSync(cacheDir, { recursive: true });
  const key = idOf(sha, [...regions].sort().join(','), frameworkVersion());
  const baseFile = resolve(cacheDir, `base-${key}.json`);
  const headFile = resolve(cacheDir, `head-${process.pid}.json`);

  try {
    if (!existsSync(baseFile)) {
      if (!json) console.log(color.dim(`replaying ${regions.join(', ')} at ${baseRef} (${sha.slice(0, 12)})…`));
      traceBase({ sha, regions, gitRoot, cacheFile: baseFile });
    } else if (!json) console.log(color.dim(`base ${sha.slice(0, 12)}: cached`));
    if (!json) console.log(color.dim(`replaying ${regions.join(', ')} in the working tree…`));
    const head = spawnSync(process.execPath, [CLI, 'flows', 'trace', '--regions', regions.join(','), '--out', headFile], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 15 * 60 * 1000,
    });
    if (head.status !== 0 || !existsSync(headFile)) throw new Error(`the working tree could not be replayed:\n${(head.stderr || '').trim().split('\n').slice(-8).join('\n')}`);
  } catch (err) {
    if (json) console.log(JSON.stringify({ ok: false, error: err.message }, null, 2));
    else console.error(color.red(`✗ ${err.message}`));
    return 2;
  }

  const base = JSON.parse(readFileSync(baseFile, 'utf8'));
  // NEVER KEEP A BASE THAT FAILED somewhere: the next run must replay it again, not trust it.
  if (Object.values(base.regions ?? {}).some((r) => r.error)) rmSync(baseFile, { force: true });
  const headTrace = JSON.parse(readFileSync(headFile, 'utf8'));
  rmSync(headFile, { force: true });
  const findings = compareTraces(base, headTrace);

  // A REGION THAT COULD NOT BE REPLAYED on either side is not a region with no changes.
  const unreplayed = regions.filter((r) => base.regions?.[r]?.error || headTrace.regions?.[r]?.error);

  // THE ACCOUNTING: `--explain <file>` maps finding ids to one line each.
  let explained = {};
  if (typeof argv.explain === 'string') {
    try {
      explained = JSON.parse(readFileSync(resolve(process.cwd(), argv.explain), 'utf8'));
    } catch (err) {
      console.error(color.red(`✗ could not read --explain ${argv.explain}: ${err.message}`));
      return 2;
    }
  }
  // A CHANGE EITHER MODIFIES THE DECLARATION OR PRESERVES BEHAVIOUR. In a region whose archipelago and
  // evidence did not change, a behavioural finding (keys, render, calls, outcome) cannot be explained
  // away: the explanation would come from the agent that made the change, which is the solver grading
  // its own exam at exactly the point a person was meant to look. The two honest options are to change
  // the declaration — where a reviewer sees it — or to fix the behaviour.
  const { unexplained, spec } = account(findings, explained);
  const stale = Object.keys(explained).filter((id) => !findings.some((f) => f.id === id));

  if (json) {
    console.log(
      JSON.stringify(
        {
          ok: !unexplained.length && !unreplayed.length,
          base: sha,
          scope: scopeNote,
          regions,
          unreplayed: unreplayed.map((r) => ({ region: r, error: base.regions?.[r]?.error ?? headTrace.regions?.[r]?.error })),
          findings,
          unexplained: unexplained.map((f) => f.id),
          // For a reviewer: what the spec now says differently, the weakenings first.
          specChanges: spec.map((f) => f.id),
          weakened: spec.filter((f) => f.weakens).map((f) => f.id),
          // Behaviour that moved in a region whose declaration did not: `--explain` cannot waive these.
          locked: findings.filter((f) => f.locked).map((f) => f.id),
          staleExplanations: stale,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(color.dim(`  base ${sha.slice(0, 12)} · ${scopeNote}`));
    for (const r of unreplayed) console.log(color.yellow(`  ! ${r} could not be replayed — ${base.regions?.[r]?.error ?? headTrace.regions?.[r]?.error}`));
    if (!findings.length) console.log(`${color.green('✓')} the flows end the same as at the base`);
    // THE SPEC FIRST — the part of this change a person has to read. Weakenings at the top: a flow
    // that now checks less is the one change a reviewer must not miss, and it is the change an agent
    // makes when the evidence is in its way.
    if (spec.length) {
      const weak = spec.filter((f) => f.weakens);
      console.log('');
      console.log(color.bold(`  SPEC CHANGES — ${spec.length}${weak.length ? `, ${color.red(`${weak.length} WEAKEN what is checked`)}` : ''}`));
      for (const f of [...weak, ...spec.filter((x) => !x.weakens)]) {
        const at = f.where[0] ? ` · "${f.where[0].flow}" step ${f.where[0].step}` : '';
        console.log(`    ${f.weakens ? color.red('weakens') : color.dim('changes')} ${f.region}${at} · ${f.subject}: ${f.before} → ${f.after}`);
      }
      console.log('');
    }
    for (const f of findings) {
      const first = f.where[0];
      const more = f.where.length > 1 ? ` (+${f.where.length - 1} more step(s))` : '';
      const where = [f.region, first && `"${first.flow}" step ${first.step}${more}`].filter(Boolean).join(' · ');
      const mark = f.intended ? color.green('✓') : color.red('✗');
      console.log(`${mark} ${color.bold(f.id)} ${where} · ${f.kind} ${color.bold(f.subject)}`);
      console.log(`    ${color.dim('before')} ${f.before}`);
      console.log(`    ${color.dim('after ')} ${f.after}`);
      if (f.intended) console.log(`    ${color.dim('intended:')} ${f.intended}`);
      if (f.locked) {
        console.log(
          `    ${color.red('locked:')} ${f.region}'s archipelago and evidence did not change, so its behaviour must not — ` +
            `${explained[f.id] ? 'the --explain entry is not accepted; ' : ''}change the declaration (and have it reviewed) or fix the behaviour`,
        );
      }
    }
    for (const id of stale) console.log(color.yellow(`  ! --explain names ${id}, which this diff did not find`));
    if (unexplained.length) {
      console.log('');
      const locked = unexplained.filter((f) => f.locked).length;
      console.log(
        `  ${unexplained.length} change(s) unexplained` +
          (locked ? ` — ${locked} of them locked (behaviour moved where the declaration did not; fix it, or change the declaration)` : '') +
          `. Otherwise: fix it, or add it to an --explain file as { "<id>": "<why it was intended>" }.`,
      );
    }
  }
  if (unreplayed.length) return 2;
  return unexplained.length ? 1 : 0;
}
