// A tiny observable key/value store shared by the islands of one archipelago. It is deliberately
// framework-free: islands read/write it through their archipelago wiring, never directly.

// Stripped in production (see the debug overlay). Write attribution below only runs in debug builds;
// the typeof guard keeps it safe under bare Node/tsc.
declare const __MOTU_DEBUG__: boolean;
const DEBUG = typeof __MOTU_DEBUG__ !== 'undefined' && __MOTU_DEBUG__;

export type StoreListener = () => void;

// --- Dev-only write attribution (debug overlay) --------------------------------------------------
// Reads are declarative (an island's `bind`), but writes happen inside opaque `on` handlers and
// channels. To answer "which island writes which key" (the archipelago coupling view) we tag each
// write with the source the framework set around it — without changing the Store's public shape.

/** A single store write as the overlay sees it. */
export interface StoreWrite {
  store: Store;
  key: string;
  source: string | null;
  at: number;
}

let writeSource: string | null = null;
const writeListeners = new Set<(w: StoreWrite) => void>();

/** Runs `fn` with `source` tagged onto any store write it makes (framework use; islands never call it). */
export function runWithWriteSource<T>(source: string | null, fn: () => T): T {
  const prev = writeSource;
  writeSource = source;
  try {
    return fn();
  } finally {
    writeSource = prev;
  }
}

/** Observe every store write with its attributed source (debug only). Returns an unsubscribe. */
export function observeStoreWrites(cb: (w: StoreWrite) => void): () => void {
  writeListeners.add(cb);
  return () => writeListeners.delete(cb);
}

/** The write source currently in effect (debug only) — lets the host-intent seam attribute intents. */
export function currentWriteSource(): string | null {
  return writeSource;
}

// --- Dev-only SEED recording (fixture capture) ---------------------------------------------------
// `motu fixtures record` / the overlay record button capture the values the OCEAN feeds islands —
// channel writes and `provide()` calls — so the lagoon can be seeded with REAL host state, not just a
// hand-written stub. Only host-origin writes (source 'host' via provide(), or 'channel') are kept;
// island writes are internal and excluded. Off unless startSeedRecording() runs.

/** One captured host-fed store write: the key, the value fed, and where it came from. */
export interface RecordedSeed {
  key: string;
  value: unknown;
  source: 'host' | 'channel';
}

let seedSink: RecordedSeed[] | null = null;

/** Begin capturing host-fed store writes (dev tooling). */
export function startSeedRecording(): void {
  seedSink = [];
}

/** Stop capturing and return everything recorded since startSeedRecording(). */
export function stopSeedRecording(): RecordedSeed[] {
  const out = seedSink ?? [];
  seedSink = null;
  return out;
}

/** Record a host-fed write (called by the channel seam, which has the value before delegating). */
export function recordSeedWrite(key: string, value: unknown, source: 'host' | 'channel'): void {
  if (seedSink) seedSink.push({ key, value, source });
}

export class Store {
  private data: Record<string, unknown>;
  private listeners = new Set<StoreListener>();

  constructor(seed: Record<string, unknown> = {}) {
    this.data = { ...seed };
  }

  get<T = unknown>(key: string): T | undefined {
    return this.data[key] as T | undefined;
  }

  set(key: string, value: unknown): void {
    // A write that changes nothing notifies nobody. Beyond the wasted renders, an unconditional
    // notify turns any write-during-render into a feedback loop: island renders -> writes the same
    // value -> every bound island re-renders -> writes again. Cheap guard, and it only catches the
    // no-op case — a new object identity with the same contents still notifies, as it must.
    if (Object.is(this.data[key], value)) return;
    this.data[key] = value;
    if (DEBUG) {
      const w: StoreWrite = { store: this, key, source: writeSource, at: Date.now() };
      writeListeners.forEach((l) => l(w));
      // provide() tags its writes 'host'; capture them (with the value) as lagoon seed.
      if (seedSink && writeSource === 'host') seedSink.push({ key, value, source: 'host' });
    }
    this.listeners.forEach((l) => l());
  }

  subscribe(l: StoreListener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}

// In debug builds, expose the seed recorder to the page (paired with @motu/runtime's __motuRecorder)
// so `motu fixtures record` can drive both from the browser. Stripped in production.
if (DEBUG && typeof globalThis !== 'undefined') {
  (globalThis as unknown as { __motuSeedRecorder?: unknown }).__motuSeedRecorder = {
    start: startSeedRecording,
    stop: stopSeedRecording,
  };
}
