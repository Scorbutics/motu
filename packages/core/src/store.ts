// A tiny observable key/value store shared by the islands of one archipelago. It is deliberately
// framework-free: islands read/write it through their archipelago wiring, never directly.

// Stripped in production (see the debug overlay). Write attribution below only runs in debug builds;
// the typeof guard keeps it safe under bare Node/tsc.
declare const __MOTU_DEBUG__: boolean;
const DEBUG = typeof __MOTU_DEBUG__ !== 'undefined' && __MOTU_DEBUG__;

export type StoreListener = () => void;

// --- Dev-only: writes motu EXPECTS in a store it does not own (see foreign-store.ts) --------------
// An application's own store cannot say who wrote a key. What motu knows is that an island just fired
// a declared output, so the keys that output claims are about to move. A change inside that window is
// the declaration landing; one outside it is a value moving with nothing to account for it.

/** regionId -> key -> { slot, at } for the last declared output that claims the key. */
const expectedForeign = new Map<string, Map<string, { slot: string; at: number }>>();

/** Record that `slot` fired an output declaring these keys. */
export function noteExpectedForeignWrites(regionId: string, keys: readonly string[], slot: string): void {
  if (!DEBUG) return;
  const forRegion = expectedForeign.get(regionId) ?? new Map();
  const at = Date.now();
  for (const key of keys) forRegion.set(key, { slot, at });
  expectedForeign.set(regionId, forRegion);
}

/**
 * The slot whose declared output can account for this key changing now, if any — and CONSUMED.
 *
 * One declared output explains one write. Leaving the expectation open for the rest of the window let
 * a single legitimate emit excuse every write that followed it: in the first run of this seam against
 * a Jotai-shaped store, one declared change absorbed the undeclared one that came a millisecond later,
 * and the check reported nothing. An expectation is a receipt, not a permit.
 */
export function expectedForeignWriter(regionId: string, key: string, windowMs: number): string | null {
  const forRegion = expectedForeign.get(regionId);
  const hit = forRegion?.get(key);
  if (!hit) return null;
  forRegion!.delete(key);
  return Date.now() - hit.at <= windowMs ? hit.slot : null;
}

// --- Dev-only key ownership (docs/plan-key-ownership.md) -----------------------------------------
// `bind` says who READS a key; `produces` says who may write it. The store is the only place every
// write passes through, so it is where a write from the wrong source is caught. Debug-only: in
// production the map is never filled and the check never runs.

const producerOfKey = new WeakMap<Store, Map<string, string[]>>();
const ownershipWarned = new Set<string>();

// --- Dev-only laundering smell (docs/plan-key-ownership.md, verify check 4) ----------------------
// Ownership makes bypass impossible; it cannot make a declaration HONEST. A key declared host-fed but
// really derived from what an island did still passes every check — the page computes it, provides it,
// and the region looks fed from outside. What gives it away is TIMING: the host writing a bound key
// moments after an island emitted. Undecidable statically, cheap to notice at runtime.

const readerOfKey = new WeakMap<Store, Map<string, string[]>>();
let lastOutput: { slot: string; event: string; at: number } | null = null;
let forceSettled = false;
const suspects: LaunderingSuspect[] = [];

/** A host write to a bound key, close enough behind an island's output to be its consequence. */
export interface LaunderingSuspect {
  key: string;
  readers: string[];
  after: { slot: string; event: string };
  gapMs: number;
}

/**
 * Every declared output that has FIRED, and how often — the tally behind `emitted-live`.
 *
 * Deliberately not derived from store writes. `set` early-returns when the value is unchanged, so an
 * output whose payload agrees with the seed moves nothing and would read as "never emitted" — which is
 * the common case in a lagoon, where the seed is written to be consistent. Emission is a fact about
 * the OUTPUT, so it is recorded where the output happens.
 */
const outputTally = new Map<string, { slot: string; event: string; n: number }>();

/** Called by the mount paths when an island's declared output fires. */
export function noteIslandOutput(slot: string, event: string): void {
  if (!DEBUG) return;
  lastOutput = { slot, event, at: Date.now() };
  const id = `${slot}\u0000${event}`;
  const prev = outputTally.get(id);
  if (prev) prev.n += 1;
  else outputTally.set(id, { slot, event, n: 1 });
}

