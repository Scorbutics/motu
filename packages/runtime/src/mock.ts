import { MotuError, type Transport } from './index.js';

/** A response computed from the call's arguments — a client-side STUB (not backend fidelity) that lets
 *  the lagoon FILTER/derive per request, so reactive behaviour (e.g. search -> filtered results) works
 *  for ANY input, not just pre-recorded ones. Explicitly a stub for verifying the ISLAND's wiring. */
export type FixtureResponder = (args: unknown[]) => unknown;

export interface Fixture {
  service: string;
  method: string;
  /** Optional role gate: caller must hold one of these for the call to succeed. */
  roles?: string[];
  /**
   * Request-keyed matching: match this call's arguments, so a fixture can return DIFFERENT data for
   * different inputs (e.g. filtered search results per criteria). Each slot is deep-equal to the
   * corresponding arg, with two conveniences: an `undefined` slot is a WILDCARD, and a plain object is
   * matched STRUCTURALLY (a subset) so you pin only the fields you care about — e.g.
   * `[undefined, { login: 'brice' }]` matches any page with that login criterion. Omit `match`
   * entirely for the request-agnostic fallback (the previous behaviour). A request-keyed fixture wins
   * over the fallback when it matches.
   */
  match?: unknown[];
  /**
   * The response: a fixed VALUE (static replay), or a FUNCTION of the call args (`FixtureResponder`) —
   * a stub that derives/filters a dataset per request so the island's REACTIVE behaviour is verifiable
   * offline (type a filter -> results actually narrow). A function response is an explicit client-side
   * stub, NOT a claim of backend fidelity; use a value (or request-keyed `match`) for recorded truth.
   */
  response: unknown | FixtureResponder;
}

/**
 * A lagoon input case: seed the archipelago store, expect the island to render accordingly. Two
 * scenarios with different seeds that produce DIFFERENT rendered output prove data actually flows
 * across the seam (criteria -> contract -> render), not merely that the wiring type-checks. Consumed
 * by `motu island verify`'s differentiation check (exported alongside `fixtures` from a
 * `fixtures.mock.ts`).
 */
export interface Scenario {
  /** Human label for the case (shown in verify output). */
  name?: string;
  /** Store seed for this case, e.g. `{ criteria: { login: 'brice' } }`. */
  seed?: Record<string, unknown>;
}

/**
 * A region's declared FLOW: a state, an act, and what the region should hold afterwards.
 *
 * Scenarios describe a state; this describes what happens next. `emit` fires an island's DECLARED
 * output — the same seam the wiring probe uses — so a flow can only ever do what the archipelago says
 * that island can do. No selectors, no synthetic clicks: the moment a harness accepts arbitrary DOM
 * scripting it is a second, untyped test suite, and it stops being derivable from the declarations.
 *
 * Lives beside the archipelago (`<id>.evidence.ts`), because the mapping it asserts is the region's.
 */
export interface RegionScenario {
  name?: string;
  /** Region keys to establish before the flow runs. */
  seed?: Record<string, unknown>;
  steps?: RegionStep[];
}

export interface RegionStep {
  /** The island output to fire, in the region's own vocabulary. */
  emit: { slot: string; event: string; detail?: unknown };
  /** Region keys and the values they must hold afterwards. Compared structurally. */
  expect: Record<string, unknown>;
}

/** Structural arg matching: `undefined` pattern slot = wildcard; plain objects match as a subset. */
function matchValue(pattern: unknown, actual: unknown): boolean {
  if (pattern === undefined) return true;
  if (pattern === null || typeof pattern !== 'object') return pattern === actual;
  if (Array.isArray(pattern)) {
    return Array.isArray(actual) && pattern.every((p, i) => matchValue(p, actual[i]));
  }
  if (actual === null || typeof actual !== 'object') return false;
  return Object.entries(pattern as Record<string, unknown>).every(([k, v]) =>
    matchValue(v, (actual as Record<string, unknown>)[k]),
  );
}

function argsMatch(pattern: unknown[], args: unknown[]): boolean {
  return pattern.every((p, i) => matchValue(p, args[i]));
}

/**
 * Backend-free transport for Storybook / sandbox. Replays fixtures and, when a fixture declares
 * `roles`, throws a 403 MotuError if the sandbox's currently-selected role does not satisfy them —
 * letting you demo the authorization behaviour with no server running. When a fixture declares
 * `match`, calls are resolved by their ARGUMENTS so one service/method can return different data per
 * request (request-keyed fixtures), falling back to a match-less fixture for the same method.
 */
export class MockTransport implements Transport {
  constructor(
    private readonly fixtures: Fixture[],
    private currentRoles: string[] = [],
  ) {}

  setRoles(roles: string[]): void {
    this.currentRoles = roles;
  }

  async call<T>(service: string, method: string, args: unknown[]): Promise<T> {
    const candidates = this.fixtures.filter((f) => f.service === service && f.method === method);
    if (!candidates.length) {
      throw new MotuError(404, `mock: no fixture for ${service}/${method}`);
    }
    // Prefer a request-keyed fixture whose `match` fits these args; else the request-agnostic fallback.
    const fixture =
      candidates.find((f) => f.match && argsMatch(f.match, args)) ?? candidates.find((f) => !f.match);
    if (!fixture) {
      throw new MotuError(404, `mock: no fixture for ${service}/${method} matching these arguments`);
    }
    if (fixture.roles && !fixture.roles.some((r) => this.currentRoles.includes(r))) {
      throw new MotuError(403, `mock: role denied for ${service}/${method}`);
    }
    // A function response derives the result from the args (a stub filter) so reactive behaviour works
    // for any input; a value response is a static replay.
    const { response } = fixture;
    return (typeof response === 'function' ? (response as FixtureResponder)(args) : response) as T;
  }
}

/**
 * A transport that fails every call with a fixed status. Used by `motu island verify` to mount an
 * island against a broken backend and check it renders an error state instead of white-screening or
 * leaking an unhandled rejection.
 */
export class FailingTransport implements Transport {
  constructor(private readonly status: number = 500) {}

  async call<T>(service: string, method: string): Promise<T> {
    throw new MotuError(this.status, `forced ${this.status} for ${service}/${method}`);
  }
}
