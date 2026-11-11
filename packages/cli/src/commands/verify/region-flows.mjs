// A region's flows: catalogue, render coverage, mutation, what-if reach, live wiring.
// Split out of commands/verify.mjs; verify.mjs re-exports the public surface.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readRegions } from '../../lib/eject.mjs';
import { REPO_ROOT, TAG_PREFIX, paths } from '../../lib/util.mjs';
import { undrivenWrites } from '../../lib/writes-coverage.mjs';
import { probeWiring, runRegionFlows } from '../../playwright-lagoon.mjs';
import { CLI_PKG, HARNESS, islandScenarios, readScenarios } from './island-runtime.mjs';
import { declaredReach, operationReachCheck, operationUniverse, provenanceCheck } from './reach.mjs';
import { emittedLiveCheck, reportStoreComplaints, sourcesLiveCheck } from './region-sources.mjs';
import { environmentalCause, step } from './report.mjs';

/**
 * A CATALOGUE region's declared members are the members the data actually produces.
 *
 * Static by design and it needs no browser: the two inputs are the app's captured payloads and the
 * enum its own codegen emits. That is the whole reversal — a UI decided by data looked like the case
 * motu could say nothing about, and it is the case where the answer can be READ instead of inferred
 * from JSX. `<id>.evidence.ts` supplies them via `export const capture = { universe, present }`.
 */
export async function catalogueCheck(report, id, region) {
  const members = region.islands.filter((i) => i.member);
  if (!members.length) {
    report.warn('catalogue', 'region is declared `membership: \'catalogue\'` but no island declares a `member` — nothing ties a declaration to a data row');
    return;
  }
  const file = paths.archipelagoEvidence(id);
  if (!existsSync(file)) {
    report.warn(
      'catalogue',
      `${members.length} member type(s) declared and no capture to check them against — export \`capture\` ` +
        `from ${paths.rel(file)} pointing at the app's own fixtures, or the declaration is a guess`,
    );
    return;
  }

  const res = spawnSync(process.execPath, ['--import', 'tsx', HARNESS, '', file, 'native', 'catalogue'], {
    encoding: 'utf8',
    cwd: CLI_PKG,
    env: { ...process.env, MOTU_PROJECT_ROOT: REPO_ROOT, MOTU_CATALOGUE_DECLARED: JSON.stringify(members.map((i) => i.member)) },
  });
  let parsed = {};
  try {
    parsed = JSON.parse((res.stdout || '').trim().split('\n').filter(Boolean).pop());
  } catch {
    parsed = { error: (res.stderr || '').trim().split('\n').pop() || 'harness produced no output' };
  }
  if (parsed.error || !parsed.report) {
    // An evidence file carrying flows but no `capture` is the NORMAL state, not a broken read: the two
    // answer different questions (does the region move, vs are its declared members the real ones).
    const missing = /no `capture` export/.test(parsed.error ?? '');
    report.warn(
      'catalogue',
      missing
        ? `${members.length} member type(s) declared and no capture to check them against — add a \`capture\` ` +
            `export to ${paths.rel(file)} pointing at the app's own fixtures, or the declaration is a guess`
        : `capture could not be read from ${paths.rel(file)}: ${parsed.error ?? 'no report'}`,
    );
    return;
  }
  const { covered, uncovered, speculative, unreachable, coverage } = parsed.report;
  const presentTypes = covered.length + uncovered.length;

  if (unreachable.length)
    report.error(
      'catalogue',
      `${unreachable.join(', ')} — not in the app's own enum of member types, so no data row can ever summon ` +
        `${unreachable.length > 1 ? 'them' : 'it'}; the island is unreachable, not merely unexercised`,
    );
  if (uncovered.length)
    report.error(
      'catalogue',
      `${uncovered.join(', ')} — the capture contains ${uncovered.length > 1 ? 'these member types' : 'this member type'} and no island declares ` +
        `${uncovered.length > 1 ? 'them' : 'it'}; the region renders less than the page does, and the lagoon frame is short by that much`,
    );
  for (const t of speculative)
    report.warn('catalogue', `${t} declared but absent from the capture — no evidence has ever exercised it`);
  if (!uncovered.length && !unreachable.length)
    report.ok(
      'catalogue',
      `${covered.length}/${presentTypes} member type(s) in the capture are declared (${(coverage * 100).toFixed(0)}%)`,
      { n: presentTypes, of: 'member type(s) in the capture' },
    );
}

