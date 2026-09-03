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
//   ?target=island:x-week-actions&scenario=a%20week%20to%20answer
//   ?region=actions&flow=marking%20a%20mission%20done&step=2
//
// Both read by the GALLERY (`motu lagoon serve`) and by the focused entry (`lagoon.html`, which
// `motu island verify` drives), because an address that only one of them honours is one a person
// pastes and watches render something else.
//
// The evidence is already in the bundle (the lagoon's fixtures glob has always read `*.evidence.ts`
// for its `fixtures`; only `scenarios` was dropped on the floor), so this costs a URL parse and the
// same seam the checks use.
//
// A WRONG NAME MUST NOT RENDER. The failure this is built to refuse is the quiet one: ask for a
// scenario that does not exist, get the default state, and believe you are looking at the state you
// named. So an unresolvable state is a banner and a refusal to mount, never a fallback.
import type { RegionScenario, RegionStep, Scenario } from '@motu/runtime/mock';

/** One archipelago this build can be opened on, as the catalogue lists it. */
export interface LagoonRegionEntry {
  id: string;
  label: string;
}

/** Everything addressable in this build, gathered from the project's evidence files by the entry. */
export interface LagoonEvidence {
  /**
   * Every archipelago, in the order the panel shows them.
   *
   * NOT DERIVABLE FROM `flows`, which is why it is listed separately: a region with no declared flows
   * has no key there and would simply be missing from a catalogue built by reading it. A reader that
   * cannot see a region cannot offer to open it, and "the tool showed fewer regions than exist" is
   * the quiet kind of wrong this module was written to refuse elsewhere.
   */
  archipelagos?: LagoonRegionEntry[];
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
   * Flow names are scoped to their region and they DO collide across regions — acme has "each slot
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

/**
 * The target this URL asks for, or null.
 *
 * The FOCUSED entry has always read this — it is what lets one dev server answer for every island —
 * and the gallery did not. So an island address opened on the lagoon a human actually runs
 * (`motu lagoon serve` builds the GALLERY) resolved to no target at all and rendered the first
 * region: the exact silent substitution the top of this file exists to refuse, one layer above where
 * it was being refused. Both entries read the target from here now.
 */
export function readTarget(search?: string): string | null {
  const params = new URLSearchParams(
    search ?? (typeof location !== 'undefined' ? location.search : ''),
  );
  return params.get('target');
}

/** The tag an `island:<tag>` target names — '' for a region target, or for no target at all. */
export function islandTag(target: string | null | undefined): string {
  return typeof target === 'string' && target.startsWith('island:') ? target.slice('island:'.length) : '';
}

/**
 * The SEED a named island scenario means, or the refusal that has to stop the mount.
 *
 * Shared by both entries on purpose: a name that does not exist must be refused identically whether
 * it was typed at `lagoon.html` or at the gallery, because the two now accept the same address.
 */
export function resolveIslandScenario(
  scenarios: Record<string, Scenario[]> | undefined,
  tag: string,
  wanted: string,
): { seed?: Record<string, unknown>; outcome: StateOutcome } {
  const target = `island:${tag}`;
  const declared = scenarios?.[tag];
  const found = pickState(declared, wanted);
  if (!found) {
    return {
      outcome: {
        ok: false,
        target,
        kind: 'scenario',
        error: `no scenario "${wanted}" in ${tag}'s evidence`,
        available: stateNames(declared),
      },
    };
  }
  return { seed: found.seed, outcome: { ok: true, target, kind: 'scenario', name: found.name ?? wanted } };
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
export function publishStates(evidence: LagoonEvidence | undefined, archipelagos: LagoonRegionEntry[] = []): void {
  if (typeof window === 'undefined') return;
  window.__motuLagoonStates = {
    scenarios: evidence?.scenarios ?? {},
    flows: evidence?.flows ?? {},
    archipelagos,
  };
}

// --- replaying a flow -------------------------------------------------------------------------

const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Wait until nothing in the region has changed for a beat.
 *
 * Compares the values the region HOLDS, not just which keys exist: a source answering replaces a
 * value under a key that was already there. Bounded, and it returns rather than throws when the
 * region simply never settles — a region that writes continuously is a finding for the lens, not a
 * reason to refuse to drive a flow.
 */
async function waitForQuiet(stillMs = 200, budgetMs = 2000): Promise<void> {
  const snapshot = () => {
    const l = window.__motuLagoon;
    try {
      return JSON.stringify((l?.held() ?? []).map((k) => [k, l?.read(k)]));
    } catch {
      return ''; // a value that will not serialise tells us nothing; do not stall on it
    }
  };
  const until = Date.now() + budgetMs;
  let last = snapshot();
  while (Date.now() < until) {
    await settle(stillMs);
    const now = snapshot();
    if (now === last) return;
    last = now;
  }
}

/**
 * PLAY AN ISLAND SCENARIO'S INTERACTIONS, so the state a name PROMISES is the state a URL opens in.
 *
 * Without this, a scenario carrying `interactions` was addressable and unfaithful: the lagoon applied
 * the seed, ran nothing, and reported `ok: true` under the scenario's own name. Opening acme's
 * "une sélection réelle survit à un refetch qui échoue" showed the plain seeded panel — no selection
 * made, no refetch failed, identical to the scenario before it — while the one signal a viewer is
 * told to trust before believing a screenshot vouched for it. A snapshot baseline took the picture
 * under that name too. That is exactly the failure `render`'s "AN UNRESOLVABLE STATE MUST NOT RENDER
 * SOMETHING ELSE" refusal exists for, one layer further in: the state resolved, and then did not
 * happen.
 *
 * The same `?step=` vocabulary a region flow already uses, and for the same reason — the states
 * BETWEEN the clicks are worth opening, not just the last one.
 *
 * Accessible name, never a selector: the vocabulary `expectRender` reads FROM and `Scenario.click`
 * declares. This resolver is deliberately smaller than Playwright's (no full ARIA name computation) —
 * it is the same rule stated twice, and if the two ever disagree the check is the one that decides.
 */
function accessibleName(el: Element): string {
  const aria = el.getAttribute('aria-label') ?? el.getAttribute('title') ?? el.getAttribute('alt');
  return `${aria ?? ''} ${(el as HTMLElement).innerText ?? el.textContent ?? ''}`.replace(/\s+/g, ' ').trim();
}

const CLICKABLE = 'button, [role="button"], input[type="checkbox"], [role="checkbox"], [role="switch"], [role="radio"], [role="menuitem"], [role="tab"], a[href], label, summary';

/** The control a `click` names, or null. Portals are why this searches the DOCUMENT, not the island:
 *  a dialog opened by an earlier step renders as a sibling of the island, not inside it. */
function findClickable(name: string): HTMLElement | null {
  const wanted = name.trim();
  const candidates = [...document.querySelectorAll<HTMLElement>(CLICKABLE)].filter(
    (el) => el.offsetParent !== null || el.getClientRects().length > 0,
  );
  // Exact first, so a short name is not stolen by a longer control that merely contains it; then the
  // narrowest containing match, which is the innermost control rather than a wrapper around it.
  return (
    candidates.find((el) => accessibleName(el) === wanted) ??
    candidates
      .filter((el) => accessibleName(el).includes(wanted))
      .sort((a, b) => accessibleName(a).length - accessibleName(b).length)[0] ??
    null
  );
}

/**
 * Settle on the DOM, not the store — `waitForQuiet` watches region KEYS, and an island's own click
 * handler (a fetch, a catch block, a dialog opening) can move the whole screen without writing one.
 * Using the store version here would return after the first tick and click into a page still filling
 * in, which is precisely the race `waitForStableRender` exists for on the check side.
 */
async function waitForDomQuiet(stillMs = 120, budgetMs = 4000): Promise<void> {
  const snapshot = () => document.body.innerHTML.length;
  const until = Date.now() + budgetMs;
  let last = -1;
  while (Date.now() < until) {
    const now = snapshot();
    if (now === last) return;
    last = now;
    await settle(stillMs);
  }
}

export async function replayInteractions(scenario: Scenario, upTo: number | null): Promise<StateOutcome> {
  const steps = scenario.interactions ?? [];
  const base: StateOutcome = { ok: false, target: '', kind: 'scenario', name: scenario.name, of: steps.length };
  const limit = upTo === null ? steps.length : Math.min(upTo, steps.length);
  if (upTo !== null && upTo > steps.length) {
    return { ...base, applied: 0, error: `step ${upTo} does not exist — "${scenario.name ?? 'scenario'}" has ${steps.length} interaction(s)` };
  }
  for (let i = 0; i < limit; i++) {
    const { click } = steps[i];
    if (!click) continue;
    // Each click can reveal the control the next one names, so settle between them rather than
    // resolving the whole list up front.
    await waitForDomQuiet();
    const el = findClickable(click);
    if (!el) {
      return { ...base, applied: i, error: `step ${i + 1}: nothing clickable is named "${click}"` };
    }
    el.click();
  }
  await waitForDomQuiet();
  return { ...base, ok: true, applied: limit };
}

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
  // WAIT FOR THE REGION TO STOP MOVING, and this is not politeness — it is correctness.
  //
  // A source starts working when it is installed and publishes when it answers. A flow opened from a
  // URL used to seed its state into a region whose source had not answered yet, and the answer landed
  // a moment later and overwrote it: the flow reported "applied 1/1", the panel agreed, and the screen
  // showed a different state entirely. Found by looking at one — `onboardingState` read `ready` under
  // a flow that seeds `unavailable`.
  await waitForQuiet();

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
    } else if (step.click) {
      // THE USER'S HALF OF THE COUPLING. `emit` enters the region past the component's own handler, so
      // a control whose callback was dropped leaves every emit-only flow green while the screen is
      // dead. Clicking drives the rendered control and lets the component fire its own declared
      // output — the same path a person takes.
      //
      // Settle FIRST: an earlier step can reveal the control this one names, and resolving before the
      // DOM is quiet finds the page mid-render. Same order `replayInteractions` uses, for the same
      // reason.
      await waitForDomQuiet();
      const el = findClickable(step.click);
      if (!el) {
        return { ...base, applied: i, error: `step ${i + 1}: nothing clickable is named "${step.click}"` };
      }
      el.click();
    }
    // A step that only asserts (`expectRender`) moves nothing — it is still a step, and skipping it
    // silently would make `step=3` mean different things here and in the check.
    await settle(150);
  }
  return { ...base, ok: true, applied: limit };
}
