// `motu lagoon try <region> [step…]` — ask a region "what happens if…?" and see the answer, step by step.
//
// WHY. Every check motu has answers "does this hold?" — a question you can only ask once you know what
// to assert. Before that, an agent exploring a region had two moves, both bad: write a flow, run a
// runtime verification for minutes and read the failure (an assertion loop pressed into exploring),
// or open a state in a browser and hand-write `page.evaluate` against `window.__motuLagoon` (a private
// API, rediscovered by guessing, every time). Both happened, repeatedly, in the session that produced
// this command: a bug whose state the screen MASKED was only found by reading `snapshot()` by hand.
//
// WHAT IT DOES. Turns the steps given on the command line into a one-off flow, replays it with the
// same engine `motu diff` uses (`runRegionFlows`, traced), and prints what each step changed: the
// region's keys (old → new), what each slot perceivably shows, the backend calls that landed — and
// what failed, if anything. Nothing is written unless asked.
//
// THE SAME VERBS A FLOW HAS, and nothing else: `click` by accessible name, `emit` a declared output,
// `provide` a host key, `seed` the starting state, `in <world>`. No selectors, no eval — reaching for
// those is leaving the harness for a browser test, the line motu draws everywhere else.
//
// KEEPING IT. Assertions are the AGENT's to write (`shows`, `hides`, `holds`), never derived from what
// was observed: an assertion copied from the output agrees with itself by construction, which is the
// fake evidence motu's checks exist to refuse. `--keep "<name>"` appends the flow to the region's
// evidence only when every assertion held — and then `motu archipelago verify` judges it like any flow.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { color, paths } from '../lib/util.mjs';
import { readRegions } from '../lib/eject.mjs';
import { runRegionFlows, closeLagoonPool } from '../playwright-lagoon.mjs';

const USAGE = `motu lagoon try <region> [step…] [--world <id>] [--shot <dir>] [--keep "<flow name>"] [--json]

  steps (each one argument — quote it):
    in <world>                 run in a declared world (first, once)
    seed <key>=<json>          the starting state, before anything renders
    click <accessible name>    what a person does
    emit <slot>:<event> [json] an island's declared output, entered past its handler
    provide <key>=<json>       the application moving its own state
  assertions (attach to the step before them; required for --keep):
    shows <slot>: <text>       holds <key>=<json>
    hides <slot>: <text>`;

/** Parse the step arguments into one flow. Exported for tests. */
export function parseTry(args) {
  const flow = { seed: {}, steps: [], world: null };
  const json = (raw, what) => {
    try {
      return JSON.parse(raw);
    } catch {
      // A bare word is a string — `provide viewMode=diff` should not need quotes inside quotes.
      if (/^[\w.-]+$/.test(raw)) return raw;
      throw new Error(`${what}: "${raw}" is not JSON (quote strings: '"text"')`);
    }
  };
  const assign = (rest, what) => {
    const at = rest.indexOf('=');
    if (at < 1) throw new Error(`${what} wants <key>=<json>, got "${rest}"`);
    return [rest.slice(0, at).trim(), json(rest.slice(at + 1).trim(), what)];
  };
  const last = (verb) => {
    if (!flow.steps.length) throw new Error(`"${verb}" asserts on the step before it — there is no step yet (start with click, emit, provide, or "look")`);
    return flow.steps[flow.steps.length - 1];
  };
  for (const raw of args) {
    const arg = String(raw).trim();
    const sp = arg.indexOf(' ');
    const verb = sp < 0 ? arg : arg.slice(0, sp);
    const rest = sp < 0 ? '' : arg.slice(sp + 1).trim();
    if (verb === 'in') { if (flow.steps.length) throw new Error('"in <world>" comes first'); flow.world = rest; continue; }
    if (verb === 'seed') { const [k, v] = assign(rest, 'seed'); flow.seed[k] = v; continue; }
    if (verb === 'look') { flow.steps.push({ look: true }); continue; }
    if (verb === 'click') { if (!rest) throw new Error('click wants an accessible name'); flow.steps.push({ click: rest }); continue; }
    if (verb === 'emit') {
      const m = rest.match(/^([\w-]+):([\w-]+)(?:\s+(.+))?$/);
      if (!m) throw new Error(`emit wants <slot>:<event> [json], got "${rest}"`);
      flow.steps.push({ emit: { slot: m[1], event: m[2], ...(m[3] !== undefined ? { detail: json(m[3], 'emit detail') } : {}) } });
      continue;
    }
    if (verb === 'provide') { const [k, v] = assign(rest, 'provide'); flow.steps.push({ provide: { [k]: v } }); continue; }
    if (verb === 'shows' || verb === 'hides') {
      const m = rest.match(/^([\w-]+):\s*(.+)$/);
      if (!m) throw new Error(`${verb} wants <slot>: <text>, got "${rest}"`);
      const st = last(verb);
      st.expectRender ??= {};
      const prev = st.expectRender[m[1]];
      const want = typeof prev === 'string' ? { text: prev } : (prev ?? {});
      if (verb === 'shows') want.text = m[2]; else want.notText = m[2];
      st.expectRender[m[1]] = want.notText === undefined ? want.text : want;
      continue;
    }
    if (verb === 'holds') { const [k, v] = assign(rest, 'holds'); (last('holds').expect ??= {})[k] = v; continue; }
    throw new Error(`unknown step "${arg}" — one of: in, seed, look, click, emit, provide, shows, hides, holds`);
  }
  return flow;
}