/**
 * Every slot a region declares should be asserted by some flow's `expectRender`.
 *
 * The gap this closes was found by running two agents in parallel. Both implemented their island
 * correctly; the MERGE went wrong — each had extended the lagoon frame's slot→row lookup, whose
 * fallback was another island's row, so resolving the conflict naively made one agent's widget render
 * as the other's. `archipelago verify --runtime` was byte-identical between the correct and the broken
 * resolution, because the frame is arrangement: not declared, and therefore not checked.
 *
 * What distinguishes them is an assertion on the island's OWN rendered output. A slot no flow looks at
 * can be wired to anything and stay green.
 *
 * A WARNING, not an error, and deliberately: the rule is new, and regions written before it would go
 * red wholesale — which teaches people to ignore the report rather than to fix it. It states the count
 * so the backlog is visible.
 */
export function renderCoverageCheck(report, id) {
  const region = readRegions(paths.archipelagosDir).find((r) => r.id === id);
  const slots = (region?.islands ?? []).filter((i) => !i.planned).map((i) => i.slot);
  if (!slots.length) return;

  const asserted = new Set();
  for (const scenario of readScenariosFor(id)) {
    for (const st of scenario.steps ?? []) {
      for (const slot of Object.keys(st.expectRender ?? {})) asserted.add(slot);
    }
  }
  const uncovered = slots.filter((s) => !asserted.has(s));
  if (!uncovered.length) {
    report.ok('render-coverage', `every declared slot is asserted by a flow`, { n: slots.length, of: 'slot(s) asserted' });
    return;
  }
  report.warn(
    'render-coverage',
    `${uncovered.length}/${slots.length} slot(s) no flow asserts: ${uncovered.join(', ')} — nothing distinguishes ` +
      `"this slot renders its own island" from "it renders someone else's data". Add a step with ` +
      `\`expectRender: { '<slot>': '<text the island itself produces>' }\``,
  );
}

/**
 * Every key a region declares an island WRITES should be moved by some flow.
 *
 * `wiring-live` is precise about what it proves: the region APPLIES a declared write when the event is
 * fired. It fires that event ITSELF, and so does a flow's `emit` — both go through the lagoon's emit
 * seam, not through the component. So neither can tell you the component still produces the event.
 *
 * Measured, and it corrected the guess that prompted this check: silencing a component's `onProgress`
 * in a real region changed nothing at any tier, EVEN THOUGH a flow drove `week-progress`. Driving a
 * coupling is not exercising the thing that emits it. That miss belongs to the runtime `emitted-live`,
 * which observes what actually fired; this check cannot catch it and does not claim to.
 *
 * What this one answers is narrower and still worth having: is this coupling exercised AT ALL? A
 * declared write no flow ever drives has never been shown to reach its key in a running region — the
 * declaration is unproven rather than merely unobserved. Static, because it is a question about the
 * evidence files, so it belongs in the fast loop.
 *
 * A WARNING, for the same reason `render-coverage` is one: the rule is new, and every region written
 * before it would go red wholesale, which teaches people to ignore the report rather than fix it.
 */
export function writesCoveredCheck(report, id) {
  const islands = declaredWrites(id);
  // Slot → the events that slot declares it writes on. A slot with no `writes` is not a finding.
  const declared = [];
  for (const island of islands) {
    for (const event of Object.keys(island.writes ?? {})) {
      const target = island.writes[event];
      const key = typeof target === 'string' ? target : (target?.key ?? Object.keys(target ?? {})[0] ?? '?');
      declared.push({ slot: island.slot, event, key });
    }
  }
  if (!declared.length) return;

  // Driven by an `emit`, or asserted where only its producer could have put it — see `undrivenWrites`.
  const undriven = undrivenWrites(declared, readScenariosFor(id));
  if (!undriven.length) {
    report.ok('writes-covered', 'every declared write is driven or asserted from its producer by a flow', {
      n: declared.length,
      of: 'declared write(s)',
    });
    return;
  }
  report.warn(
    'writes-covered',
    `${undriven.length}/${declared.length} declared write(s) no flow drives: ` +
      `${undriven.map((d) => `${d.slot} → ${d.key} (on "${d.event}")`).join(', ')} — the coupling is declared and ` +
      `never exercised, so the component could stop emitting it and nothing here would change. Add a step with ` +
      `\`emit: { slot: '<slot>', event: '<event>' }\` and an \`expect\` on what ANOTHER island then shows — or ` +
      `drive the island's own act and \`expect\` the key, with no seed or \`provide\` handing it a value`,
  );
}

