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
}

const calls: HostCall[] = [];
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
  return ((...args: Parameters<F>) => {
    const result = impl(...args);
    const record = (value: unknown) => {
      calls.push({
        module,
        fn,
        args: args.map((a) => (typeof a === 'object' && a !== null ? '…' : a)),
        returned: Array.isArray(value) ? value.length : value && typeof value === 'object' ? Object.keys(value).length : undefined,
        at: Date.now(),
      });
      for (const l of listeners) l();
      return value;
    };
    return result instanceof Promise ? result.then(record) : record(result);
  }) as F;
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
