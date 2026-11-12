// THE STATE PLAYER — one place that puts a REGION into a declared state, whatever view it is shown in.
//
// A state is not a property of a view. A region flow moves a region's store; an island scenario sets
// the inputs of an island, which live in its region's store. The view — an island alone, a region, a
// screen — only decides how much of the application is drawn around that store. So a state is played
// on a REGION, and any view that has that region mounted can show it.
//
// This used to be four copies (the browser checks, the --fast harness, the gallery, the focused
// entry), each applying a scenario its own way. `afterMount` had to be added four times, and the
// "previous island's state leaks into the next" fault existed in two of them separately. Everything
// in-page now asks this module.
//
// ONE STATE PER REGION. Regions share nothing, so on a screen the sidebar can sit in one state and the
// main region in another; within one region, a new state replaces the last one (reset first). Stacking
// would need a rule for which value wins per key, and nothing needs one yet.
//
// REACHABLE vs WHAT-IF. A flow only fires declared outputs, so the state it reaches is one the app can
// reach. An island scenario played INSIDE a region sets that island's inputs directly — and where one
// of those keys is PRODUCED by another island, it forges a value the app may never pair with the rest
// of the screen. Both are playable; the outcome says which it is, and names the forged keys.
import { archipelagoConfigs, bindEntries, getArchipelagoStore, getMountedIslands, writtenKeys, type HostBridge, type Store } from '@motu/core';
import type { ArchipelagoConfig } from '@motu/core';
import type { RegionScenario, Scenario } from '@motu/runtime/mock';
import { lagoonHarness, type LagoonHarness } from './lagoon-harness';
import { currentWorld, setWorld, worldExists, DEFAULT_WORLD } from './lagoon-worlds';
import { pickState, replayFlow, replayInteractionsIn, slug, stateNames, type LagoonEvidence, type StateOutcome } from './lagoon-states';

/** A declared state, addressed by the region it is played on. */
export type StateRef =
  | { region: string; kind: 'flow'; name: string; step?: number | null }
  | { region: string; kind: 'scenario'; island: string; name: string; step?: number | null };

/** What playing a state did — the outcome every entry already reports, plus what kind of claim it is. */
export interface PlayOutcome extends StateOutcome {
  /** `reachable` for a flow; `what-if` for an island scenario played inside its region. */
  claim?: 'reachable' | 'what-if';
  /** Region keys the scenario set that another island in the region PRODUCES — forged, not reached. */
  forged?: { key: string; owner: string }[];
}

interface RegionEntry {
  config: ArchipelagoConfig;
  seed?: Record<string, unknown>;
  host?: HostBridge;
}

/** Every region a view has mounted, by id: what a harness needs to drive it. */
const mounted = new Map<string, RegionEntry>();

/**
 * Record a mounted region. Called by `regionTree`, which every view goes through — the region view,
 * the mountpoints view, each region on a screen, a region referenced from another one.
 */
export function registerLagoonRegion(config: ArchipelagoConfig, opts: { seed?: Record<string, unknown>; host?: HostBridge }): void {
  mounted.set(config.id, { config, seed: opts.seed, host: opts.host });
}

/** The ids of the regions mounted right now (a store is registered for them). */
export function mountedRegionIds(): string[] {
  return [...mounted.keys()].filter((id) => !!getArchipelagoStore(id));
}

/** A harness on one mounted region — the per-region twin of `window.__motuLagoon`. */
export function regionHarness(id: string): LagoonHarness | null {
  const entry = mounted.get(id);
  if (!entry || !getArchipelagoStore(id)) return null;
  return lagoonHarness(entry.config, { seed: entry.seed, host: entry.host });
}

/** The state each region is in, valid only for the STORE it was played on — a region rebuilt since starts over. */
const active = new Map<string, { ref: StateRef; store: Store; outcome: PlayOutcome }>();

export function activeStates(): { ref: StateRef; outcome: PlayOutcome }[] {
  const out: { ref: StateRef; outcome: PlayOutcome }[] = [];
  for (const [id, a] of active) {
    if (getArchipelagoStore(id) === a.store) out.push({ ref: a.ref, outcome: a.outcome });
    else active.delete(id);
  }
  return out;
}