/** What changed between two snapshots of the region's keys, as `key: old → new`. Exported for tests. */
export function keyDiff(before, after) {
  const out = [];
  const show = (v) => {
    const s = JSON.stringify(v);
    return s === undefined ? 'undefined' : s.length > 120 ? `${s.slice(0, 117)}…` : s;
  };
  for (const k of new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])) {
    const a = JSON.stringify(before?.[k]);
    const b = JSON.stringify(after?.[k]);
    if (a !== b) out.push({ key: k, from: show(before?.[k]), to: show(after?.[k]) });
  }
  return out;
}

/** What a slot shows, read once: the surface repeats under nested slot elements (joined " | ") and the
 *  mountpoints view prefixes the slot's own caption — both are the harness, not the region. */
const tidy = (slot, text) => {
  const parts = String(text ?? '').split(' | ').map((p) => p.trim().replace(new RegExp(`^${slot}\\s+`, 'i'), '')).filter(Boolean);
  return [...new Set(parts)].join(' | ');
};

const clip = (s, n = 160) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

export async function lagoonTryCommand(argv) {
  const id = argv._[0];
  if (!id || argv.help) {
    console.log(USAGE);
    process.exit(id ? 0 : 2);
  }
  const region = readRegions(paths.archipelagosDir).find((r) => r.id === id);
  if (!region) {
    const known = readRegions(paths.archipelagosDir).map((r) => r.id);
    console.error(color.red(`✗ no region "${id}"`) + color.dim(known.length ? ` — regions here: ${known.join(', ')}` : ' — none found; run this from the project that holds motu.config.json'));
    process.exit(2);
  }
  let flow;
  try {
    flow = parseTry(argv._.slice(1));
  } catch (e) {
    console.error(color.red(`✗ ${e.message}`));
    console.log(USAGE);
    process.exit(2);
  }
  if (typeof argv.world === 'string') flow.world = argv.world;

  // STEP 0 IS "HOW IT STARTS": an assertion that always holds on the region's first slot, so the
  // runner records the state before anything is done — the baseline every later step is read against.
  const firstSlot = region.islands[0]?.slot;
  if (!firstSlot) {
    console.error(color.red(`✗ region "${id}" declares no islands — nothing to try`));
    process.exit(2);
  }
  // EXPLORING NEEDS NO ASSERTION, and the runner (rightly) refuses a step without one. So a step the
  // agent did not assert gets an always-true one of ours — on the first slot, containing "" — which
  // is never reported and never kept. Steps the agent DID assert run exactly as written.
  const placeholder = { [firstSlot]: '' };
  const steps = [
    { expectRender: placeholder },
    ...flow.steps.map(({ look, ...st }) => (st.expect || st.expectRender ? st : { ...st, expectRender: placeholder })),
  ];
  const name = typeof argv.keep === 'string' ? argv.keep : 'motu lagoon try';
  const scenario = { name, ...(Object.keys(flow.seed).length ? { seed: flow.seed } : {}), ...(flow.world ? { world: flow.world } : {}), steps };

  const shotDir = typeof argv.shot === 'string' ? resolve(argv.shot) : null;
  if (shotDir) mkdirSync(shotDir, { recursive: true });
  const shots = [];
  const t0 = Date.now();
  let run;
  try {
    run = await runRegionFlows({
      id,
      // 7300–7599: clear of Chromium's unsafe ports (6665–6669 is IRC — a random pick there refused to load).
      port: 7300 + Math.floor(Math.random() * 300),
      scenarios: [scenario],
      trace: true,
      onStep: shotDir
        ? async (page, { step }) => {
            const file = join(shotDir, `${id}-step-${step - 1}.png`);
            await page.screenshot({ path: file, fullPage: true });
            shots.push(file);
          }
        : null,
    });
  } catch (e) {
    console.error(color.red(`? could not run — ${String(e?.message ?? e).split('\n')[0]}`));
    process.exit(2);
  } finally {
    await closeLagoonPool().catch(() => {});
  }
  const ms = Date.now() - t0;
  const results = run?.flows ?? [];
  // A LAGOON THAT NEVER MOUNTED is not a region where nothing happened — it is a run that did not
  // happen. Same guard as `motu diff`: say so, exit 2, never print an empty exploration as an answer.
  if (!results.length || results.every((r) => /no emit seam|no island mounted/.test(String(r.error ?? '')))) {
    const why = (run?.diagnostics ?? []).map((d) => d.text ?? d.message ?? String(d)).find(Boolean);
    console.error(color.red(`? could not run — the lagoon never mounted ${id}`) + (why ? color.dim(`: ${String(why).slice(0, 300)}`) : ''));
    process.exit(2);
  }

  // Read the trace into "what each step changed".
  const described = ['how it starts', ...flow.steps.map((s) => (s.look ? 'look' : s.click ? `click ${s.click}` : s.emit ? `emit ${s.emit.slot}:${s.emit.event}${s.emit.detail !== undefined ? ` ${JSON.stringify(s.emit.detail)}` : ''}` : s.provide ? `provide ${Object.entries(s.provide).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ')}` : 'step'))];
  const report = [];
  let prev = null;
  for (const [i, r] of results.entries()) {
    const t = r.trace ?? { keys: {}, surface: {}, calls: [] };
    const surface = Object.entries(t.surface ?? {}).map(([slot, text]) => ({ slot, text: clip(tidy(slot, text), 400), changed: !prev || prev.surface?.[slot] !== text }));
    report.push({
      step: i,
      did: described[i] ?? `step ${i}`,
      keys: prev ? keyDiff(prev.keys, t.keys) : Object.keys(t.keys ?? {}).map((k) => ({ key: k, from: '', to: clip(JSON.stringify(t.keys[k]), 120) })),
      slots: surface,
      calls: t.calls ?? [],
      // Step 0's always-true assertion is not the agent's; its mismatches are not either.
      failed: i === 0 ? (r.error && !/render:/.test(r.error) ? r.error : null) : (r.error ?? null),
      mismatches: i === 0 ? [] : (r.mismatches ?? []).map((m) => `${m.key}: expected ${typeof m.expected === 'string' ? m.expected : JSON.stringify(m.expected)}, got ${clip(typeof m.actual === 'string' ? m.actual : JSON.stringify(m.actual), 200)}`),
      crashed: r.crashed ?? null,
      undeclared: (r.undeclared ?? []).map((c) => `${c.method} ${c.label || c.url} ${c.status}`),
      shot: shots[i] ?? null,
    });
    prev = t;
  }
  const asserted = flow.steps.some((s) => s.expect || s.expectRender);
  const held = report.slice(1).every((r) => !r.failed && r.mismatches.length === 0);

  if (argv.json) {
    console.log(JSON.stringify({ region: id, world: flow.world ?? 'default', ms, held: asserted ? held : null, steps: report }, null, 2));
  } else {
    console.log(color.bold(`motu lagoon try ${id}`) + color.dim(`${flow.world ? ` · world ${flow.world}` : ''} · ${(ms / 1000).toFixed(1)}s`));
    for (const r of report) {
      console.log(`\n${color.bold(`${r.step}. ${r.did}`)}${r.failed ? color.red(`  ✗ ${r.failed}`) : ''}${r.crashed ? color.red(`  crashed: ${r.crashed}`) : ''}`);
      if (r.step === 0) console.log(color.dim(`   keys  ${r.keys.length} in the region (${r.keys.map((k) => k.key).join(', ')})`));
      else if (r.keys.length) for (const k of r.keys) console.log(`   ${color.bold('key')}   ${k.key}: ${color.dim(k.from)} → ${k.to}`);
      else console.log(color.dim('   keys  nothing moved'));
      const shown = r.step === 0 ? r.slots : r.slots.filter((s) => s.changed);
      for (const s of shown) console.log(`   ${color.bold('slot')}  ${s.slot}: ${clip(s.text, 160)}`);
      if (r.step > 0 && !shown.length) console.log(color.dim('   slots nothing changed on screen'));
      if (r.calls.length) console.log(`   ${color.bold('calls')} ${r.calls.join(' · ')}`);
      for (const u of r.undeclared) console.log(color.yellow(`   ! a call nothing answered: ${u}`));
      for (const m of r.mismatches) console.log(color.red(`   ✗ ${m}`));
      if (r.shot) console.log(color.dim(`   shot  ${r.shot}`));
    }
    if (asserted) console.log(`\n${held ? color.green('✓ every assertion held') : color.red('✗ an assertion did not hold')}`);
  }

  if (typeof argv.keep === 'string') {
    if (!asserted) {
      console.error(color.red('\n✗ --keep needs assertions you wrote (shows / hides / holds) — a flow that asserts nothing is not evidence, and one copied from this output agrees with itself'));
      process.exit(1);
    }
    if (!held) {
      console.error(color.red('\n✗ not kept: an assertion did not hold — fix the flow or the region first'));
      process.exit(1);
    }
    // motu refuses a kept step that asserts nothing (region-flow), so say it here, before writing.
    const bare = flow.steps.filter((st) => !st.look && !st.expect && !st.expectRender).length;
    if (bare) {
      console.error(color.red(`\n✗ not kept: ${bare} step(s) assert nothing — follow each with what it visibly changes (shows / hides / holds); motu refuses a flow step that asserts nothing`));
      process.exit(1);
    }
    const kept = { name: argv.keep, ...(flow.world ? { world: flow.world } : {}), ...(Object.keys(flow.seed).length ? { seed: flow.seed } : {}), steps: flow.steps.map(({ look, ...st }) => st).filter((st) => Object.keys(st).length) };
    const literal = `  ${JSON.stringify(kept)},\n`;
    const file = paths.archipelagoEvidence(id);
    const text = existsSync(file) ? readFileSync(file, 'utf8') : null;
    const at = text ? text.lastIndexOf('];') : -1;
    if (!text || !/export const scenarios/.test(text) || at < 0) {
      console.log(color.yellow(`\n! could not find the scenarios array in ${paths.rel(file)} — add this flow by hand:`));
      console.log(literal);
      process.exit(1);
    }
    writeFileSync(file, `${text.slice(0, at)}${literal}${text.slice(at)}`);
    console.log(color.green(`\n✓ kept as "${argv.keep}" in ${paths.rel(file)}`) + color.dim(' — `motu archipelago verify ' + id + ' --runtime` now judges it like any flow (flow-mutation included)'));
  }
  process.exit(asserted && !held ? 1 : 0);
}
