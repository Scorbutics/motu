// Where an island's input actually came from.
//
// The lagoon replaces a host module with a stub — that is what lets an island render with no backend —
// and the replacement is total: no request leaves the page, nothing appears in the network panel, and
// the lens shows region keys but never the CALL that produced them. Looking at peps' club region, the
// honest reaction is "I see no HTTP feeding these islands", and there is no way to tell whether the
// feed fetched once, fetched twice, or rendered from a constant nobody asked for.
//
// `ambient` already says which host modules an island IMPORTS. This says which it CALLED, with what,
// and how often — the runtime half of the same question, and the one that maps onto integration: the
// calls recorded here are exactly what the real page will have to answer.
//
// Deliberately not a transport and not a spy on the app: a stub opts in by wrapping its own exports.
// Anything cleverer would mean motu sitting in a call path it does not own, which is the thing the
// stub mechanism exists to avoid.

/** Stripped in production like every other diagnostic here. */
declare const __MOTU_DEBUG__: boolean;
const DEBUG = typeof __MOTU_DEBUG__ !== 'undefined' && __MOTU_DEBUG__;

export interface HostCall {
  /** The module the stub stands in for, e.g. `@/lib/services/club-feed`. */
  module: string;
  /** The exported function that was called. */
  fn: string;
  /** Arguments, shallow — enough to see `fetchClubFeed(11, 0)` and not enough to be a log dump. */
  args: unknown[];
  /** How many rows/keys came back, when the answer is countable. Not the answer itself. */
  returned?: number;
  /** When it RESOLVED — the lens reads it as an age, like it does a channel's last fire. */
  at: number;
  /** The island's tag, when the call was made inside one's attribution window. */
  island?: string | null;
}

// WHICH ISLAND ASKED. The attribution window is opened around an island's render — and, because that
// render is flushed synchronously in debug builds, around the effects that fire its self-fetch. It
// lives here rather than in @motu/runtime (which owns the same window for contract calls) because
// `traced` is a core concern and core must not depend on the transport; runtime delegates to this.
let currentIsland: string | null = null;

/** Run `fn` with `id` as the ambient island, so anything traced inside is attributed to it. */
export function runWithIsland<T>(id: string | null, fn: () => T): T {
  const prev = currentIsland;
  currentIsland = id;
  try {
    return fn();
  } finally {
    currentIsland = prev;
  }
}

/** The island whose window is open, if any. */
export const ambientIsland = (): string | null => currentIsland;

// WHICH SOURCE ASKED. The same window, for the other thing that reaches a backend.
//
// A declared source does its reading inside a CHANNEL, at region level, outside any island's window —
// so a table it reads would otherwise be attributed to whichever island happened to be rendering, or
// to nobody. That matters because the two are declared in different places: an island's reach is its
// own `contract.ambient`, a source's is `reaches` on the source entry. Attributing one to the other
// would report a correct declaration as a violation.
let currentSource: string | null = null;

/** Run `fn` with `id` as the ambient source, so anything it reaches is attributed to that source. */
export function runWithSource<T>(id: string | null, fn: () => T): T {
  const prev = currentSource;
  currentSource = id;
  try {
    return fn();
  } finally {
    currentSource = prev;
  }
}

/** The source whose window is open, if any. */
export const ambientSource = (): string | null => currentSource;

/**
 * Who to attribute a backend reach to, as the reach checks name owners.
 *
 * A source WINS over an island: a channel's work can run while an island's window is open (a source
 * reacting to a store change the island's own render triggered), and the source is the one that
 * declared the reach. Neither open means nobody claimed it, which the check reports as unattributed
 * rather than silently charging it to someone.
 */
export function reachOwner(): string | null {
  if (currentSource) return `source:${currentSource}`;
  if (currentIsland) return `island:${currentIsland}`;
  return null;
}

/**
 * The same window, opened and closed imperatively — for React's COMMIT phase, which no single
 * function call brackets.
 *
 * The element path can wrap its whole render in `runWithIsland` because each island element owns a
 * React root and flushes synchronously. A region mounted through React shares one root: every
 * island's effects run in one commit, so the fetch an island fires in `useEffect` lands outside any
 * scope a caller could open. Two null-rendering sentinels either side of the island (see `Island`)
 * open and close this instead, since React runs passive effects in tree order.
 *
 * Best-effort by construction: it attributes what happens SYNCHRONOUSLY inside the island's effects,
 * which is where a self-fetch starts. A continuation that runs later sees whatever window is open
 * then — usually none, which reads as `host` rather than as the wrong island.
 */