/** Per-region remount requests — `RegionRemount` (lagoon-react-mount) subscribes for its region. */
const remounts = new Map<string, Set<() => void>>();
export function subscribeRegionRemount(id: string, fn: () => void): () => void {
  if (!remounts.has(id)) remounts.set(id, new Set());
  remounts.get(id)!.add(fn);
  return () => remounts.get(id)?.delete(fn);
}
/** Remount a region's islands (its store stays). False when nothing is mounted to remount. */
function remountRegion(id: string): boolean {
  const fns = remounts.get(id);
  if (!fns?.size) return false;
  fns.forEach((f) => f());
  return true;
}

const listeners = new Set<() => void>();
/** Told whenever a region's state changes — the dock repaints on it. */
export function subscribeStates(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const changed = () => listeners.forEach((l) => l());

/** The config a region id names, mounted or declared. */
function configOf(id: string): ArchipelagoConfig | undefined {
  return mounted.get(id)?.config ?? (archipelagoConfigs().find((c) => c.id === id) as ArchipelagoConfig | undefined);
}

/**
 * Every state a set of mounted regions can be played in: each region's flows, and the scenarios of
 * every island it places. What the dock lists as "states in this view".
 */
export function statesFor(regionIds: readonly string[], evidence: LagoonEvidence | undefined): {
  region: string;
  flows: string[];
  islands: { tag: string; slot: string; scenarios: string[] }[];
}[] {
  return regionIds.map((region) => {
    const config = configOf(region);
    const seen = new Set<string>();
    const islands: { tag: string; slot: string; scenarios: string[] }[] = [];
    for (const island of config?.islands ?? []) {
      const tag = island.element;
      if (!tag || seen.has(tag)) continue; // one element in two slots is one island
      seen.add(tag);
      islands.push({ tag, slot: island.slot, scenarios: stateNames(evidence?.scenarios?.[tag]) });
    }
    return { region, flows: stateNames(evidence?.flows?.[region]), islands };
  });
}

/**
 * An island scenario's inputs as REGION keys — through the island's `bind` (prop -> region key), so
 * a renamed binding lands where the island reads it. A prop the island does not bind has no region key
 * and is returned separately: it cannot be played inside the region at all.
 */
export function scenarioToRegion(
  config: ArchipelagoConfig,
  tag: string,
  values: Record<string, unknown> | undefined,
): { keys: Record<string, unknown>; unbound: string[] } {
  const island = config.islands.find((i) => i.element === tag);
  const byProp = new Map<string, string>();
  if (island) for (const [prop, key] of bindEntries(island)) byProp.set(prop, key);
  const keys: Record<string, unknown> = {};
  const unbound: string[] = [];
  for (const [prop, value] of Object.entries(values ?? {})) {
    const key = byProp.get(prop);
    if (key) keys[key] = value;
    else unbound.push(prop);
  }
  return { keys, unbound };
}

/** The keys in `keys` that some OTHER island in the region declares it writes. */
function forgedKeys(config: ArchipelagoConfig, tag: string, keys: readonly string[]): { key: string; owner: string }[] {
  const out: { key: string; owner: string }[] = [];
  for (const island of config.islands) {
    if (island.element === tag) continue;
    for (const key of writtenKeys(island)) if (keys.includes(key)) out.push({ key, owner: island.slot });
  }
  return out;
}

/**
 * Put one region into one declared state. Resets the region first: one state per region, and a state
 * applied on top of another is neither of them.
 */
export async function playState(
  ref: StateRef,
  evidence: LagoonEvidence | undefined,
  /** `fresh`: the caller has just mounted the region from its seed, so there is nothing to reset. */
  opts: { fresh?: boolean } = {},
): Promise<PlayOutcome> {
  const target = ref.kind === 'flow' ? `archipelago:${ref.region}` : `island:${ref.island}`;
  // A FLOW RUNS IN ITS OWN WORLD. Switching rebuilds what is on screen (the entries listen), so the
  // region is mounted fresh with that world's answers — wait for the NEW store, then play from it.
  if (ref.kind === 'flow') {
    const declared = (pickState(evidence?.flows?.[ref.region], ref.name) as { world?: string } | undefined)?.world;
    const want = declared ?? DEFAULT_WORLD;
    if (!worldExists(want)) {
      return { ok: false, target, kind: 'flow', name: ref.name, error: `the flow "${ref.name}" names world "${want}", which is not declared` };
    }
    if (want !== currentWorld()) {
      const before = getArchipelagoStore(ref.region);
      setWorld(want);
      for (let waited = 0; waited < 5000; waited += 100) {
        const now = getArchipelagoStore(ref.region);
        if (now && now !== before) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      opts = { ...opts, fresh: true };
    }
  }
  // WAIT FOR THE REGION, bounded, before refusing. A region's store is created by its first island's
  // render, a beat after the view mounts it; the gallery asks for an addressed state right away, and on
  // a page as large as Peps' the store was not there yet — so a valid flow address was refused as "not
  // mounted" while the region rendered beside the banner. Still refused after 5s: a name that resolves
  // to nothing must never quietly render the default.
  let h = regionHarness(ref.region);
  for (let waited = 0; !h && waited < 5000; waited += 100) {
    await new Promise((r) => setTimeout(r, 100));
    h = regionHarness(ref.region);
  }
  if (!h) return { ok: false, target, kind: ref.kind, name: ref.name, error: `region "${ref.region}" is not mounted in this view` };
  const store = getArchipelagoStore(ref.region)!;

  let outcome: PlayOutcome;
  if (ref.kind === 'flow') {
    const flow = pickState(evidence?.flows?.[ref.region], ref.name) as RegionScenario | undefined;
    if (!flow) {
      return { ok: false, target, kind: 'flow', name: ref.name, error: `no flow "${ref.name}" in ${ref.region}`, available: stateNames(evidence?.flows?.[ref.region]) };
    }
    // The DECLARED name from here on, not the slug an address carried: it is what the dock lights.
    ref = { ...ref, name: flow.name ?? ref.name };
    if (!opts.fresh) h.reset();
    outcome = { ...(await replayFlow(flow, ref.step ?? null, h)), target, claim: 'reachable' };
  } else {
    outcome = await playScenarioInRegion(ref, h, evidence);
    if (outcome.name) ref = { ...ref, name: outcome.name };
  }
  // A FAILED play leaves the region where the failure left it, and says so — it is not recorded as
  // the region's state, because it is not one.
  if (outcome.ok) active.set(ref.region, { ref, store, outcome });
  else active.delete(ref.region);
  changed();
  return outcome;
}

/** Back to the region as its view seeds it — no declared state applied. */
export function clearState(region: string): boolean {
  const h = regionHarness(region);
  if (!h) return false;
  h.reset();
  active.delete(region);
  changed();
  return true;
}

/** An island scenario, played on the island's REGION rather than on the island alone. */
async function playScenarioInRegion(
  ref: Extract<StateRef, { kind: 'scenario' }>,
  h: LagoonHarness,
  evidence: LagoonEvidence | undefined,
): Promise<PlayOutcome> {
  const target = `island:${ref.island}`;
  const scenario = pickState(evidence?.scenarios?.[ref.island], ref.name) as Scenario | undefined;
  if (!scenario) {
    return { ok: false, target, kind: 'scenario', name: ref.name, error: `no scenario "${ref.name}" in ${ref.island}'s evidence`, available: stateNames(evidence?.scenarios?.[ref.island]) };
  }
  const config = configOf(ref.region)!;
  const seed = scenarioToRegion(config, ref.island, scenario.seed);
  const later = scenarioToRegion(config, ref.island, scenario.afterMount);
  const unbound = [...seed.unbound, ...later.unbound];
  if (unbound.length) {
    // A prop the region does not bind is one the PAGE passes directly — playing the rest would show a
    // state the scenario does not describe, under its name.
    return {
      ok: false, target, kind: 'scenario', name: scenario.name,
      error: `${ref.island} is not bound to ${unbound.map((p) => `"${p}"`).join(', ')} in ${ref.region} — this scenario only exists for the island alone`,
    };
  }
  const keys = [...Object.keys(seed.keys), ...Object.keys(later.keys)];
  h.reset();
  // The scenario's keys are its own: pinned before they land, so a source answering cannot take them.
  h.pin(keys);
  // ESTABLISHED, then the islands REMOUNT: a scenario's `seed` is what the island mounts with, and on a
  // screen the island is already up. Providing it to a live island would make it an arrival — the
  // sphère sheet would open on "a request already there at mount", the one thing that scenario pins.
  for (const [k, v] of Object.entries(seed.keys)) h.seed(k, v);
  remountRegion(ref.region);
  // A key ANOTHER island owns is forged, not fed: written as a seed so motu's ownership guard does not
  // read the harness as a host reaching into island-owned state. The forging is not hidden — the outcome
  // names every such key, and the dock and the lens show them.
  const owned = new Set(forgedKeys(config, ref.island, Object.keys(later.keys)).map((f) => f.key));
  const outcome = await replayInteractionsIn(scenario, ref.step ?? null, {
    provide: (k, v) => (owned.has(k) ? h.seed(k, v) : h.provide(k, v)),
    afterMount: later.keys,
    mounted: () => getMountedIslands().some((i) => i.store === getArchipelagoStore(ref.region)),
  });
  return { ...outcome, target, claim: 'what-if', forged: forgedKeys(config, ref.island, keys) };
}

/** The id every lone island is mounted under — not a region of the app, so never "in view" as one. */
const LONE_ISLAND = 'lagoon';

/**
 * The regions ON SCREEN right now: registered, with a store, and with islands actually mounted on it.
 * The mounted-island registry is what makes this honest — a region an earlier view built and left
 * behind keeps its store, but nothing of it is drawn.
 */
export function regionsInView(): string[] {
  return mountedRegionIds().filter(
    (id) => id !== LONE_ISLAND && getMountedIslands().some((i) => i.store === getArchipelagoStore(id)),
  );
}

// --- the chart: which what-ifs a flow actually reaches -------------------------------------------
//
// A what-if and a flow often describe the SAME situation reached two ways — event-detail told "full",
// and the flow "a full event refuses the RSVP". Nothing said so, which is why the two lists read as
// unrelated. The chart finds the pairs instead of asking anyone to write them down: replay every flow
// once, read the region's store after each step, and compare.
//
// SITUATION, NOT CONTEXT. Comparing every key a what-if sets found no pair at all on the demo, and
// rightly: the "full" what-if is seeded as one member and the flow runs as another. Same situation,
// different setting. So the flows decide which keys are which: a key some flow step MOVES is part of
// the SITUATION (`selectedEventId`, `rsvp`, `filter`); a key no flow ever moves is CONTEXT (`me`).
// A LIST is never situation, even when a flow moves it: `events` changes when an RSVP is counted, but
// a list is the DATA the region is shown — every what-if carries its own copy, so comparing it compares
// fixtures, and it never matched. A selection, a filter, a pending request say where the region IS;
// a list says what it is looking at. A what-if is REACHED by a step that leaves the region holding all its situation keys, when
// the flow moved at least one of them to get there — a match the flow did nothing to earn is the seed
// talking. Context that differs is reported, never disqualifying.
//
// What that buys is the honest half of a what-if. One a flow reaches is a situation the app gets to by
// its own wiring, and the flow is how. One NO flow reaches is shown only by telling the island: either
// a flow is missing, or the app never gets there and the island renders a state that does not exist.
// For those the chart names the NEAREST step and the keys that still differ, which is the link and the
// reason in one line.
//
// ONE IMPLEMENTATION, two readers: the dock charts the region on screen when asked, and the CLI's
// region lane charts every region and reports. Both call this.

/**
 * Where a what-if stands against the region's flows.
 *  - `reached`: a flow step holds its situation, in the same context.
 *  - `context`: a flow step holds its situation, but only where some context is PRESENT on one side and
 *    ABSENT on the other (`me: null`, "a guest", against a member) — no flow runs in that kind of
 *    context. Another value of the same kind ("as Rich" against "as Dennis") is still `reached`.
 *  - `seeded`: its situation already holds before any step; the page sets it, no flow reaches it.
 *  - `unreached`: no flow step holds its situation.
 *  - `not-comparable`: it cannot be placed by keys — `reason` says why.
 */
export type ChartStatus = 'reached' | 'context' | 'seeded' | 'unreached' | 'not-comparable';

/** One what-if, and how the region's flows relate to it. */
export interface ChartedWhatIf {
  island: string;
  slot: string;
  name: string;
  /** The region keys the what-if sets, after the island's `bind`. */
  keys: string[];
  /** Of those, the ones a flow moves that are not lists — the situation. The rest are context. */
  situation: string[];
  status: ChartStatus;
  /**
   * Each flow step that reaches it. `context`: the context keys that differ there. `absent`: those of
   * them where one side HAS a value and the other has none — the difference between "as Rich" and "as
   * Dennis" is who; the difference between "as a guest" and "as a member" is what kind of situation.
   * `emptyHere`: the absent keys this what-if is the empty side of ("a guest") — the rest it sets and the
   * flows leave empty ("in the directory", where no flow picks a section).
   */
  reachedBy: { flow: string; step: number; context: string[]; absent: string[]; emptyHere: string[] }[];
  /** When nothing reaches it: the closest step, and the situation keys still apart. */
  nearest?: { flow: string; step: number; differs: string[] };
  /** Why it could not be compared, when it could not. */
  reason?: string;
}

export interface RegionChart {
  region: string;
  whatIfs: ChartedWhatIf[];
  /** Each flow as it replayed — a flow that failed to replay reaches nothing, and says so. */
  flows: { name: string; steps: number; ok: boolean; error?: string }[];
  /** The keys some flow moved: what counts as situation in this region. */
  situation: string[];
  at: number;
}

const charts = new Map<string, RegionChart>();

/** The last chart of a region, if it has been charted in this page. */
export function regionChart(region: string): RegionChart | null {
  return charts.get(region) ?? null;
}

/** A recorded value that holds nothing — the "absent" side of a context difference. */
function isEmpty(json: string): boolean {
  return json === 'null' || json === '[]' || json === '{}' || json === '""' || json === 'false';
}

/** JSON with object keys sorted, so `{a, b}` and `{b, a}` compare equal. */
function stableJson(value: unknown): string {
  return JSON.stringify(value === undefined ? null : value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, (v as Record<string, unknown>)[k]]))
      : v,
  );
}