/** What has fired so far (debug only; empty in production). */
export function islandOutputs(): { slot: string; event: string; n: number }[] {
  return [...outputTally.values()].map((o) => ({ ...o }));
}

/**
 * Forget what has fired.
 *
 * The verify lane opens ONE page for the whole run and re-aims it, so by the time the flows run, the
 * wiring probe has already fired EVERY declared write on that page. A tally read afterwards says
 * everything emitted — including outputs a component only ever fires from a click. Reset, remount, and
 * read: then what is in the tally is what rendering alone produced.
 */
export function resetIslandOutputs(): void {
  outputTally.clear();
}

/** Suspects seen so far (debug only; empty in production). */
export function launderingSuspects(): LaunderingSuspect[] {
  return [...suspects];
}

/**
 * Forget what has been seen.
 *
 * The harness seeds a region before it drives it, and seeding is a host write moments before an island
 * emits — indistinguishable from the smell unless the window is narrowed deliberately. The caller
 * resets after setup, so what is collected is the response to the act, not the preparation for it.
 */
export function resetLaunderingSuspects(): void {
  suspects.length = 0;
  lastOutput = null;
  // NOT the output tally: `emitted-live` asks whether the component ever produced its output, and the
  // harness resets after seeding — which is exactly when a mount-effect output has already fired.
  // An explicit reset IS the statement that setup is over — the harness calls it after seeding a
  // scenario, which can happen well inside the store's own settling window.
  forceSettled = true;
}

/** Called by `defineArchipelago` with `key -> reading slots`, so a host write can be judged. */
export function declareReaders(store: Store, readers: Map<string, string[]>): void {
  if (DEBUG) readerOfKey.set(store, readers);
}

/** Called by `defineArchipelago` with `key -> producing slot` for this region. */
export function declareProducers(store: Store, producers: Map<string, string | string[]>): void {
  if (!DEBUG) return;
  // Normalised to a LIST because one island can legitimately be mounted twice — the same filter panel
  // in a desktop sidebar and a mobile drawer is one owner at two slots, not two owners. The caller
  // decides what counts as the same island; here they are simply the slots allowed to write the key.
  const normalised = new Map<string, string[]>();
  for (const [key, slots] of producers) normalised.set(key, Array.isArray(slots) ? slots : [slots]);
  producerOfKey.set(store, normalised);
}

/** The producing slot for a key, or undefined when the key is unowned (debug only). */
export function producerOf(store: Store, key: string): string | undefined {
  return producerOfKey.get(store)?.get(key)?.[0];
}

