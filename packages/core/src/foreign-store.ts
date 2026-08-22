// Observing a store motu does NOT own.
//
// motu's ownership guard works because every write passes through its own Store: `writes` says which
// island may update a key, `runWithWriteSource` says who is writing, and the two are compared. An
// application that already has a state architecture — Jotai component-state, Zustand, a Redux slice —
// has its own store, and asking it to route through motu's is the invasive rewrite nobody sane agrees
// to. Tested against a real app (Twenty's record page), the result was blunt: the declarations were
// expressible over its atoms, and nothing enforced them, because motu was not in the write path.
//
// WHAT A FOREIGN STORE CAN TELL YOU, AND WHAT IT CANNOT
// It can say "key K is now V". It cannot say who set it — no mainstream store carries a writer, and
// reading it off a stack trace is a bundler-dependent guess that would be wrong in production builds.
// So this does not pretend to attribute writes. It uses the one thing motu DOES know: when an island
// fires a declared output, the keys that output claims are expected to move, right now.
//
//   a change to a produced key, inside that window  -> the declaration doing what it says
//   a change to a produced key, outside any window  -> UNATTRIBUTED: the value moved and no
//                                                      declaration accounts for it
//
// That is weaker than owning the store and it is not nothing: it is the difference between a
// declaration that is documentation and one that can be contradicted by the running app. The mirror
// image of the laundering smell, which watches for a HOST write suspiciously soon after an island
// emitted; this watches for a write with no emit at all.
import { noteExpectedForeignWrites, expectedForeignWriter, runWithWriteSource, currentWriteSource } from './store';
import { writtenKeys } from './archipelago';
import type { AnyArchipelagoConfig } from './archipelago';

/** Stripped in production, like every other diagnostic here. */
declare const __MOTU_DEBUG__: boolean;
const DEBUG = typeof __MOTU_DEBUG__ !== 'undefined' && __MOTU_DEBUG__;

/**
 * The seam an application implements for its own store.
 *
 * Deliberately two methods and no lifecycle: anything a Jotai/Zustand/Redux binding cannot supply in
 * ten lines is a seam nobody will implement.
 */
export interface StoreAdapter {
  /** The value of a key right now. */
  get(key: string): unknown;
  /** Watch these keys. Returns an unsubscribe. */
  subscribe(keys: readonly string[], onChange: (key: string, value: unknown) => void): () => void;
  /**
   * OPTIONAL, and far better than the rest of this file when it is available: wrap the store's write
   * path, so motu learns WHO wrote rather than only THAT something did.
   *
   * Zustand and Redux take middleware; Jotai's `createStore()` returns a store whose `set` can be
   * wrapped. Where that is possible, attribution stops being a timing guess and becomes the call
   * site — which also removes the two things that make the source-scanning check fragile: it needs no
   * path globs and no list of how a write is spelled.
   */
  instrument?(onWrite: (key: string, value: unknown) => void): () => void;
}

/** A change to a key an island claims to produce, with nothing declared to account for it. */
export interface UnattributedWrite {
  regionId: string;
  key: string;
  /** The island the archipelago says owns this key. */
  declaredOwner: string;
  value: unknown;
  at: number;
  /** Where it was written from, when the adapter could instrument the write path. */
  site?: WriteSite;
  /** The owner the write CLAIMED, when it was tagged and the claim was wrong. */
  wroteAs?: string;
}

/**
 * Where a write came from, as far as a stack can say.
 *
 * A dev-only instrument. In a Vite dev server modules are served as files, so frames carry real paths
 * and this reads as the module a reviewer would name. In a bundled build they do not, and this is
 * honest about that rather than inventing a module — `null` beats a plausible lie.
 */
export interface WriteSite {
  /** Every application module in the call chain, nearest the store first. */
  modules: readonly string[];
  /** The raw frames, for a human who wants to see the path rather than trust the summary. */
  frames: readonly string[];
}

/** Frames inside motu are plumbing, not provenance. */
const MOTU_FRAME = /[\\/]packages[\\/](core|react|runtime|adapters)[\\/]/;