/** One flow as replayed: the region's store, as JSON per key, after its seed (0) and after each step. */
export interface ChartRun {
  flow: string;
  steps: Record<string, string>[];
}

/** One island scenario, translated into the region's keys (see `scenarioToRegion`). */
export interface ChartCandidate {
  island: string;
  slot: string;
  name: string;
  keys: Record<string, unknown>;
  /** Props the region does not bind — such a scenario exists only for the island alone. */
  unbound: string[];
  /** It ends on its own interactions, which a comparison of keys cannot follow. */
  interactions: boolean;
}

/**
 * Place every what-if against the flows' snapshots. PURE — the browser half (`chartRegion`) replays
 * and snapshots; this decides, so the rule itself is tested without a page.
 */
export function placeWhatIfs(region: string, runs: readonly ChartRun[], candidates: readonly ChartCandidate[]): { situation: string[]; whatIfs: ChartedWhatIf[] } {
  // THE SITUATION: every key some step of some flow moved away from where that flow started.
  const moved = new Set<string>();
  for (const run of runs) {
    const start = run.steps[0] ?? {};
    for (const snap of run.steps.slice(1)) {
      for (const k of new Set([...Object.keys(start), ...Object.keys(snap)])) {
        if ((snap[k] ?? 'null') !== (start[k] ?? 'null')) moved.add(k);
      }
    }
  }

  const whatIfs = candidates.map((c): ChartedWhatIf => {
    const names = Object.keys(c.keys);
    const situation = names.filter((k) => moved.has(k) && !Array.isArray(c.keys[k]));
    const entry: ChartedWhatIf = { island: c.island, slot: c.slot, name: c.name, keys: names, situation, status: 'not-comparable', reachedBy: [] };
    if (c.unbound.length) return { ...entry, reason: `sets ${c.unbound.map((p) => `"${p}"`).join(', ')}, which ${region} does not bind` };
    if (c.interactions) return { ...entry, reason: 'ends on its own interactions, which a comparison of keys cannot follow' };
    if (!names.length) return { ...entry, reason: 'sets no region key — it is the island on its defaults' };
    if (!situation.length) {
      return { ...entry, reason: `sets only data and context (${names.join(', ')}) — no selection, filter or request a flow moves, so there is nothing for a flow to reach` };
    }

    const want = Object.fromEntries(names.map((k) => [k, stableJson(c.keys[k])]));
    const equal = (snap: Record<string, string>, k: string) => (snap[k] ?? 'null') === want[k];
    let best: { flow: string; step: number; score: number; differs: string[] } | null = null;
    let seeded = false;
    for (const run of runs) {
      const start = run.steps[0] ?? {};
      run.steps.forEach((snap, step) => {
        const hits = situation.filter((k) => equal(snap, k));
        const touched = situation.some((k) => (snap[k] ?? 'null') !== (start[k] ?? 'null'));
        if (hits.length === situation.length) {
          // Reached only when this flow MOVED a situation key on the way — otherwise the seed did it.
          if (step > 0 && touched) {
            const context = names.filter((k) => !moved.has(k) && !equal(snap, k));
            const absent = context.filter((k) => isEmpty(want[k]) !== isEmpty(snap[k] ?? 'null'));
            entry.reachedBy.push({ flow: run.flow, step, context, absent, emptyHere: absent.filter((k) => isEmpty(want[k])) });
          } else seeded = true;
        }
        // NEAREST: most situation keys held. On a tie, the step whose flow MOVED the keys that still
        // differ — that flow is working on exactly what is missing ("saving" is nearest to the step that
        // set `rsvp`, not the one before it); then any step that moved something over an untouched seed.
        const differs = situation.filter((k) => !equal(snap, k));
        const movedHere = (k: string) => (snap[k] ?? 'null') !== (start[k] ?? 'null');
        const score = hits.length * 4 + differs.filter(movedHere).length * 2 + (touched ? 1 : 0);
        if (score > 0 && (!best || score > best.score)) best = { flow: run.flow, step, score, differs };
      });
    }
    if (entry.reachedBy.some((r) => !r.absent.length)) entry.status = 'reached';
    else if (entry.reachedBy.length) entry.status = 'context';
    else if (seeded) entry.status = 'seeded';
    else {
      entry.status = 'unreached';
      const b = best as { flow: string; step: number; score: number; differs: string[] } | null;
      if (b) entry.nearest = { flow: b.flow, step: b.step, differs: b.differs };
    }
    return entry;
  });
  return { situation: [...moved].sort(), whatIfs };
}