export const openIslandWindow = (id: string): void => void (currentIsland = id);
export const closeIslandWindow = (): void => void (currentIsland = null);

const calls: HostCall[] = [];

/** Marks a function this module already wrapped, so whole-module tracing does not double-count it. */
const TRACED = Symbol.for('motu.traced');

function record(module: string, fn: string, args: unknown[], value: unknown, island: string | null): void {
  calls.push({
    module,
    fn,
    args: args.map((a) => (typeof a === 'object' && a !== null ? '…' : a)),
    returned: Array.isArray(value) ? value.length : value && typeof value === 'object' ? Object.keys(value).length : undefined,
    at: Date.now(),
    island,
  });
  for (const l of listeners) l();
}
const listeners = new Set<() => void>();

// How many exports were WRAPPED, which is not the same question as how many were called and must not
// be answered with the same silence. A region whose stubs never opted in records nothing, and so does
// a region whose islands asked for nothing — the first is a gap in the instrumentation and the second
// is a finding about the islands. The lens says which.
let wrapped = 0;

/**
 * Wrap one stubbed export so the lagoon can say it was called.
 *
 *     export const fetchClubFeed = traced('@/lib/services/club-feed', 'fetchClubFeed', async (limit, offset) => …);
 *
 * The wrapper is transparent: same signature, same return, and in a production build it is the
 * function itself.
 */
export function traced<F extends (...args: never[]) => unknown>(module: string, fn: string, impl: F): F {
  if (!DEBUG) return impl;
  wrapped++;
  const out = ((...args: Parameters<F>) => {
    // AT CALL TIME, not at resolution: a fetch starts inside the island's window and comes back long
    // after it has closed, so reading the ambient island in the `.then` attributes every async call
    // to nobody.
    const island = currentIsland;
    const result = impl(...args);
    const keep = (value: unknown) => {
      record(module, fn, args, value, island);
      return value;
    };
    return result instanceof Promise ? result.then(keep) : keep(result);
  }) as F;
  (out as { [TRACED]?: boolean })[TRACED] = true;
  return out;
}

/**
 * Trace a WHOLE stubbed module, so provenance costs nobody a decision.
 *
 * `traced` is per export, which means a stub that nobody remembered to wrap records nothing and the
 * lens says the islands fetched nothing — indistinguishable, to a reader, from islands that really
 * did. And there is nothing to decide: the lagoon's alias map already names every module it stands
 * down, and standing a module down IS the statement that it is a host boundary. So the build wraps
 * them all (see the `motu:provenance` plugin in the lagoon's vite config).
 *
 * ONLY WHAT IS AWAITED IS RECORDED. A stub exports its reads next to its pure helpers — peps' club
 * stub has two fetches and five formatters, one of which runs per feed row — and recording every call
 * would turn a provenance list into a call log, burying the two lines worth reading under 24 copies of
 * `buildFeedSentence`. A request is something you wait for: the wrapper records when the return value
 * is a promise, and stays out of the way otherwise. A synchronous read is missed, which is the honest
 * trade and the rarer shape.
 */
export function traceModule<T extends object>(module: string, ns: T): T {
  if (!DEBUG) return ns;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(ns)) {
    const value = (ns as Record<string, unknown>)[key];
    // Already wrapped by hand: leave it, or the call is recorded twice and a stub that opted in
    // reads as fetching twice as often as it does.
    if (typeof value !== 'function' || (value as { [TRACED]?: boolean })[TRACED]) {
      out[key] = value;
      continue;
    }
    const impl = value as (...args: unknown[]) => unknown;
    const wrapper = (...args: unknown[]) => {
      const island = currentIsland;
      const result = impl(...args);
      if (!(result instanceof Promise)) return result; // not a request — a helper the island called
      return result.then((value) => {
        record(module, key, args, value, island);
        return value;
      });
    };
    Object.defineProperty(wrapper, 'name', { value: key });
    (wrapper as { [TRACED]?: boolean })[TRACED] = true;
    wrapped++;
    out[key] = wrapper;
  }
  return out as T;
}

/** How many exports opted in. Zero means the lagoon is not instrumented, not that nothing fetched. */
export const tracedExports = (): number => wrapped;

/** Re-render on the next recorded call — the lens mounts before the first fetch resolves. */
export function subscribeHostCalls(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** Every host call this run observed, in order. */
export const hostCalls = (): readonly HostCall[] => calls;

/** Which modules were actually reached — the set `ambient` claims statically. */
export const calledModules = (): string[] => [...new Set(calls.map((c) => c.module))];

export const resetHostCalls = (): void => void calls.splice(0, calls.length);