/** Every slot allowed to write a key — more than one only for an island mounted at several slots. */
export function producersOf(store: Store, key: string): string[] | undefined {
  return producerOfKey.get(store)?.get(key);
}

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
  /** When this store came into existence — mount-time writes are setup, not consequence. */
  readonly createdAt = Date.now();

  private data: Record<string, unknown>;
  private listeners = new Set<StoreListener>();
  /**
   * Cached snapshot, rebuilt only when something actually changes.
   *
   * `useSyncExternalStore` re-reads the snapshot on every render and compares it by IDENTITY: a fresh
   * object each call is an infinite render loop, not a wasted allocation. Caching here rather than in
   * the hook keeps the guarantee where the writes are.
   */
  private snapshotCache: Record<string, unknown> | null = null;
  /** Bumped on every real change — the cheapest thing a subscriber can compare. */
  private revision = 0;

  constructor(seed: Record<string, unknown> = {}) {
    this.data = { ...seed };
  }

  get<T = unknown>(key: string): T | undefined {
    return this.data[key] as T | undefined;
  }

  /**
   * Has this key been written at all?
   *
   * The precedence rule for a host that feeds its own islands (a React page passing props) is "the
   * store wins when the key is bound AND HAS BEEN SET" — so *never set* and *set to `undefined`* have
   * to be distinguishable, which `get()` alone cannot do. One rule, owned here, rather than each
   * binding inventing its own.
   */
  has(key: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.data, key);
  }

  set(key: string, value: unknown): void {
    // A write that changes nothing notifies nobody. Beyond the wasted renders, an unconditional
    // notify turns any write-during-render into a feedback loop: island renders -> writes the same
    // value -> every bound island re-renders -> writes again. Cheap guard, and it only catches the
    // no-op case — a new object identity with the same contents still notifies, as it must.
    //
    // The presence test is load-bearing, not defensive: without it, `set(k, undefined)` on a key that
    // was never written returns here and the key is NEVER CREATED, so `has()` stays false and the
    // precedence rule above silently reads the wrong side.
    if (this.has(key) && Object.is(this.data[key], value)) return;
    // Before the assignment: the smell below distinguishes establishing a key from overwriting one.
    const wasSet = Object.prototype.hasOwnProperty.call(this.data, key);
    this.data[key] = value;
    this.snapshotCache = null;
    this.revision++;
    if (DEBUG) {
      // Ownership. A produced key has exactly one writer; anyone else reaching it — the host through
      // `provide()`, a sibling island, a bare `store.set` — is the coupling the archipelago is
      // supposed to be holding, going around it. Loud, once per key+source, and never fatal: this
      // runs in a browser, where throwing would take the page down over a diagnostic.
      // 'seed' is the host establishing a starting value, not updating one — see seedArchipelago.
      const owners = producerOfKey.get(this)?.get(key);
      const owner = owners?.[0];
      if (owners && writeSource && !owners.includes(writeSource) && writeSource !== 'seed') {
        const mark = `${key}:${writeSource ?? 'unattributed'}`;
        if (!ownershipWarned.has(mark)) {
          ownershipWarned.add(mark);
          console.error(
            `motu: "${key}" is produced by island "${owner}", but it was written by ` +
              `${writeSource ? `"${writeSource}"` : 'unattributed host code'}. Route it through that ` +
              `island's output, or change who the archipelago declares as its producer.`,
          );
        }
      }
      // Laundering: the HOST writing a key an island reads, right after an island emitted. Recorded,
      // never fatal — it is a suspicion about provenance, and provenance is not decidable here.
      const readers = readerOfKey.get(this)?.get(key);
      const external = writeSource === null || writeSource === 'host';
      // Only an OVERWRITE can be laundering. The first value a key ever gets is the host establishing
      // the region — it happens during mount, moments after some island's first emit, and reading that
      // as "the page answered the island" was the smell's loudest false positive.
      // …and not while the region is still being established. A host frame that seeds a key and then
      // feeds it again from a mount effect is setting the region up, not answering an island — and at
      // mount SOME island has always just emitted, so every such key looked laundered.
      const settled = forceSettled || Date.now() - this.createdAt > 2000;
      if (readers?.length && external && wasSet && settled && lastOutput) {
        const gapMs = Date.now() - lastOutput.at;
        if (gapMs <= 1500 && !suspects.some((s2) => s2.key === key && s2.after.slot === lastOutput!.slot)) {
          suspects.push({ key, readers, after: { slot: lastOutput.slot, event: lastOutput.event }, gapMs });
        }
      }
      const w: StoreWrite = { store: this, key, source: writeSource, at: Date.now() };
      writeListeners.forEach((l) => l(w));
      // provide() tags its writes 'host'; capture them (with the value) as lagoon seed.
      if (seedSink && writeSource === 'host') seedSink.push({ key, value, source: 'host' });
    }
    this.listeners.forEach((l) => l());
  }

  /**
   * Every key currently held, as a plain object — for a host reading the region (see `useRegion`).
   *
   * The SAME object until the next write, so it can be compared by identity.
   */
  snapshot(): Record<string, unknown> {
    if (!this.snapshotCache) this.snapshotCache = { ...this.data };
    return this.snapshotCache;
  }

  /** How many changes this store has seen. Stable between writes, so it is a valid store snapshot. */
  getRevision(): number {
    return this.revision;
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
  // The laundering smell, readable by the verify harness after it has driven a region's flows.
  (globalThis as unknown as { __motuSuspects?: unknown }).__motuSuspects = Object.assign(launderingSuspects, {
    list: launderingSuspects,
    reset: resetLaunderingSuspects,
  });
}
