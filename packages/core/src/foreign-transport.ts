// Rendering a UI that does not live in the repository.
//
// A metadata-driven application does not describe its screens in JSX. Twenty's record page asks the
// server which widgets exist, in what order, of what type; the React tree is a dispatch table over
// rows. Point the lagoon at it and the honest first reading is that the lagoon has to REPRODUCE the
// app — reimplement enough of the data layer to make the page render — which is exactly the thing
// motu exists to avoid, since a reproduction drifts from the original the day after it is written.
//
// The reading is wrong, and it is wrong in a way that favours motu.
//
// There is no magic: the UI is data, so the data must come from somewhere, and the only somewheres
// are the app's repository or its database. What the pessimistic reading misses is that an app whose
// UI is data ALREADY HAD TO SOLVE THIS. Its own tests and stories cannot run without the metadata
// either, so it carries a capture in-repo and a script that refreshes it from a live instance.
// Twenty is the proof: `scripts/mock-data/generate-*.ts` fetches from `/metadata` with a token and
// writes 2.3 MB of `__typename`-carrying fixtures, which `testing/graphqlMocks.ts` then serves
// offline. The acquisition step the pessimistic reading dreads is a script the app already runs.
//
// So the lagoon does not reproduce the data layer. It REPLAYS the app's own captured answers through
// a seam, the same way `StoreAdapter` observes a store motu does not own. And a declared transport is
// worth more than hand-written stubs on three counts a hand stub can never match:
//
//   1. operations are NAMED, so "did anything ask for something nobody could answer?" is decidable
//      — a stub that silently returns undefined is the green-check-over-dead-code failure again;
//   2. responses are SHAPED by a schema the app codegens, so a fixture that no longer matches is a
//      detectable fossil rather than a page that renders wrong;
//   3. the member list of a catalogue region is IN the data, so membership stops being unanswerable
//      (see `catalogue.ts`) — the thing that made metadata-driven UIs look hostile is the thing that
//      makes them checkable.
import type { CatalogueMember } from './catalogue';

declare const __MOTU_DEBUG__: boolean;
const DEBUG = typeof __MOTU_DEBUG__ !== 'undefined' && __MOTU_DEBUG__;

/** One request an island made of the outside world. */
export interface TransportOperation {
  /** GraphQL operation name, REST route, whatever the app names its calls. */
  name: string;
  variables?: Record<string, unknown>;
}

/**
 * The seam an application implements for its own data layer.
 *
 * `serve` returning `undefined` means "not mine" and is recorded as UNSERVED rather than treated as
 * an empty answer — the distinction is the whole point, because an empty answer renders as an empty
 * page and looks like a working one.
 */
export interface TransportAdapter {
  id: string;
  /** Answer an operation from captured data, or return undefined for "I don't handle this". */
  serve(op: TransportOperation): unknown | undefined;
  /** OPTIONAL: the operations this adapter claims to answer, for reporting before anything runs. */
  operations?(): readonly string[];
  /**
   * OPTIONAL: where the capture came from and when. A fixture with no provenance is indistinguishable
   * from a hand-written stub, which is the thing being replaced.
   */
  provenance?(): { source: string; capturedAt?: string; schemaHash?: string };
}

export interface TransportCall {
  adapterId: string;
  name: string;
  variables?: Record<string, unknown>;
  served: boolean;
}

const calls: TransportCall[] = [];

/**
 * Route a region's outbound calls through the app's own capture.
 *
 * Returns the serve function to install wherever the app's client actually asks — an Apollo link, an
 * MSW handler, a fetch shim. motu does not choose; the app already has a place.
 */
export function observeForeignTransport(adapter: TransportAdapter) {
  return (op: TransportOperation): unknown | undefined => {
    const answer = adapter.serve(op);
    const served = answer !== undefined;
    calls.push({ adapterId: adapter.id, name: op.name, variables: op.variables, served });
    if (DEBUG && !served) {
      console.warn(`[motu] transport ${adapter.id}: nothing answers "${op.name}"`);
    }
    return answer;
  };
}

export const transportCalls = (): readonly TransportCall[] => calls;
export const servedOperations = (): string[] => [...new Set(calls.filter((c) => c.served).map((c) => c.name))];

/**
 * Operations an island actually asked for and the capture could not answer.
 *
 * This is the transport's `unattributedWrites()`: the lagoon renders, the check is green, and six
 * queries fell through to nothing. Anything in this list means the frame on screen is not the frame
 * the app would show.
 */
export const unservedOperations = (): string[] => {
  const ok = new Set(calls.filter((c) => c.served).map((c) => c.name));
  return [...new Set(calls.filter((c) => !c.served && !ok.has(c.name)).map((c) => c.name))];
};

export const resetTransport = (): void => void calls.splice(0, calls.length);

/** Everything a run learned, for an evidence file. */
export function transportObservations(): {
  served: string[];
  unserved: string[];
  callCount: number;
} {
  return { served: servedOperations(), unserved: unservedOperations(), callCount: calls.length };
}

export type { CatalogueMember };
