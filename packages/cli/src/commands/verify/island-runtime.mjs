// An island's runtime checks: the harness, the browser lane, scenarios, viewports, axe.
// Split out of commands/verify.mjs; verify.mjs re-exports the public surface.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SyntaxKind } from 'ts-morph';
import { reachableAppSources } from '../../lib/bundlability.mjs';
import { scenarioInputs } from '../../lib/data-flow.mjs';
import { readEffectEntries } from '../../lib/effects.mjs';
import { lostMarker, parseEvidence } from '../../lib/evidence-json.mjs';
import { lagoonEnv, nodeAliasEnv } from '../../lib/node-aliases.mjs';
import { sourceFileAt } from '../../lib/ts-project.mjs';
import { HOST, MOTU_CHECKOUT, REPO_ROOT, ensureNoInstallLinks, lagoonA11y, lagoonAliases, lagoonViewports, paths } from '../../lib/util.mjs';
import { axeLagoon, differentiateLagoon, responsiveLagoon, runLagoon } from '../../playwright-lagoon.mjs';
import { declaredReach, portalNote, reportRuntimeDiagnostics } from './reach.mjs';
import { environmentalCause, lagoonFailure, step } from './report.mjs';
import { CHROMIUM_INSTALL } from '../../lib/framework.mjs';

export const HARNESS = resolve(dirname(fileURLToPath(import.meta.url)), '../../runtime-harness.mjs');

// The CLI package root — used as cwd for the harness so `--import tsx` and the @motujs/* workspace
// symlinks resolve from packages/cli/node_modules (tsx is not hoisted to the repo root).
export const CLI_PKG = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Every harness call, spawned the same way.
 *
 * The mount path got the alias loader, the project root and the lagoon env; the differentiation and
 * scenario-reading calls did not, so on any project whose islands import through an alias they failed
 * — and `runtimeDifferentiationCheck` returned SILENTLY on a non-zero exit, so `data-flow` simply
 * never appeared in the report. A check that vanishes when it breaks is worse than one that fails.
 */
export async function spawnHarness(args) {
  ensureNoInstallLinks(REPO_ROOT, MOTU_CHECKOUT);
  const ALIAS_REGISTER = resolve(dirname(fileURLToPath(import.meta.url)), '../../alias-register.mjs');
  return spawnSync(process.execPath, ['--import', 'tsx', '--import', pathToFileURL(ALIAS_REGISTER).href, ...args], {
    encoding: 'utf8',
    cwd: CLI_PKG,
    env: {
      ...lagoonEnv(),
      ...process.env,
      MOTU_PROJECT_ROOT: REPO_ROOT,
      MOTU_NODE_ALIASES: await nodeAliasEnv(),
    },
  });
}

