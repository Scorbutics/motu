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
  const h = regionHarness(ref.region);
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
