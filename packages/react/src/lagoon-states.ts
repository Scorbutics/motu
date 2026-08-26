// THE STATES A LAGOON CAN BE OPENED IN, as addresses.
//
// A lagoon renders one state per target: the region's `seed` from the project's overrides. Every OTHER
// state the project has written down — an island's `scenarios`, a region's flows — lived only in the
// node-side checks (`data-flow`, `snapshot`, `archipelago verify --runtime`), which mount them,
// assert, and throw the page away. Nobody could LOOK at one, which meant the way to see "the frozen
// ambassador" or "the week after the member answered" was to edit the seed, look, and edit it back.
//
// That gap is worse for an agent than for a human: driving `window.__motuLagoon.seed(...)` by hand is
// possible (the checks do it), but it means re-deriving the seed out of an evidence file into a
// browser eval every time, with nothing to compare against if the copy is wrong. What was missing was
// not capability — it was an ADDRESS.
//
//   lagoon.html?target=island:x-week-actions&scenario=a%20week%20to%20answer
//   lagoon.html?target=archipelago:actions&flow=marking%20a%20mission%20done&step=2
//
// The evidence is already in the bundle (the lagoon's fixtures glob has always read `*.evidence.ts`
// for its `fixtures`; only `scenarios` was dropped on the floor), so this costs a URL parse and the
// same seam the checks use.
//
// A WRONG NAME MUST NOT RENDER. The failure this is built to refuse is the quiet one: ask for a
// scenario that does not exist, get the default state, and believe you are looking at the state you
// named. So an unresolvable state is a banner and a refusal to mount, never a fallback.
import type { RegionScenario, RegionStep, Scenario } from '@motu/runtime/mock';

/** Everything addressable in this build, gathered from the project's evidence files by the entry. */
export interface LagoonEvidence {
  /** Island scenarios by element tag (`x-week-actions`), from `<kebab>.evidence.ts`. */
  scenarios?: Record<string, Scenario[]>;
  /** Region flows by archipelago id, from `<id>.evidence.ts` beside the archipelago. */
  flows?: Record<string, RegionScenario[]>;
}

/** What the URL asked for. All three absent is the ordinary case — the lagoon's own seeded view. */
export interface StateRequest {
  scenario: string | null;
  flow: string | null;
  /** 1-based, and `null` means "the whole flow" — the state it ends in. */
  step: number | null;
  /**
   * Which region a `flow` belongs to, when its name alone does not say.
   *
   * Flow names are scoped to their region and they DO collide across regions — peps has "each slot
   * renders its own island" in two, which is a good name in both. Resolving that by taking the first
   * match would open a different region than the one asked for and look exactly like success.
   */
  region: string | null;
}

/** What actually happened, for whoever is driving: `window.__motuLagoonState`. */
export interface StateOutcome {
  ok: boolean;
  target: string;
  kind: 'scenario' | 'flow' | 'none';
  /** The state's declared name, as resolved (not as typed). */
  name?: string;
  /** For a flow: how many steps were applied. */
  applied?: number;
  of?: number;
  error?: string;
  /** What this target DOES offer, whenever the request could not be met. */
  available?: string[];
}

declare global {
  interface Window {
    /** Every state this build can be opened in — the catalogue behind `motu lagoon states`. */
    __motuLagoonStates?: LagoonEvidence;
    /** The state this page was asked for, and whether it was reached. */
    __motuLagoonState?: StateOutcome;
  }
}

/** `A Week To Answer` and `a-week-to-answer` address the same state — a URL should not need the accents. */
export function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Declared names, in declaration order — what an unresolvable request gets told. */
export function stateNames(list: { name?: string }[] | undefined): string[] {
  return (list ?? []).map((s, i) => s.name ?? `#${i + 1}`);
}

/**
 * Resolve a requested state against what a target declares.
 *
 * Three forms, most specific first: `#2` (1-based position, for a state nobody named), the exact
 * declared name, then its slug. Position is last-resort on purpose — a name survives someone
 * reordering the file and an index does not.
 */
export function pickState<T extends { name?: string }>(list: T[] | undefined, wanted: string): T | undefined {
  const all = list ?? [];
  const byIndex = /^#(\d+)$/.exec(wanted.trim());
  if (byIndex) return all[Number(byIndex[1]) - 1];
  const exact = all.find((s) => s.name === wanted);
  if (exact) return exact;
  const target = slug(wanted);
  return all.find((s) => s.name && slug(s.name) === target);
}

/** The state this URL asks for. */
export function readStateRequest(search?: string): StateRequest {
  const params = new URLSearchParams(
    search ?? (typeof location !== 'undefined' ? location.search : ''),
  );
  const step = params.get('step');
  const n = step === null ? null : Number(step);
  return {
    scenario: params.get('scenario'),
    flow: params.get('flow'),
    step: n !== null && Number.isFinite(n) && n >= 0 ? Math.floor(n) : null,
    region: params.get('region'),
  };
}

/** EVERY region declaring a flow by this name — plural because the name alone can be ambiguous. */
export function regionsForFlow(evidence: LagoonEvidence | undefined, wanted: string): string[] {
  const flows = evidence?.flows ?? {};
  return Object.keys(flows).filter((id) => pickState(flows[id], wanted));
}

/**
 * The region a flow request means, or why it does not mean one.
 *
 * A bare `?flow=` is allowed to pick the station only when it CAN: one region declaring that name.
 * Two, and it says so and applies nothing — the alternative is opening a region nobody asked for,
 * with a screen that looks like the state they wanted.
 */