function callSite(): WriteSite {
  const raw = new Error().stack ?? '';
  const frames = raw
    .split('\n')
    .slice(1)
    .map((l) => l.trim())
    .filter((l) => !MOTU_FRAME.test(l) && !/\(node:/.test(l) && !/node_modules/.test(l));
  // NOT "which frame is the writer". Picking one means guessing how many frames of plumbing sit
  // between the store and the code that meant it, and that depth is the application's business: the
  // first version of this skipped exactly one wrapper and named the test's own helper instead of the
  // module that called it. The chain is the answer, and the question asked of it — "did this write
  // come THROUGH the owning island?" — is indifferent to how deep the plumbing goes.
  const modules = frames
    .map((f) => f.match(/\(?([^()\s]+\.[cm]?[jt]sx?):\d+:\d+\)?/)?.[1])
    .filter((f): f is string => Boolean(f));
  return { modules, frames: frames.slice(0, 8) };
}

/**
 * The app-side helper: a write that says who is making it.
 *
 * This is the whole answer to "who wrote this", and it is the same answer motu uses for its own store —
 * `runWithWriteSource` is what the native guard compares against. An application that owns its state
 * keeps owning it; it just names the owner at the write:
 *
 *   // inside the fields widget's own module
 *   export const setEditorMode = (mode) => ownedWrite('w-fields', () => store.set(atom, mode));
 *
 * One line per owned setter, in the module that owns the key. Everything the earlier versions guessed
 * at — which directory the file is in, how a write is spelled, how many frames of plumbing to skip —
 * stops being a question. A write without a tag is not a mystery to be attributed; it is the finding.
 */
export function ownedWrite<T>(owner: string, write: () => T): T {
  return runWithWriteSource(owner, write);
}

/**
 * What each observation has actually SEEN.
 *
 * An instrumented adapter derives its keys from the store — for Twenty, from the atom's `debugLabel`,
 * which is a jotai convention and not an API guarantee. The day that convention changes, the adapter
 * finds no keys, observes nothing, and the region reports clean: a check that passes because it
 * stopped looking, which is the failure mode this whole seam exists to catch in other people's code.
 * So an observation that has seen NOTHING says so.
 */
export interface ForeignObservation {
  regionId: string;
  instrumented: boolean;
  writesSeen: number;
  /** Keys the region declares an island produces — what this observation is watching for. */
  watching: readonly string[];
}

const observations = new Map<string, ForeignObservation>();

/** Every live observation, with what it has seen (debug only). */
export function foreignObservations(): ForeignObservation[] {
  return [...observations.values()];
}

/** key -> the modules seen writing it (debug only). The lens reads this; nothing else needs it. */
const writersByKey = new Map<string, Set<string>>();

/** Every module observed writing a key, per key. */
export function foreignWriters(): Record<string, string[]> {
  return Object.fromEntries([...writersByKey].map(([k, v]) => [k, [...v]]));
}

const unattributed: UnattributedWrite[] = [];
const listeners = new Set<() => void>();

/** Every unattributed write seen so far (debug only; empty in production). */
export function unattributedWrites(): UnattributedWrite[] {
  return [...unattributed];
}

/** Notified when one is recorded — the lens redraws on this. */
export function subscribeUnattributedWrites(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** For tests and for a fresh page. */
export function resetUnattributedWrites(): void {
  unattributed.length = 0;
}

/**
 * Watch an application-owned store against a region's declarations.
 *
 * Returns an unsubscribe. Does nothing in production builds: this is a development instrument, and a
 * framework that ships its diagnostics is a framework that costs its users bytes for its own comfort.
 */
export function observeForeignStore(
  config: AnyArchipelagoConfig,
  adapter: StoreAdapter,
  { windowMs = 1000 }: { windowMs?: number } = {},
): () => void {
  if (!DEBUG) return () => {};

  // Who owns what, from the same declarations the store guard uses.
  const owner = new Map<string, string>();
  for (const island of config.islands) for (const key of writtenKeys(island)) owner.set(key, island.slot);
  const produced = [...owner.keys()];
  if (!produced.length) return () => {};

  const observation: ForeignObservation = {
    regionId: config.id,
    instrumented: Boolean(adapter.instrument),
    writesSeen: 0,
    watching: produced,
  };
  observations.set(config.id, observation);

  const record = (key: string, value: unknown, site?: WriteSite) => {
    observation.writesSeen++;
    if (site?.modules.length) {
      const seen = writersByKey.get(key) ?? new Set<string>();
      for (const m of site.modules) seen.add(m);
      writersByKey.set(key, seen);
    }
    // TAGGED: the write named its owner, so there is nothing to infer. This is the only exact answer
    // available from outside a store, and it is the same one motu's own guard uses.
    const declared = owner.get(key) ?? '?';
    const tagged = currentWriteSource();
    if (tagged) {
      if (tagged === declared) return;
      unattributed.push({ regionId: config.id, key, declaredOwner: declared, value, at: Date.now(), site, wroteAs: tagged });
      listeners.forEach((l) => l());
      return;
    }
    const expected = expectedForeignWriter(config.id, key, windowMs);
    if (expected) return; // a declared output fired for this key, just now: the declaration holding
    unattributed.push({ regionId: config.id, key, declaredOwner: declared, value, at: Date.now(), site });
    listeners.forEach((l) => l());
  };

  // INSTRUMENTED when the store allows it: exact provenance beats the timing window, so it replaces
  // it rather than running alongside. Falling back is not a lesser mode of the same check — it is a
  // different, weaker claim, and mixing the two would make the report mean two things at once.
  if (adapter.instrument) {
    const produce = new Set(produced);
    const stop = adapter.instrument((key, value) => {
      if (produce.has(key)) record(key, value, callSite());
    });
    return () => {
      observations.delete(config.id);
      stop();
    };
  }

  const stop = adapter.subscribe(produced, (key, value) => record(key, value));
  return () => {
    observations.delete(config.id);
    stop();
  };
}

/**
 * Called by the mount paths when a declared output fires, so a foreign change moments later can be
 * recognised as that output landing rather than as a stranger.
 */
export function expectForeignWrites(config: AnyArchipelagoConfig, slot: string, eventName: string): void {
  if (!DEBUG) return;
  const island = config.islands.find((i) => i.slot === slot);
  const target = island?.writes?.[eventName];
  if (!target) return;
  const keys = typeof target === 'string' ? [target] : Object.values(target);
  noteExpectedForeignWrites(config.id, keys as string[], slot);
}