/**
 * Chart a mounted region: replay each of its flows once, snapshotting the store at every step, then
 * place every island scenario against those snapshots. The region is put back in the state it was in.
 */
export async function chartRegion(region: string, evidence: LagoonEvidence | undefined): Promise<RegionChart | { error: string }> {
  const config = configOf(region);
  const h = regionHarness(region);
  const store = getArchipelagoStore(region);
  if (!config || !h || !store) {
    const why = !config ? 'no config is registered for it' : !store ? 'it has no store' : 'the state player never saw it mount';
    return { error: `region "${region}" is not mounted in this view (${why}; mounted: ${[...mounted.keys()].join(', ') || 'none'})` };
  }

  const before = activeStates().find((a) => a.ref.region === region)?.ref ?? null;
  const flows: RegionChart['flows'] = [];
  const runs: ChartRun[] = [];
  for (const flow of (evidence?.flows?.[region] ?? []) as RegionScenario[]) {
    const name = flow.name ?? `#${flows.length + 1}`;
    const steps: Record<string, string>[] = [];
    h.reset();
    const outcome = await replayFlow(flow, null, h, () => {
      const held = store.snapshot();
      steps.push(Object.fromEntries(Object.keys(held).map((k) => [k, stableJson(held[k])])));
    });
    flows.push({ name, steps: (flow.steps ?? []).length, ok: outcome.ok, ...(outcome.ok ? {} : { error: outcome.error }) });
    runs.push({ flow: name, steps });
  }
  // Charting is a look, not a move.
  if (before) await playState(before, evidence);
  else clearState(region);

  const candidates: ChartCandidate[] = [];
  const seen = new Set<string>();
  for (const island of config.islands) {
    const tag = island.element;
    if (!tag || seen.has(tag)) continue; // one element in two slots is one island
    seen.add(tag);
    ((evidence?.scenarios?.[tag] ?? []) as Scenario[]).forEach((sc, i) => {
      const { keys, unbound } = scenarioToRegion(config, tag, { ...(sc.seed ?? {}), ...(sc.afterMount ?? {}) });
      candidates.push({ island: tag, slot: island.slot, name: sc.name ?? `#${i + 1}`, keys, unbound, interactions: !!sc.interactions?.length });
    });
  }

  const placed = placeWhatIfs(region, runs, candidates);
  const chart: RegionChart = { region, whatIfs: placed.whatIfs, flows, situation: placed.situation, at: Date.now() };
  charts.set(region, chart);
  changed();
  return chart;
}