/**
 * A step that cannot fail is not a check.
 *
 * Every green flow in this project has, at some point, been a tautology. The worst one asserted that
 * providing `editingWidgetId` made one island render "editing" and the other "idle" — and passed for
 * hours against stand-in components that printed those words because I had written them. Nothing
 * mechanical caught it; swapping in the app's real components did.
 *
 * TWO RULES, one static and one that runs:
 *
 *   BY CONSTRUCTION — a step whose `expect` names only keys that same step `provide`d asserts that the
 *   lagoon stored what it was handed. That cannot fail unless the lagoon itself is broken, and it is
 *   decidable without a browser.
 *
 *   BY MUTATION — change the STIMULUS and re-run. If the assertion still holds, it does not depend on
 *   the input, so the step is asserting a constant. This is the `data-flow` idea (a scenario set whose
 *   members render identically fails) applied per step to a region's flows.
 *
 * What neither rule catches, and it should be said rather than implied: an assertion on a stand-in's
 * invented vocabulary is sensitive to its stimulus and mutates correctly. Only rendering the
 * application's own component makes that one visible.
 */
/** The region's declared scenarios, by the same two paths `regionFlowCheck` uses. */
export function readScenariosFor(id) {
  const file = paths.archipelagoEvidence(id);
  if (!existsSync(file)) return [];
  const viaTsx = readScenarios(file);
  return Array.isArray(viaTsx) ? viaTsx : [];
}

/**
 * The mutants for a scenario set, and the findings that need no browser at all.
 *
 * Split out so the mutants can ride ALONG with the real flows in one page session. They used to be a
 * second `runRegionFlows` call, which meant a second lagoon boot — and booting is most of what a flow
 * check costs. One boot, both sets, partitioned by name afterwards.
 */
export function buildMutants(report, scenarios) {
  let vacuous = 0;
  for (const scenario of scenarios) {
    for (const [i, step] of (scenario.steps ?? []).entries()) {
      const expected = Object.keys(step.expect ?? {});
      const provided = Object.keys(step.provide ?? {});
      if (!expected.length || !provided.length) continue;
      if (expected.every((k) => provided.includes(k)) && !Object.keys(step.expectRender ?? {}).length) {
        vacuous++;
        report.error(
          'flow-mutation',
          `"${scenario.name ?? 'flow'}" step ${i + 1} expects only ${expected.join(', ')} — the key(s) it just ` +
            `provided. That asserts the lagoon stored what it was handed, not that the region did anything. ` +
            `End on a key another island produces, or on \`expectRender\` of an island that is not the one driven`,
        );
      }
    }
  }

  const mutants = [];
  let coverageOnly = 0;
  for (const scenario of scenarios) {
    for (const [i, step] of (scenario.steps ?? []).entries()) {
      if (!Object.keys(step.expect ?? {}).length && !Object.keys(step.expectRender ?? {}).length) continue;
      const mutated = mutateStimulus(step);
      if (!mutated) {
        coverageOnly++;
        continue;
      }
      mutants.push({
        name: `${MUTANT_PREFIX}${scenario.name ?? 'flow'} § ${i + 1}`,
        seed: scenario.seed,
        steps: [...(scenario.steps ?? []).slice(0, i), mutated],
      });
    }
  }
  return { mutants, coverageOnly, vacuous };
}

/**
 * The same step, driven differently.
 *
 * Deliberately crude: a value the region cannot mistake for the real one. Subtlety would only make it
 * possible for a mutant to reproduce the original behaviour by accident, which turns a tautology into
 * a pass — the exact failure this check exists to remove.
 */
export function mutateStimulus(step) {
  if (step.provide) {
    const provide = Object.fromEntries(
      Object.entries(step.provide).map(([k, v]) => [k, v === null || v === undefined ? '__motu_mutant__' : null]),
    );
    return { ...step, provide, __mutant: true };
  }
  if (step.emit) {
    return {
      ...step,
      emit: { ...step.emit, detail: step.emit.detail === null ? '__motu_mutant__' : null },
      __mutant: true,
    };
  }
  return null;
}

/** Mutant scenarios are tagged so one run can carry both sets and tell them apart afterwards. */
export const MUTANT_PREFIX = 'µ mutant · ';

