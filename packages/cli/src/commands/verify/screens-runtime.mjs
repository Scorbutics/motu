// Screens at runtime: every declared screen opened alone, its calls held to `flow-calls`, and the
// screens' own FLOWS replayed — a step can click the app's own links, `navigate` to a path, and assert
// which screen is open (`expectScreen`) and what a slot renders (`expectRender`).
//
// Screen flows live in `src/screens/screens.evidence.ts`, beside `screens.ts`, exporting `scenarios`:
//
//   export const scenarios = [{
//     name: 'the sidebar opens the team base',
//     screen: 'club',
//     steps: [{ click: 'Ma base - Mes équipes', expectScreen: 'base' }],
//   }];
//
// Read with the same loader as a region's evidence, so the same rule holds: no `@/` imports there.
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { declaredScreens, screensFile } from '../../lib/screens.mjs';
import { describeCall } from '../../lib/flow-calls.mjs';
import { runScreens } from '../../playwright-lagoon.mjs';
import { readScenarios } from './island-runtime.mjs';

export function screenFlowsFile() {
  return resolve(dirname(screensFile()), 'screens.evidence.ts');
}

/**
 * Findings, in the shape `screenFindings()` already uses ({ level, check, msg }), so `motu check`
 * prints them in the screens section. Null when the project declares no screens.
 */
export async function screenRuntimeFindings({ only = null } = {}) {
  const decl = declaredScreens();
  if (!decl?.screens?.length) return null;
  const known = new Set(decl.screens.map((s) => s.id));
  const findings = [];
  const add = (level, check, msg) => findings.push({ level, check, msg });
  if (only && !known.has(only)) {
    add('error', 'screen-runtime', `no declared screen "${only}" — declared: ${[...known].join(', ')}`);
    return findings;
  }
  const ids = only ? [only] : [...known];

  const file = screenFlowsFile();
  const declared = existsSync(file) ? readScenarios(file) : [];
  const flows = [];
  for (const f of declared) {
    if (!known.has(f.screen)) {
      add('error', 'screen-flow', `"${f.name ?? 'screen flow'}" starts on screen "${f.screen}", which is not declared`);
      continue;
    }
    if (!only || f.screen === only) flows.push(f);
  }

  let run;
  try {
    run = await runScreens({ port: 5600 + Math.floor(Math.random() * 300), screens: ids, flows });
  } catch (err) {
    add('inconclusive', 'screen-runtime', `could not open the screens: ${String(err?.message ?? err).split('\n')[0]}`);
    return findings;
  }

  let calls = 0;
  let bad = 0;
  // ONE FINDING PER CALL, naming every screen that makes it. The layout makes the same call on every
  // screen, so per-screen findings were 21 copies of one fix.
  const byCall = new Map();
  for (const s of run.screens) {
    calls += s.calls;
    if (!s.ok) add('error', 'screen-render', `screen "${s.screen}" did not open: ${s.error}`);
    for (const c of s.undeclared) {
      const k = `${c.method} ${c.label || c.url} ${c.status}`;
      if (!byCall.has(k)) byCall.set(k, { call: c, screens: new Set() });
      byCall.get(k).screens.add(s.screen);
    }
  }
  for (const { call, screens } of byCall.values()) {
    bad++;
    const list = [...screens];
    const where = list.length === run.screens.length && list.length > 1 ? `every screen (${list.length})` : `screen${list.length > 1 ? 's' : ''} ${list.map((x) => `"${x}"`).join(', ')}`;
    add('error', 'flow-calls', `${where}: ${describeCall(call)}`);
  }
  const opened = run.screens.filter((s) => s.ok).length;
  if (opened === run.screens.length) add('ok', 'screen-render', `${opened} screen(s) open from their own address`);

  for (const r of run.flows) {
    calls += r.calls;
    const where = `"${r.flow}" step ${r.step}`;
    if (!r.ok) {
      add('error', 'screen-flow', `${where}: ${r.error ?? r.mismatches.map((m) => `${m.key}: expected ${m.expected}, got ${m.actual}`).join('; ')}`);
    }
    for (const c of r.undeclared) {
      bad++;
      add('error', 'flow-calls', `${where}: ${describeCall(c)}`);
    }
  }
  if (run.flows.length) {
    const passed = run.flows.filter((r) => r.ok).length;
    if (passed === run.flows.length) add('ok', 'screen-flow', `${passed} screen flow step(s) end as declared`);
  } else {
    add('warn', 'screen-flow', `no screen flows declared — ${file.replace(process.cwd() + '/', '')} would hold what navigating between screens must do`);
  }
  // A CHECK THAT LOOKED AT NOTHING HAS NOT PASSED: no calls at all is a skip, not a clean bill.
  if (!bad) add(calls ? 'ok' : 'skip', 'flow-calls', calls ? `every call the screens made was answered by a declaration · ${calls} call(s)` : 'the screens made no backend calls — nothing to hold to a declaration');
  return findings;
}

/** `motu screen verify [id]` — the screens' runtime pass on its own, for the loop on one screen. */
export async function screenVerifyCommand(argv) {
  const only = typeof argv._?.[0] === 'string' ? argv._[0] : null;
  const findings = await screenRuntimeFindings({ only });
  if (!findings) {
    console.error('this project declares no screens (src/screens/screens.ts)');
    return 2;
  }
  if (argv.json) console.log(JSON.stringify({ findings }, null, 2));
  else {
    for (const f of findings) {
      const mark = f.level === 'error' ? '✗' : f.level === 'warn' ? '!' : f.level === 'ok' ? '✓' : '–';
      console.log(`  ${mark} ${f.check.padEnd(16)} ${f.msg}`);
    }
  }
  if (findings.some((f) => f.level === 'error')) return 1;
  if (findings.some((f) => f.level === 'inconclusive')) return 2;
  return 0;
}