/**
 * `window.__motuLagoonChart(region)` — the chart for anything that drives the page from outside (the
 * CLI's region lane). Both entries call this, so a check charts with the same code the dock does.
 */
export function exposeChart(evidence: LagoonEvidence | undefined): void {
  // EVIDENCE MAY COME FROM THE CALLER. The focused entry the checks drive is given none — the CLI
  // reads the evidence files in node and hands the page what each check needs — so the region lane
  // passes the region's flows and its islands' scenarios here. The gallery has them built in.
  (window as unknown as { __motuLagoonChart?: unknown }).__motuLagoonChart = (region: string, given?: LagoonEvidence) =>
    chartRegion(region, given ?? evidence);
}

// --- the address ---------------------------------------------------------------------------------
//
// One `state=` per region, repeated: `state=events.flow.rsvp-full@2&state=shell.scenario.x-app-nav.admin`.
// Names are written as slugs (`pickState` matches either), so a state address needs no encoding and
// reads in a chat message. A region id, a tag and a slug never contain a dot.

export function formatStateParam(ref: StateRef): string {
  const step = ref.step != null ? `@${ref.step}` : '';
  return ref.kind === 'flow'
    ? `${ref.region}.flow.${slug(ref.name)}${step}`
    : `${ref.region}.scenario.${ref.island}.${slug(ref.name)}${step}`;
}