/** Report what the mutants did — no browser here; they ran with the real flows. */
export function reportMutants(report, flows, { mutants, coverageOnly, vacuous }) {
  if (!mutants.length) {
    report.skip('flow-mutation', 'no step carries both a stimulus and an assertion, so there is nothing to mutate');
    return;
  }
  const lastOf = new Map();
  for (const f of flows) {
    if (!String(f.scenario).startsWith(MUTANT_PREFIX)) continue;
    const prev = lastOf.get(f.scenario);
    if (!prev || f.step > prev.step) lastOf.set(f.scenario, f);
  }
  const survived = [...lastOf.values()].filter((f) => f.ok);
  // A mutant that BROKE the region proves nothing. Crude values are deliberate — they must not
  // reproduce the original behaviour by accident — but emitting one can crash the island receiving it,
  // and a crash is not the assertion discriminating. Counting those as kills was hiding exactly the
  // tautology this check exists to find: a step asserting a total the PREVIOUS step already produced
  // was reported killed, because its mutant died on the way rather than on the claim.
  const broke = [...lastOf.values()].filter((f) => !f.ok && f.error && !(f.mismatches ?? []).length);

  // COUNT WHAT CAME BACK, not what was sent. Reporting `mutants.length` killed regardless of results
  // meant that when the mutants failed to come back at all — a tag that did not survive the round
  // trip, say — the check printed a confident green for work it never saw. Which is the exact failure
  // `report.ok(…, seen)` exists to prevent, reproduced inside the check that polices tautologies.
  if (lastOf.size !== mutants.length) {
    report.inconclusive(
      'flow-mutation',
      `sent ${mutants.length} mutant(s) and got ${lastOf.size} back — the run did not answer for all of ` +
        `them, so nothing is proved about the ones missing`,
    );
    return;
  }
  for (const s of survived) {
    report.error(
      'flow-mutation',
      `"${String(s.scenario).replace(MUTANT_PREFIX, '')}" still holds when its input is changed — the assertion ` +
        `does not depend on what the step does, so it is asserting a constant. Assert something the stimulus moves`,
    );
  }
  for (const b of broke) {
    report.warn(
      'flow-mutation',
      `"${String(b.scenario).replace(MUTANT_PREFIX, '')}" broke the region when its input was mutated ` +
        `(${b.error}) — the assertion was never evaluated, so this step's discrimination is unproven`,
    );
  }
  if (!survived.length && !vacuous)
    report.ok(
      'flow-mutation',
      `${lastOf.size - broke.length}/${mutants.length} step(s) fail on their assertion when mutated` +
        (coverageOnly ? `; ${coverageOnly} coverage step(s) have no input to mutate` : ''),
      { n: mutants.length, of: 'mutant(s) killed' },
    );
}

/**
 * The region's declared flows end where they say they do.
 *
 * Optional: a region with no `<id>.evidence.ts` is reported as having none, rather than passing
 * quietly — a check that says nothing is indistinguishable from one that did not run.
 */
