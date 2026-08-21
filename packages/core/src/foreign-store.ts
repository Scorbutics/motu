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
import { noteExpectedForeignWrites, expectedForeignWriter } from './store.js';
import { writtenKeys } from './archipelago.js';
import type { AnyArchipelagoConfig } from './archipelago.js';

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
}

/** A change to a key an island claims to produce, with nothing declared to account for it. */
export interface UnattributedWrite {
  regionId: string;
  key: string;
  /** The island the archipelago says owns this key. */
  declaredOwner: string;
  value: unknown;
  at: number;
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

  return adapter.subscribe(produced, (key, value) => {
    const expected = expectedForeignWriter(config.id, key, windowMs);
    if (expected) return; // a declared output fired for this key, just now: the declaration holding
    unattributed.push({ regionId: config.id, key, declaredOwner: owner.get(key) ?? '?', value, at: Date.now() });
    listeners.forEach((l) => l());
  });
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