export function parseStateParam(raw: string): StateRef | { error: string } {
  const at = raw.lastIndexOf('@');
  const body = at > 0 ? raw.slice(0, at) : raw;
  const step = at > 0 ? Number(raw.slice(at + 1)) : null;
  if (step !== null && (!Number.isInteger(step) || step < 0)) return { error: `"${raw}": the step after @ must be a whole number` };
  const parts = body.split('.');
  if (parts[1] === 'flow' && parts.length === 3) return { region: parts[0]!, kind: 'flow', name: parts[2]!, step };
  if (parts[1] === 'scenario' && parts.length === 4) return { region: parts[0]!, kind: 'scenario', island: parts[2]!, name: parts[3]!, step };
  return { error: `"${raw}" is not a state address — <region>.flow.<name>[@step] or <region>.scenario.<island>.<name>[@step]` };
}

/** Is this ref a declared state at all? Checked BEFORE anything mounts, so a bad address refuses. */
export function resolveStateRef(ref: StateRef, evidence: LagoonEvidence | undefined): string | null {
  if (ref.kind === 'flow') {
    return pickState(evidence?.flows?.[ref.region], ref.name) ? null : `no flow "${ref.name}" in ${ref.region}`;
  }
  const config = configOf(ref.region);
  if (config && !config.islands.some((i) => i.element === ref.island)) return `${ref.island} is not an island of ${ref.region}`;
  return pickState(evidence?.scenarios?.[ref.island], ref.name) ? null : `no scenario "${ref.name}" in ${ref.island}'s evidence`;
}