export async function regionFlowCheck(report, id, port, region) {
  const file = paths.archipelagoEvidence(id);
  if (!existsSync(file)) {
    report.warn('region-flow', 'no declared flows — add `<id>.evidence.ts` with the couplings this region promises');
    return;
  }
  let scenarios = [];
  try {
    const mod = await import(`file://${file}?t=${Date.now()}`);
    scenarios = Array.isArray(mod.scenarios) ? mod.scenarios : [];
  } catch {
    // Same trap as the island evidence: a plain node import cannot resolve a `.js` specifier pointing
    // at a `.ts` sibling, which is the convention every file here uses. Fall through to the tsx
    // loader rather than reporting "no flows" for a file that declares several.
    scenarios = readScenarios(file);
  }
  if (!scenarios.length) {
    report.warn('region-flow', 'declared flows could not be read, or none are declared');
    return;
  }
  const steps = scenarios.reduce((n, s) => n + (s.steps?.length ?? 0), 0);
  if (!steps) {
    report.warn('region-flow', 'evidence declares no steps — a flow is a seed, an emit and an expectation');
    return;
  }
  // The mutants ride along: one lagoon boot answers "do the flows hold?" and "could they have
  // failed?" together. Booting is most of what a flow check costs, and this was paying it twice.
  const mutation = buildMutants(report, scenarios);

  let results;
  let suspects = [];
  try {
    // What the chart needs: the real flows, and every island's scenarios keyed by its tag.
    const chartWith = { flows: scenarios, scenarios: await regionWhatIfs(region) };
    const run = await step('region-flow', () =>
      runRegionFlows({ id, port, scenarios: [...scenarios, ...mutation.mutants], chartWith }),
    );
    results = (run.flows ?? []).filter((f) => !String(f.scenario).startsWith(MUTANT_PREFIX));
    reportMutants(report, run.flows ?? [], mutation);
    suspects = run.suspects ?? [];
    reportStoreComplaints(report, run.diagnostics, 'declared flows');
    provenanceCheck(report, id, region, run.provenance ?? [], run.outbound ?? []);
  // Beside provenance because it reads the SAME ledger: provenance says what was asked for, this
  // says whether it exists. No extra page, no navigation — the lane reuses one.
  operationReachCheck(report, run.outbound ?? [], operationUniverse(), declaredReach({ regionId: id }));
    sourcesLiveCheck(report, id, run.channels, region, run.held ?? []);
    emittedLiveCheck(report, id, run.renderOutputs);
    whatIfReachCheck(report, run.chart);
  } catch (err) {
    // A ReferenceError or a TypeError here is a BUG IN THIS FILE, not a region that could not be
    // driven — and reporting it as a warning meant the flows silently stopped running twice today
    // while the check still passed. Fail loudly for those; keep the warning for real inability.
    if (err instanceof ReferenceError || err instanceof TypeError) throw err;
    report[environmentalCause(err) ? 'inconclusive' : 'warn'](
      'region-flow',
      `could not run declared flows: ${err.message}`,
    );
    return;
  }
  for (const s of suspects) {
    report.warn(
      'laundering',
      `the host wrote "${s.key}" (read by ${s.readers.join(', ')}) ${s.gapMs}ms after ${s.after.slot} emitted ` +
        `"${s.after.event}" — if that value is derived from what ${s.after.slot} did, declare it as an output ` +
        `instead of feeding it from the page`,
    );
  }
  for (const r of results.filter((x) => !x.ok)) {
    const detail = r.error
      ? r.error
      : r.mismatches.map((m) => `${m.key}: expected ${JSON.stringify(m.expected)}, got ${JSON.stringify(m.actual)}`).join('; ');
    report.error('region-flow', `"${r.scenario}" step ${r.step}: ${detail}`);
  }
  const passed = results.filter((r) => r.ok).length;
  if (passed === results.length)
    report.ok('region-flow', `${passed} declared flow step(s) end as declared`, { n: passed, of: 'step(s)' });
}

/** Each island's scenarios in a region, keyed by its element tag — what the chart places. */
export async function regionWhatIfs(region) {
  const out = {};
  for (const island of region?.islands ?? []) {
    const tag = island.element;
    if (!tag || out[tag]) continue;
    const kebab = tag.startsWith(TAG_PREFIX) ? tag.slice(TAG_PREFIX.length) : tag;
    out[tag] = await islandScenarios(kebab);
  }
  return out;
}

/**
 * WHICH WHAT-IFS A FLOW REACHES — the chart, reported.
 *
 * An island scenario played in its region is a what-if: the island is TOLD a state. A flow is the
 * region getting somewhere by its own wiring. Often they are the same situation, and the chart (the
 * lagoon's `chartRegion`, the same function the dock's Chart runs) finds the pairs by replaying the
 * flows and comparing the store. What is left over is the finding:
 *   - UNREACHED: no flow ends in that situation — a flow is missing, or the app never gets there and
 *     the island renders a state that does not exist. Named with the nearest step and what differs.
 *   - CONTEXT: a flow reaches the situation only with other context (another `me`). For a what-if
 *     whose point IS that context ("a guest"), no flow runs that way.
 * Warnings, never errors: a what-if no flow reaches can be deliberate (an error state the lagoon
 * cannot provoke), and whether it is, is the author's call. What a check owes them is the knowing.
 */