/** Fast in-process lagoon mount under happy-dom for one fit (used with --fast). */
export async function runtimeCheckFast(report, tag, fixturesPath, fit) {
  // The alias hook goes AFTER tsx so tsx compiles what it resolves.
  const ALIAS_LOADER = resolve(dirname(fileURLToPath(import.meta.url)), '../../alias-register.mjs');
  const args = ['--import', 'tsx', '--import', pathToFileURL(ALIAS_LOADER).href, HARNESS, tag, fixturesPath || '', fit];
  // Node has to be able to resolve @motujs/* from the project's own files before it can load them.
  ensureNoInstallLinks(REPO_ROOT, MOTU_CHECKOUT);
  const res = await step('mount(fast)', async () =>
    spawnSync(process.execPath, args, {
    encoding: 'utf8',
    cwd: CLI_PKG,
    // cwd is the CLI package so `--import tsx` resolves; MOTU_PROJECT_ROOT says which project to load.
    env: { ...lagoonEnv(), ...process.env, MOTU_PROJECT_ROOT: REPO_ROOT, MOTU_NODE_ALIASES: await nodeAliasEnv() },
    }),
  );
  if (res.status !== 0) {
    // The LAST stderr line is a stack frame; the useful one is what the harness said it died of.
    const lines = (res.stderr || '').trim().split('\n').filter(Boolean);
    const why = lines.find((l) => /harness-fatal|^Error|^[A-Za-z]*Error:/.test(l)) ?? lines.pop() ?? 'no output';

    // TWO COPIES OF REACT is this path's own failure, not the island's.
    //
    // `--fast` is plain node: the project resolves `react` from its own node_modules and the framework
    // packages resolve theirs, so a component that calls a hook meets a null dispatcher. The browser
    // lagoon does not have this problem — vite dedupes — and the island that fails here passes there,
    // which is exactly what happened to `promo-box` the first time this ran. Reporting it as a defect
    // would send an agent to rewrite a component that is fine.
    if (/Invalid hook call|Cannot read properties of null \(reading 'use[A-Z]/.test(res.stderr || '')) {
      report.inconclusive(
        'lagoon-render',
        `--fast cannot mount this island: two copies of React (the project's and the framework's) meet ` +
          `in one tree, so hooks see a null dispatcher. Re-run without --fast; the browser lagoon dedupes`,
      );
      return;
    }
    report.error('lagoon-render', `lagoon mount failed (fit=${fit}) — ${why.trim()}`);
    return;
  }
  const jsonLine = (res.stdout || '').trim().split('\n').filter(Boolean).pop();
  let parsed;
  try {
    parsed = JSON.parse(jsonLine);
  } catch {
    report.error('lagoon-render', `lagoon produced no result (fit=${fit})`);
    return;
  }
  if (parsed.ok) report.ok('lagoon-render', `renders in the lagoon (happy-dom, fit=${fit})`);
  else if (!parsed.mounted) report.error('lagoon-render', `island tag <${tag}> did not upgrade (fit=${fit})`);
  else report.warn('lagoon-render', `mounts but renders nothing from default props (fit=${fit}) — confirm this island's empty state is intentional (e.g. a pure projection)`);
  reportRuntimeDiagnostics(report, parsed, `fit=${fit}`);
}

/**
 * Data-flow (differentiation) check. Opt-in: only runs when the island's fixtures export two or more
 * `scenarios` (distinct store seeds). Drives each seed across the archipelago boundary and asserts the
 * rendered output DIFFERS — proving inputs actually flow across the seam (criteria -> contract ->
 * render), not merely that the wiring type-checks. Uses the real-browser lagoon by default (so Vite
 * resolves the island's assets); `--fast` uses the in-process happy-dom harness. Silent when fewer than
 * two scenarios are declared.
 */
export function readScenarios(fixturesPath) {
  const args = ['--import', 'tsx', HARNESS, '', fixturesPath, 'native', 'scenarios'];
  // Node has to be able to resolve @motujs/* from the project's own files before it can load them.
  ensureNoInstallLinks(REPO_ROOT, MOTU_CHECKOUT);
  const res = spawnSync(process.execPath, args, {
    encoding: 'utf8',
    cwd: CLI_PKG,
    // cwd is the CLI package so `--import tsx` resolves; MOTU_PROJECT_ROOT says which project to load.
    env: { ...process.env, MOTU_PROJECT_ROOT: REPO_ROOT },
  });
  if (res.status !== 0) return [];
  const jsonLine = (res.stdout || '').trim().split('\n').filter(Boolean).pop();
  // parseEvidence, not JSON.parse: the harness marks Dates on the way out so they arrive as Dates
  // rather than ISO strings. Before that, any island formatting a date threw on mount and every
  // seeded scenario reported "rendered NOTHING" — see lib/evidence-json.mjs.
  return parseEvidence(jsonLine)?.scenarios ?? [];
}

export async function runtimeDifferentiationCheck(report, tag, fixturesPath, port, fast) {
  if (!fixturesPath) return;
  const scenarios = readScenarios(fixturesPath);
  if (scenarios.length < 2) return; // the check is opt-in

  if (fast) {
    // In-process happy-dom: mount once per seed and diff (works when the registry has no vite-only imports).
    const res = await spawnHarness([HARNESS, tag, fixturesPath, 'native', 'differentiate']);
    if (res.status !== 0) {
      const why = (res.stderr || '').trim().split('\n').find((l) => /harness-fatal|Error/.test(l)) ?? 'no output';
      report.inconclusive('data-flow', `could not compare scenarios: ${why.trim()}`);
      return;
    }
    const jsonLine = (res.stdout || '').trim().split('\n').filter(Boolean).pop();
    let parsed;
    try {
      parsed = JSON.parse(jsonLine);
    } catch {
      return;
    }
    reportDifferentiation(report, parsed);
    return;
  }

  try {
    const r = await step('data-flow', () => differentiateLagoon({ tag, port, scenarios }));
    reportDifferentiation(report, r);
  } catch (err) {
    const msg = String(err?.message || err).split('\n')[0];
    if (!/Executable doesn't exist|playwright install/i.test(msg)) {
      report.warn('data-flow', `differentiation check could not run: ${msg}`);
    }
  }
}

/**
 * A scenario's scripted interactions must have DONE something — the guard that keeps
 * `Scenario.interactions` from becoming the untyped browser-test suite the region-flow model
 * deliberately refuses (see `RegionStep`'s doc comment in `@motujs/runtime/mock`).
 *
 * Sibling of `flow-mutation`'s "a step that cannot fail is not a check". The rule here is NOT "did
 * the render change?" — the properties interactions exist for often assert that it did NOT (a panel
 * keeping its last-good data through a failed refetch renders identically on purpose). Load-bearing
 * means the render moved OR the interaction caused work. Neither means somebody clicked a journey
 * whose end state a plain seed could have described, and it should be a seed.
 *
 * A WARNING, not an error: with no fake-fetch in play there is no request signal, so an interaction
 * that legitimately only moves state the capture cannot see is indistinguishable from a decorative
 * one, and the report says which case it could not tell apart.
 */
export function reportInteractions(report, r) {
  const inert = r.inertInteractions;
  if (!inert) return; // the `--fast` lane runs no interactions — nothing to judge
  if (inert.length === 0) {
    report.ok('interaction-effective', 'every scripted interaction moved the render or caused work');
    return;
  }
  for (const { name, requestsObservable } of inert) {
    report.warn(
      'interaction-effective',
      `"${name}" scripted an interaction that changed nothing observable — ` +
        (requestsObservable
          ? 'no render change and no request. A seed describing the same end state is the honest form'
          : 'no render change, and this project has no fake-fetch request signal to check against. ' +
            'Either it is decorative, or what it moved is not captured — assert on what it produced'),
    );
  }
}

export function reportDifferentiation(report, r) {
  if (!r) return;
  // Never silent: a comparison that did not happen is a skip with its reason, not an absent line —
  // an absent line reads exactly like a check this island does not have.
  if (r.differentiates == null) {
    report.skip(
      'data-flow',
      r.mounted === false
        ? 'the island never mounted in the lagoon, so no scenario was driven — see lagoon-render'
        : 'no comparison was made, so distinct output is not proved',
    );
    return;
  }
  reportInteractions(report, r);
  if (r.differentiates) {
    // Duplicates are not a failure — two seeds may legitimately normalise to one output — but they are
    // not evidence either, and the ok line used to cover for them.
    if (r.distinctOutputs != null && r.distinctOutputs < (r.comparedCount ?? r.scenarioCount)) {
      report.warn(
        'data-flow',
        `${r.scenarioCount} scenarios produced only ${r.distinctOutputs} distinct render(s) — ` +
          `${(r.comparedCount ?? r.scenarioCount) - r.distinctOutputs} of them show nothing the others do not`,
      );
    }
    // A pass that rests on what the island PORTALED (a dialog on <body>) says so — otherwise it reads
    // like the island's own subtree differed, and the next person cannot tell which it was.
    const withPortals = (r.portals ?? []).filter((n) => n > 0);
    const portaled = withPortals.length
      ? ` · ${portalNote(withPortals.reduce((a, b) => a + b, 0))} in ${withPortals.length} of ${r.scenarioCount} scenario(s)`
      : '';
    report.ok(
      'data-flow',
      `distinct inputs produce distinct output (${r.scenarioCount} scenarios) — data flows past the seam`,
      { n: r.distinctOutputs ?? r.scenarioCount, of: `distinct render(s)${portaled}` },
    );
  } else if (r.blankButRendered?.length) {
    // A DECLARATION THAT IS NO LONGER TRUE. `blank` says "renders nothing, on purpose"; an island that
    // now renders something there either grew a state its author did not expect or the seed stopped
    // meaning what it said. Either way the comparison would be built on a claim that is false.
    report.error(
      'data-flow',
      `${r.blankButRendered.length} scenario(s) declared \`blank\` rendered something — ${r.blankButRendered.join(', ')}. ` +
        `Remove \`blank\` if the render is right, or fix what it renders`,
    );
  } else if (r.empty?.length) {
    // AN EMPTY SCENARIO IS NOT AN IDENTICAL ONE. The comparison needs every scenario to have rendered
    // something, so one that renders nothing sinks the check — and saying "rendered identically" then
    // points at the wrong thing entirely. Name the scenarios, because an island whose empty state IS
    // its correct answer (a summary of nothing, a bar with nothing to act on) cannot take part in this
    // check at all, and the author needs to know that rather than hunt a bind gap.
    report.error(
      'data-flow',
      `${r.empty.length} of ${r.scenarioCount} scenario(s) rendered NOTHING — ${r.empty.join(', ')}. ` +
        `Distinct output cannot be compared against a blank one. Either the island is not receiving that ` +
        `seed, or its empty state is deliberate — then say so on the scenario: \`blank: '<why it renders nothing>'\``,
    );
  } else {
    report.error(
      'data-flow',
      `${r.scenarioCount} scenarios rendered identically — inputs don't reach the output: the seam is wired but data doesn't flow (bind gap, or fixtures aren't request-keyed with \`match\`)`,
    );
  }
}

/** Real-browser lagoon mount via Playwright/Chromium for one fit (the default). */
export async function runtimeCheckBrowser(report, tag, fit, port) {
  try {
    const r = await step('mount', () => runLagoon({ tag, fit, port }));
    if (r.ok) report.ok('lagoon-render', `renders in the real-browser lagoon (fit=${fit})`);
    else if (!r.mounted) report.error('lagoon-render', `island tag <${tag}> did not upgrade (fit=${fit})`);
    else report.warn('lagoon-render', `mounts but renders nothing from default props (fit=${fit}) — confirm this island's empty state is intentional (e.g. a pure projection)`);
    reportRuntimeDiagnostics(report, r, `fit=${fit}`, declaredReach({ tag }));
  } catch (err) {
    const msg = lagoonFailure(err);
    const env = environmentalCause(err);
    if (/Executable doesn't exist|playwright install/i.test(msg)) {
      report.inconclusive('lagoon-render', `Chromium not installed — run ${CHROMIUM_INSTALL}, or use --fast for the happy-dom mount`);
    } else if (env) {
      report.inconclusive('lagoon-render', `could not boot the lagoon (fit=${fit}): ${env} — the environment, not the island`);
    } else {
      report.error('lagoon-render', `lagoon failed (fit=${fit}): ${msg}`);
    }
  }
}

/** Mount the island against a backend that fails every call (500), asserting it survives — renders and
 *  leaks no unhandled rejection / console error (i.e. it catches its own fetch failures). */
export async function runtimeErrorCheck(report, tag, port) {
  try {
    const r = await step('error-resilience', () => runLagoon({ tag, fit: 'native', port, forceError: 500, checkRemount: false }));
    if (!r.mounted) {
      report.warn('error-resilient', 'island did not mount under forced backend errors');
    } else if (r.diagnostics.length === 0) {
      report.ok('error-resilient', 'survives a backend error (renders, no unhandled rejection)');
    } else {
      report.error('error-resilient', `unhandled backend error — the island must catch its own calls: ${r.diagnostics[0]}`);
    }
  } catch (err) {
    const msg = lagoonFailure(err);
    // A missing browser is already reported by the normal lagoon check; don't double-report.
    if (!/Executable doesn't exist|playwright install/i.test(msg)) {
      report.error('error-resilient', `error mount failed: ${msg}`);
    }
  }
}

// Known adapter packages -> their verify contribution's export specifier. Discovery is by the adapter
// the island actually imports (read from element.ts), resolved via the package's `./verify` export.
export const ADAPTER_VERIFY = {
  '@motujs/adapter-angularjs': '@motujs/adapter-angularjs/verify',
  '@motujs/adapter-next': '@motujs/adapter-next/verify',
};

// Fallback discovery for hosts whose islands don't import an adapter at the mount point.
export const HOST_ADAPTER_VERIFY = { next: '@motujs/adapter-next/verify' };

/** Extract the structured `contract.coupling` from an island's element.ts (AST, not regex). */
export function extractCoupling(elementPath) {
  const sf = sourceFileAt(elementPath, { allowJs: true });
  const strAt = (obj, name) => {
    const init = obj.getProperty(name)?.getInitializer();
    return init && init.getKind() === SyntaxKind.StringLiteral ? init.getText().replace(/['"]/g, '') : undefined;
  };
  for (const obj of sf.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)) {
    // MECHANISM AND BOUNDARY, READ APART. `mount` says how the element attaches to a legacy scope;
    // the names it RESOLVES from that scope are boundary facts and live in `contract.effects` as
    // `scope:…`, beside the modules and tables. One list for everything an island reaches.
    const contract = obj.getProperty('contract')?.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
    const mount = obj.getProperty('mount')?.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
    // Through the shared reader, so an authored `{ scope: 'search' }` and the canonical `scope:search`
    // this check wants are the same fact read once. Reading the array's TEXT rather than its AST nodes
    // keeps one implementation for the island file, the source module and the generated contracts.
    const effectsProp = contract?.getProperty('effects');
    const effects = effectsProp ? readEffectEntries(effectsProp.getText()) : undefined;
    const hostScope = effects?.filter((e) => e.startsWith('scope:')).map((e) => e.slice('scope:'.length));
    if (!mount && !hostScope?.length) continue;
    return {
      adopt: mount && strAt(mount, 'adopt'),
      inheritScope: mount && strAt(mount, 'inheritScope'),
      hostScopeKey: mount && strAt(mount, 'hostScopeKey'),
      hostScope: hostScope?.length ? hostScope : undefined,
    };
  }
  return {};
}

/**
 * Adapter-owned verify layer. Core verify is framework-neutral; the one coupling it cannot judge is an
 * island reaching into the ocean's own framework scope. Discover the adapter the island imports (from
 * element.ts) and hand its verify contribution the STRUCTURED coupling we extract by AST — the CLI owns
 * the parsing (it has ts-morph), the adapter owns the semantics.
 */
export async function adapterChecks(report, kebab, componentPath) {
  const elementPath = paths.elementFile(kebab);
  if (!existsSync(elementPath)) return;
  const text = readFileSync(elementPath, 'utf8');
  // Discovery is by the adapter the island IMPORTS — right for AngularJS, where the mount point is
  // adapter-specific. A React host's mount point imports no adapter (the adapter lives at the
  // composition root), so fall back to the configured host: the coupling is a property of where the
  // island is going, not of what element.ts happens to import.
  const pkgs = [...text.matchAll(/from\s+['"](@motujs\/adapter-[\w-]+)['"]/g)].map((m) => m[1]);
  const specifier = pkgs.map((p) => ADAPTER_VERIFY[p]).find(Boolean) ?? HOST_ADAPTER_VERIFY[HOST];
  if (!specifier) return; // no adapter ships a verify contribution for this island/host
  const coupling = extractCoupling(elementPath);
  // Hand over the component source too: some host boundaries (Next's server/client split) live in the
  // component, not in the mount point. The CLI reads; the adapter judges.
  const source = componentPath && existsSync(componentPath) ? readFileSync(componentPath, 'utf8') : undefined;
  const graph = componentPath ? reachableAppSources(componentPath, { aliased: lagoonAliases() ?? [] }) : [];
  try {
    const mod = await import(specifier);
    for (const f of mod.checkCoupling({ coupling, source, elementSource: text, graph })) report[f.level](f.check, f.msg);
  } catch (err) {
    // INCONCLUSIVE, NOT A WARNING. A warning does not affect the exit code, so an adapter that failed
    // to load meant its checks silently did not run and the island still reported PASS — the exact
    // case exit 2 exists for ("a check could not run — retry, do NOT repair"). It is an environment
    // failure, not a finding about the island.
    report.inconclusive('adapter-verify', `could not run ${specifier}: ${String(err?.message || err)} — the ${specifier} checks did not run`);
  }
}

/**
 * axe, per declared scenario, scoped to the island's own subtree.
 *
 * Serious violations fail; the rest are reported. The line is `impact`: 'critical' and 'serious' are
 * axe's own words for "a person cannot use this", which is not a matter of taste.
 */
export async function a11yCheck(report, tag, kebab, port) {
  let findings;
  try {
    findings = await step('a11y', async () => axeLagoon({ tag, port, scenarios: await islandScenarios(kebab) }));
  } catch (err) {
    report[environmentalCause(err) ? 'inconclusive' : 'warn']('a11y', `could not run axe: ${err.message}`);
    return;
  }
  const policy = lagoonA11y();
  const kept = findings.filter((f) => !policy.ignore.has(f.id));
  if (!kept.length) {
    report.ok('a11y', `no axe violations in any declared scenario${policy.ignore.size ? ` (${policy.ignore.size} rule(s) ignored by config)` : ''}`);
    return;
  }
  // 'never' (the default) reports everything and fails on nothing; 'serious' and 'critical' promote at
  // that severity and above.
  const rank = { minor: 0, moderate: 1, serious: 2, critical: 3 };
  const bar = policy.fail === 'never' ? Infinity : rank[policy.fail] ?? Infinity;
  const say = (f) => `${f.impact}: ${f.help} — ${f.where || '?'} (${f.nodes} node(s), scenario "${f.scenario}")`;
  for (const f of kept) {
    if ((rank[f.impact] ?? 0) >= bar) report.error('a11y', say(f));
    else report.warn('a11y', say(f));
  }
}

/**
 * Scenario seeds have to cross into the browser, and the crossing is JSON.
 *
 * A `Set`, a `Map` or a function in a seed arrives as `{}` — so the island renders against a value of
 * the wrong SHAPE. When that throws (`favoriteIds.has is not a function`), the mount dies and EVERY
 * scenario renders empty, which the differentiation check then reports as "scenarios rendered
 * identically" and the responsive check as "renders nothing" — three misleading findings, none of them
 * naming the cause. Name it here instead, once, before those checks run.
 *
 * The fix is always at the component: take the ITERABLE, not the Set, and rebuild it inside.
 *
 * A `Date` USED TO BE ON THAT LIST and no longer is: the evidence hop marks and revives them
 * (lib/evidence-json.mjs), because a seed describing anything scheduled is made of dates and telling
 * an author to strip them is telling them not to seed their own domain.
 *
 * IT WALKS THE WHOLE SEED. Looking only at top-level values is what let this class through for as long
 * as it did: nobody seeds a bare Set, they seed a ROW that contains one — and what the author sees
 * instead of this message is the three misleading findings above. Found on a seeded session object
 * whose dates were two levels down, in a project whose whole domain is meetings.
 */
export async function seedTransportCheck(report, kebab) {
  const scenarios = await islandScenarios(kebab);
  if (!scenarios.length) return;
  // Either the real object (when the evidence was loaded in-process) or the marker the harness left
  // where one used to be (when it came back through JSON). Both, because both loaders are live.
  const kind = (v) =>
    v instanceof Set ? 'Set' : v instanceof Map ? 'Map' : typeof v === 'function' ? 'function' : lostMarker(v);
  /** Every untransportable value inside `value`, as `path (Kind)`. Cycle-safe; arrays keep their index. */
  const walk = (value, path, seen, out) => {
    const k = kind(value);
    if (k) {
      out.push(`${path} (${k})`);
      return;
    }
    if (!value || typeof value !== 'object' || value instanceof Date) return;
    if (seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${path}[${i}]`, seen, out));
      return;
    }
    for (const [key, v] of Object.entries(value)) walk(v, `${path}.${key}`, seen, out);
  };
  const bad = [];
  for (const s of scenarios) {
    for (const [key, value] of Object.entries(scenarioInputs(s))) {
      const found = [];
      walk(value, key, new Set(), found);
      for (const f of found) bad.push(`${s.name ?? '(unnamed)'} → ${f}`);
    }
  }
  if (bad.length) {
    report.error(
      'seed-transport',
      `seed value(s) that do not survive the trip into the browser: ${bad.join(', ')} — they arrive as {}, ` +
        `which breaks EVERY scenario, not just this one. Take an iterable/plain value in the component and rebuild the Set inside.`,
    );
  } else {
    // The count goes in `seen`, not the message: that is what makes `report.ok`'s "0 examined is a
    // skip" rule apply, so a run with no scenarios reports a SKIP instead of a green tick over nothing.
    report.ok('seed-transport', 'every scenario seed crosses into the browser intact', { n: scenarios.length, of: 'scenario seed(s)' });
  }
}

/**
 * The values an island's scenarios never show it.
 *
 * `data-flow` proves the scenarios DIFFER; nothing asks whether they differ in the ways that matter.
 * Two classes, both read from the VALUES the scenarios supply rather than from types, so this needs no
 * type-checker and says nothing about a prop no scenario sets:
 *   - a prop always given a non-empty array — the empty case is the one components forget;
 *   - a boolean prop that only ever takes one value — the other branch is never rendered.
 *
 * WHAT IT DOES NOT CATCH, stated because the case that prompted it is exactly this. An unguarded array
 * access reachable only with `compactMode: true` AND an empty list survived this check, and rightly:
 * each prop is well covered on its own — the region has an empty-list scenario and both values of the
 * boolean — and the hole is the CROSSING nothing renders. Per-prop coverage cannot see a per-pair gap,
 * and checking every pair over eight inputs would report more combinations than anyone would read.
 * The message says "cross it with the other inputs" because that is the part a human still owns.
 *
 * Deliberately not general property testing. These two are cheap, common and specific; everything
 * beyond them is a research project that would drown the report.
 */
export function inputCoverageCheck(report, scenarios) {
  if (!Array.isArray(scenarios) || scenarios.length === 0) return;
  const seen = new Map();
  for (const sc of scenarios) {
    for (const [prop, value] of Object.entries(sc?.seed || sc?.afterMount ? scenarioInputs(sc) : sc?.props ?? {})) {
      if (!seen.has(prop)) seen.set(prop, []);
      seen.get(prop).push(value);
    }
  }
  if (!seen.size) return;

  const gaps = [];
  for (const [prop, values] of seen) {
    if (values.every((v) => Array.isArray(v)) && !values.some((v) => v.length === 0)) {
      gaps.push(`${prop} is never seeded empty`);
      continue;
    }
    if (values.every((v) => typeof v === 'boolean') && new Set(values).size === 1) {
      gaps.push(`${prop} is only ever seeded ${values[0]}`);
    }
  }
  if (!gaps.length) {
    report.ok('input-coverage', 'every seeded input is shown in more than one shape', {
      n: seen.size,
      of: 'seeded input(s)',
    });
    return;
  }
  report.warn(
    'input-coverage',
    `${gaps.length}/${seen.size} seeded input(s) are only ever seeded one way: ${gaps.join(', ')} — the state ` +
      `nothing renders is the one that breaks. Add a scenario for it, and cross it with the other inputs ` +
      `rather than varying one at a time`,
  );
}

/** An island's declared scenarios, loaded from its evidence file (node strips the types). */
export async function islandScenarios(kebab) {
  const file = paths.fixturesFile(kebab);
  if (!existsSync(file)) return [];
  try {
    const mod = await import(`file://${file}?t=${Date.now()}`);
    const scenarios = Array.isArray(mod.scenarios) ? mod.scenarios : [];
    // A plain node import cannot resolve a `.js` specifier that points at a `.ts` sibling — which is
    // the convention every file here uses. It THREW, this returned [], and the island quietly lost
    // every scenario: `data-flow` still saw five (it loads through tsx) while `responsive` reported
    // one. Two loaders for one file, disagreeing in silence. Cross-check against the tsx loader and
    // take the fuller answer, so evidence can import a shared module like any other code.
    const viaTsx = readScenarios(file);
    return viaTsx.length > scenarios.length ? viaTsx : scenarios;
  } catch {
    return readScenarios(file);
  }
}

/**
 * Renders at every declared width, and fits.
 *
 * An error, not a warning: a page the member has to scroll sideways is broken, and the project rule
 * ("always implement mobile AND desktop") had no enforcement at all until this.
 */
export async function responsiveCheck(report, tag, kebab, port) {
  const viewports = lagoonViewports();
  if (!viewports.length) return;
  let measured;
  try {
    measured = await step('responsive', async () =>
      responsiveLagoon({ tag, port, viewports, scenarios: await islandScenarios(kebab) }));
  } catch (err) {
    report.warn('responsive', `could not measure viewports: ${err.message}`);
    return;
  }
  const overflowing = measured.filter((m) => m.overflow > 1);
  // Overflow is an error — a page the member has to pan sideways is broken. Rendering nothing is a
  // WARNING: an island's empty state can legitimately be empty, and only the author knows which.
  if (overflowing.length) {
    report.error(
      'responsive',
      `overflows horizontally at ${overflowing
        .map((m) => `${m.name} (${m.width}px, +${m.overflow}px${m.scenario === 'default' ? '' : `, "${m.scenario}"`})`)
        .join(', ')}`,
    );
  }
  if (measured.every((m) => !m.rendered)) {
    report.warn('responsive', 'renders nothing at any declared viewport, in any scenario — is there evidence that shows it?');
  }
  if (!overflowing.length && measured.some((m) => m.rendered)) {
    const widths = [...new Set(measured.map((m) => `${m.name} ${m.width}px`))].join(', ');
    const states = new Set(measured.map((m) => m.scenario)).size;
    report.ok('responsive', `fits every declared viewport (${widths}) in ${states} scenario(s)`);
  }
}