export function resolveFlowRegion(
  evidence: LagoonEvidence | undefined,
  request: StateRequest,
): { region: string } | { error: string; available: string[] } {
  const wanted = request.flow!;
  const candidates = regionsForFlow(evidence, wanted);
  const all = () =>
    Object.entries(evidence?.flows ?? {}).flatMap(([id, list]) => stateNames(list).map((n) => `${id}: ${n}`));

  if (request.region) {
    if (candidates.includes(request.region)) return { region: request.region };
    return { error: `region "${request.region}" declares no flow "${wanted}"`, available: all() };
  }
  if (candidates.length === 1) return { region: candidates[0]! };
  if (!candidates.length) return { error: `no region declares a flow "${wanted}"`, available: all() };
  return {
    error: `"${wanted}" is declared by ${candidates.length} regions (${candidates.join(', ')}) — add &region=<id> to say which`,
    available: candidates.map((id) => `${id}: ${wanted}`),
  };
}

// --- saying so --------------------------------------------------------------------------------

const BANNER_ID = 'motu-state-banner';

/**
 * A refusal nobody can miss, in the page and in `window.__motuLagoonState`.
 *
 * Both, deliberately. The machine flag is what a check reads; the banner is what survives into a
 * screenshot, which is the artifact a state address most often ends up in.
 */
export function reportState(outcome: StateOutcome): void {
  if (typeof window === 'undefined') return;
  window.__motuLagoonState = outcome;
  if (typeof document === 'undefined') return;
  document.getElementById(BANNER_ID)?.remove();
  if (outcome.ok) return;

  const el = document.createElement('div');
  el.id = BANNER_ID;
  el.setAttribute('role', 'alert');
  el.style.cssText =
    'position:fixed;inset:0 0 auto 0;z-index:2147483646;padding:14px 18px;background:#7f1d1d;color:#fff;' +
    'font:500 13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;box-shadow:0 2px 12px rgba(0,0,0,.35)';
  const lines = [`motu: ${outcome.error ?? 'this state could not be reached'}`];
  if (outcome.available?.length) {
    lines.push(`${outcome.target} declares: ${outcome.available.map((n) => `"${n}"`).join(', ')}`);
  } else if (outcome.available) {
    lines.push(`${outcome.target} declares no ${outcome.kind === 'flow' ? 'flows' : 'scenarios'} at all.`);
  }
  el.textContent = lines.join('  ·  ');
  document.body.appendChild(el);
  console.error(lines.join('\n'));
}

/** Publish the catalogue, so a page can be asked what it can be opened in without loading a file. */
export function publishStates(evidence: LagoonEvidence | undefined): void {
  if (typeof window === 'undefined') return;
  window.__motuLagoonStates = { scenarios: evidence?.scenarios ?? {}, flows: evidence?.flows ?? {} };
}

// --- replaying a flow -------------------------------------------------------------------------

const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Wait until the region has mounted something, so step 1 does not fire into an empty page. */
async function waitForRegion(timeoutMs = 10_000): Promise<boolean> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    if (document.querySelectorAll('[data-motu-slot]').length > 0) return true;
    if (Date.now() >= until) return false;
    await settle(50);
  }
}

/**
 * Drive a region to the state a flow reaches — the SAME seam `runRegionFlows` drives.
 *
 * Deliberately not a second implementation of the flow runner: no assertions, no mutants, no
 * verdict. A flow's steps are the only vocabulary either one has (`emit` a declared output, `provide`
 * a host-fed key), so replaying the stimulus half of a flow reaches the state the check asserts on,
 * and cannot reach a state the check could not.
 *
 * `upTo` is 1-based; `null` runs the whole flow. `upTo: 0` is the seed alone — the state the flow
 * STARTS from, which is a state worth looking at and one no check ever renders on its own.
 */
export async function replayFlow(flow: RegionScenario, upTo: number | null): Promise<StateOutcome> {
  const base: StateOutcome = { ok: false, target: '', kind: 'flow', name: flow.name, of: (flow.steps ?? []).length };
  const lagoon = window.__motuLagoon;
  if (!lagoon || typeof lagoon.emit !== 'function') {
    // The element mount path has `provide` and nothing else — a flow needs the emit seam, and saying
    // which capability is missing beats "nothing happened".
    return { ...base, error: 'this lagoon mounts islands as elements; replaying a flow needs the React mount path' };
  }
  if (!(await waitForRegion())) return { ...base, error: 'the region never mounted, so no step could be applied' };

  // A flow's `seed` is the page ESTABLISHING a starting value, even for a key an island owns — the
  // same distinction the flow runner draws, and for the same reason: applying it as a host write
  // makes the harness itself look like a host reaching into island-owned state.
  for (const [k, v] of Object.entries(flow.seed ?? {})) (lagoon.seed ?? lagoon.provide)(k, v);
  await settle(120);

  const steps = flow.steps ?? [];
  const limit = upTo === null ? steps.length : Math.min(upTo, steps.length);
  if (upTo !== null && upTo > steps.length) {
    return { ...base, applied: 0, error: `step ${upTo} does not exist — "${flow.name ?? 'flow'}" has ${steps.length}` };
  }

  for (let i = 0; i < limit; i++) {
    const step = steps[i] as RegionStep;
    if (step.emit) {
      if (!lagoon.emit(step.emit.slot, step.emit.event, step.emit.detail)) {
        return { ...base, applied: i, error: `step ${i + 1}: no island mounted under slot "${step.emit.slot}"` };
      }
    } else if (step.provide) {
      for (const [k, v] of Object.entries(step.provide)) lagoon.provide(k, v);
    }
    // A step that only asserts (`expectRender`) moves nothing — it is still a step, and skipping it
    // silently would make `step=3` mean different things here and in the check.
    await settle(150);
  }
  return { ...base, ok: true, applied: limit };
}