export function whatIfReachCheck(report, chart) {
  if (!chart) {
    report.skip('what-if-reach', 'this lagoon build predates the chart — rebuild it to place what-ifs against flows');
    return;
  }
  if (chart.error) {
    report.warn('what-if-reach', `could not chart the region: ${chart.error}`);
    return;
  }
  const placed = chart.whatIfs.filter((w) => w.status !== 'not-comparable');
  const reached = placed.filter((w) => w.status === 'reached' || w.status === 'seeded');
  const unreached = placed.filter((w) => w.status === 'unreached');
  const context = placed.filter((w) => w.status === 'context');
  for (const w of unreached) {
    const near = w.nearest
      ? ` — nearest: "${w.nearest.flow}" step ${w.nearest.step}, where ${w.nearest.differs.join(', ')} still differ${w.nearest.differs.length === 1 ? 's' : ''}`
      : '';
    report.warn('what-if-reach', `${w.slot} · "${w.name}" is shown only by telling the island; no flow reaches it${near}`);
  }
  for (const w of context) {
    const r = w.reachedBy[0];
    const empty = r.emptyHere ?? [];
    const set = r.absent.filter((k) => !empty.includes(k));
    const parts = [];
    // Two directions, said the right way round: the what-if leaves a key empty that every flow sets
    // ("a guest"), or sets one every flow leaves empty ("in the directory", where no flow picks a section).
    if (empty.length) parts.push(`no flow runs with ${empty.join(', ')} empty, as this what-if does`);
    if (set.length) parts.push(`no flow sets ${set.join(', ')}, as this what-if does`);
    report.warn('what-if-reach', `${w.slot} · "${w.name}" is reached by "${r.flow}" step ${r.step} only in another context — ${parts.join('; ')}`);
  }
  if (!unreached.length && !context.length) {
    report.ok('what-if-reach', `every what-if a flow could reach is reached by one`, { n: reached.length, of: 'what-if(s) placed' });
  }
}

/**
 * Every declared wire carries something.
 *
 * The runtime half of the ownership work: `RegionWiringOk` proves an event NAME resolves to an island
 * that declares it, and that is all a type can do. Whether firing it actually moves the key it claims
 * to write is a question only a run answers — and a wire that resolves, compiles and moves nothing is
 * exactly what a broken change looks like from outside.
 */
export async function wiringProbe(report, id, port) {
  const islands = declaredWrites(id);
  if (!islands.length) return;
  let results;
  try {
    const probe = await step('wiring-live', () => probeWiring({ id, port, islands }));
    results = probe.results;
    reportStoreComplaints(report, probe.diagnostics, 'wiring probe');
  } catch (err) {
    report[environmentalCause(err) ? 'inconclusive' : 'warn'](
      'wiring-live',
      `could not probe declared writes: ${err.message}`,
    );
    return;
  }
  const noSeam = results.filter((r) => r.reason === 'no-seam');
  const unmounted = results.filter((r) => r.reason === 'not-mounted');
  const dead = results.filter((r) => r.moved === false);
  const live = results.filter((r) => r.moved === true);

  if (noSeam.length) {
    report.skip('wiring-live', 'this mount path has no emit seam — probing declared writes needs the React lagoon');
    return;
  }
  for (const r of unmounted) {
    report.error('wiring-live', `${r.slot} declares it writes "${r.key}", but this region mounts no island under that slot`);
  }
  for (const r of dead) {
    report.error('wiring-live', `${r.slot} declares it writes "${r.key}" on "${r.event}", but firing it changed nothing`);
  }
  if (live.length && !dead.length && !unmounted.length) {
    // Deliberately precise about what this proves: the region APPLIES each declared write. Whether the
    // component ever emits it is a different question, and one only a declared interaction can ask
    // (nothing here touches the DOM, on purpose).
    report.ok(
      'wiring-live',
      `${live.length} declared write(s) reach their key: ${live.map((r) => `${r.slot} → ${r.key}`).join(', ')}`,
      { n: live.length, of: 'declared write(s)' },
    );
  }
}

/** `writes` per island, read from the config's text — the same reader eject uses. */
export function declaredWrites(id) {
  const file = paths.archipelagoFile(id);
  if (!existsSync(file)) return [];
  return readRegions(paths.archipelagosDir)
    .find((r) => r.id === id)
    // `planned` ISLANDS ARE NOT HERE YET, and both readers of this list ask a question only a built
    // island can answer. `wiring-live` mounts the slot and fires the event — a slot nobody has
    // written mounts nothing, so it reported "this region mounts no island under that slot" as an
    // ERROR against a region that is behaving exactly as declared. `writes-covered` asks for a flow
    // driving the write, and no flow can drive an island that does not exist.
    //
    // That is the whole point of the flag: ownership still counts a planned entry — a second claim on
    // its keys fails as if it were built — while the checks that ask "does it exist, does it mount,
    // is it placed" skip it. This list had never been told, so demo-app's surveyed booking region was
    // red in the runtime tier for having a survey.
    ?.islands.filter((i) => !i.planned && Object.keys(i.writes ?? {}).length) ?? [];
}
