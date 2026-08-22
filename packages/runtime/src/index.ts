// Stripped in production: the debug overlay's instrumentation is gated on this build-time constant,
// so the whole block below dead-code-eliminates when it is false (and is safely `undefined` under
// bare Node/tsc, where the typeof guard evaluates to false rather than throwing).
import { runWithIsland as coreRunWithIsland, ambientIsland } from '@motu/core';

declare const __MOTU_DEBUG__: boolean;
const DEBUG = typeof __MOTU_DEBUG__ !== 'undefined' && __MOTU_DEBUG__;

/**
 * The injection seam. A component calls `call(...)` and never knows which Transport backs it —
 * that decision lives only in a composition root (bridge / standalone / sandbox).
 */
export interface Transport {
  call<T>(service: string, method: string, args: unknown[]): Promise<T>;
}

let current: Transport | null = null;

/** Called once, at a composition root, to choose the transport for this runtime. */
export function configure(t: Transport): void {
  current = t;
}

// --- Dev-only observation (debug overlay) --------------------------------------------------------
// The single choke point every contract call flows through is the natural place to observe them —
// no per-island instrumentation. Attribution is captured SYNCHRONOUSLY at call entry (the island
// whose attribution window is open), so a call's later success/failure keeps the right island even
// though the window has since closed.

/** A single lifecycle event for one contract call, emitted at start and again at completion. */
export interface CallEvent {
  id: number;
  service: string;
  method: string;
  args: unknown[];
  /** The island the call was attributed to (its custom-element tag), or null if outside any window. */
  island: string | null;
  phase: 'start' | 'success' | 'error';
  status?: number;
  durationMs?: number;
  error?: string;
}

type CallObserver = (e: CallEvent) => void;
const callObservers = new Set<CallObserver>();
let callSeq = 0;
// The window itself lives in @motu/core, so a traced host-module call and a contract call are
// attributed by the SAME open window. Two copies meant `runWithIsland` from here left `traced` blind:
// the react adapter opens one window, and only the transport's calls carried a tag.
const currentIsland = (): string | null => ambientIsland();

/** Subscribe to every contract call's lifecycle (dev overlay). Returns an unsubscribe. */
export function observeCalls(observer: CallObserver): () => void {
  callObservers.add(observer);
  return () => callObservers.delete(observer);
}

/**
 * Runs `fn` with `id` as the ambient island, so any `call()` that fires synchronously inside is
 * attributed to it. The framework opens this window around an island's render/update; islands never
 * touch it (zero per-island cost).
 */
export function runWithIsland<T>(id: string | null, fn: () => T): T {
  return coreRunWithIsland(id, fn);
}

function emitCall(e: CallEvent): void {
  callObservers.forEach((o) => o(e));
}

// --- Dev-only recording (fixture capture) --------------------------------------------------------
// `motu fixtures record` turns this on in the lagoon to capture each contract call's request AND
// response, then writes them as request-keyed fixtures. It's the same choke point as observation, but
// it keeps the RESPONSE body (which CallEvent deliberately doesn't). Off unless startRecording() runs.

/** One captured call: its request (service/method/args) and the backend's response (or error status). */
export interface RecordedCall {
  service: string;
  method: string;
  args: unknown[];
  response?: unknown;
  status?: number;
}

let recordingSink: RecordedCall[] | null = null;

/** Begin capturing contract calls (dev tooling). Replaces any in-progress recording. */
export function startRecording(): void {
  recordingSink = [];
}

/** Stop capturing and return everything recorded since startRecording(). */
export function stopRecording(): RecordedCall[] {
  const out = recordingSink ?? [];
  recordingSink = null;
  return out;
}

/** The single entry point the generated contract uses. Fails loudly if not configured. */
export function call<T>(service: string, method: string, args: unknown[]): Promise<T> {
  if (!current) {
    throw new Error('motu: configure() was not called before a service call');
  }
  if (!DEBUG) return current.call<T>(service, method, args);

  const id = ++callSeq;
  const island = currentIsland();
  const t0 = performance.now();
  emitCall({ id, service, method, args, island, phase: 'start' });
  return current.call<T>(service, method, args).then(
    (result) => {
      emitCall({ id, service, method, args, island, phase: 'success', durationMs: performance.now() - t0 });
      if (recordingSink) recordingSink.push({ service, method, args, response: result });
      return result;
    },
    (err: unknown) => {
      const status = err instanceof MotuError ? err.status : undefined;
      emitCall({
        id,
        service,
        method,
        args,
        island,
        phase: 'error',
        status,
        durationMs: performance.now() - t0,
        error: err instanceof Error ? err.message : String(err),
      });
      if (recordingSink) recordingSink.push({ service, method, args, status });
      throw err;
    },
  );
}

// In debug builds (the lagoon), expose the recorder to the page so `motu fixtures record` can drive
// it via the browser. Stripped in production along with the rest of the DEBUG block.
if (DEBUG && typeof globalThis !== 'undefined') {
  (globalThis as unknown as { __motuRecorder?: unknown }).__motuRecorder = {
    start: startRecording,
    stop: stopRecording,
  };
}

export class MotuError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'MotuError';
  }
}

export class SessionExpiredError extends MotuError {
  constructor() {
    super(401, 'motu: session expired');
    this.name = 'SessionExpiredError';
  }
}

export { HttpTransport } from './http-transport.js';
export { DirectTransport } from './direct-transport.js';
