// The "archipelago": one per legacy page. It declares islands (by named slot), gives them a shared
// Store, and a HostBridge for outward intents (navigation/actions). The page only drops thin
// <motu-island slot="…"> markers; all composition lives here, shipped in the composition root.

import { Store, declareProducers } from './store.js';
import { installChannels, type Channel } from './channel.js';
import { runWithWriteSource, currentWriteSource } from './store.js';

// Stripped in production (see the debug overlay). The mount registry below only tracks when this
// build-time constant is true; the typeof guard keeps it safe under bare Node/tsc.
declare const __MOTU_DEBUG__: boolean;
const DEBUG = typeof __MOTU_DEBUG__ !== 'undefined' && __MOTU_DEBUG__;

/**
 * The mode-specific outward channel. Islands stay host-agnostic and emit intents; the composition
 * root supplies a bridge that knows how to talk to the host (AngularJS $location, a hash router, …).
 */
export interface HostBridge {
  navigate(path: string): void;
  action(name: string, detail: unknown): void;
}

const warnHost: HostBridge = {
  navigate: (path) => console.warn(`motu: no host bridge configured; navigate intent -> ${path}`),
  action: (name) => console.warn(`motu: no host bridge configured; action intent -> ${name}`),
};

export interface IslandContext {
  store: Store;
  host: HostBridge;
}

export interface IslandSpec<TRegion = Record<string, unknown>, TTag extends string = string> {
  /** Marker name the page references: <motu-island slot="member-results">. */
  slot: string;
  /**
   * Custom element tag to instantiate.
   *
   * `TTag` defaults to `string`, which is what an ocean needs. Narrow it to `keyof ElementTypes` (the
   * map `motu island sync` generates) and two things follow: an unknown tag is a compile error rather
   * than a runtime warning, and the tag stays a LITERAL — without which nothing downstream can look
   * the island up to check the events this entry wires (`RegionWiringOk`).
   */
  element: TTag;
  /** Static properties set once on mount. */
  props?: Record<string, unknown>;
  /**
   * Reactively bind an element property to a store key (elementProp -> storeKey).
   *
   * The store key is `keyof TRegion`, so a region that declares its shape gets the binding checked by
   * the compiler: rename the key in the app and this fails to build. That matters because the page and
   * the archipelago otherwise name the same value twice and nothing links them — in peps the page
   * already called it `loadingReceived` while the store key was `receivedLoading`.
   *
   * `| undefined` is not an invitation to write one: it is what lets a region be declared with
   * `satisfies` (which `ProducedKeys` needs — see below), because an array literal of differently
   * shaped island entries infers each absent key as `?: undefined`. Readers skip falsy keys.
   */
  bind?: Record<string, (keyof TRegion & string) | undefined>;
  /**
   * Handle a CustomEvent the island emits; typically writes the store or fires a host intent.
   *
   * `| undefined` for the same reason as `bind`: it keeps a `satisfies`-declared region assignable.
   */
  on?: Record<string, ((detail: unknown, ctx: IslandContext) => void) | undefined>;
  /**
   * What this island's output WRITES: event name -> the store key it owns, or a map from fields of the
   * event's detail to keys. Declaring it does three things a handler function cannot:
   *
   *  1. it declares OWNERSHIP — nobody else may update those keys (see `producerOf`), which is what
   *     stops a page wiring two islands together through its own state (docs/plan-key-ownership.md);
   *  2. it makes the region's graph readable WITHOUT running it — event, key and reader are all
   *     declared, so the lens can draw the wiring before anything fires;
   *  3. it is EJECTABLE. Removing motu has to leave the coupling working, and a `useState` + callback
   *     prop can be generated from this mapping. It cannot be generated reliably from an arbitrary
   *     function body, which is why writing goes here and `on` keeps only what has no store effect
   *     (host intents).
   *
   * Declared on the region's wiring rather than on the island: the same island can own a key in one
   * region and be a pure consumer of it in another (D2).
   *
   * Ownership is about UPDATES, not first paint — a key is normally host-seeded and island-produced
   * afterwards (D4), so `seed` and this coexist.
   *
   *   writes: { 'new-count': 'newReceivedCount' }                       // detail IS the value
   *   writes: { 'week-progress': { overallProgress: 'overallProgress' } } // detail.field -> key
   */
  writes?: Record<string, (keyof TRegion & string) | Record<string, keyof TRegion & string> | undefined>;
}

/**
 * A region's declared shape.
 *
 * `TRegion` is the CONTRACT TYPE, and it is extracted from the host application — it contains no motu
 * import and it erases at runtime, so removing motu leaves it (and the page that uses it) untouched.
 * It defaults to an open record for the ocean, where there IS no app-side type to extract: region
 * state lives in `$scope` and motu declares it. Under a modern host, `motu archipelago verify`
 * requires the parameter, because there the page owns the state and motu must reference it rather
 * than restate it.
 */
export interface ArchipelagoConfig<TRegion = Record<string, unknown>, TTag extends string = string> {
  id: string;
  islands: IslandSpec<TRegion, TTag>[];
  /**
   * Store keys fed from OUTSIDE the region — the host's own, written through `provideToArchipelago`
   * or a channel.
   *
   * The counterpart of `IslandSpec.produces`: between them, every key an island binds has exactly one
   * declared owner. Claiming a key here changes no behaviour; it makes host feeding visible (a bare
   * `store.set` carries no source at all) and it is the one-word declaration a legacy region uses to
   * adopt ownership key by key (D3, D8).
   */
  provides?: (keyof TRegion & string)[];
  /**
   * The "new design" layout: HTML arranging the island slots (e.g. hero + toolbar + results). It is
   * rendered natively by <motu-archipelago name="id"> in the standalone app, and swapped in as a
   * whole region when previewing inside the legacy app. Shared so both stay in lock-step.
   */
  layout?: string;
}

/**
 * The keys a region declares as island-produced, as a union.
 *
 * Only meaningful when the config keeps its literal types — declare it with `satisfies
 * ArchipelagoConfig<Region>` rather than a type annotation, or every `produces` entry widens to
 * `keyof Region` and this yields the whole region.
 */
export type ProducedKeys<A> = A extends { islands: readonly (infer I)[] } ? ProducesOf<I> : never;

/** Distributes over the island union; an entry without `writes` contributes nothing. */
type ProducesOf<I> = I extends { writes: infer W } ? KeysIn<W[keyof W]> : never;

/** A `writes` value is the key itself, or a map of detail fields to keys. */
type KeysIn<V> = V extends string ? V : V extends Record<string, infer K> ? (K extends string ? K : never) : never;

/** Every store key an island reads, as a union. Entries without `bind` contribute nothing. */
export type BoundKeys<A> = A extends { islands: readonly (infer I)[] } ? BindsOf<I> : never;
type BindsOf<I> = I extends { bind: infer B } ? B[keyof B] & string : never;

/** Every key the region declares as host-fed. */
export type ProvidedKeys<A> = A extends { provides: readonly (infer K)[] } ? (K extends string ? K : never) : never;

/** Bound, but claimed by nobody: neither `provides` nor any island's `writes`. */
export type UnownedKeys<A> = Exclude<BoundKeys<A>, ProvidedKeys<A> | ProducedKeys<A>>;

/** Claimed twice — the host says it feeds it, an island says it writes it. */
export type DisputedKeys<A> = ProvidedKeys<A> & ProducedKeys<A>;

/**
 * Ownership as a COMPILE failure rather than a report.
 *
 * `verify` can only say these things after the fact, in a separate step someone has to run. They are
 * set operations over declarations the compiler already holds, so they can be a build error instead —
 * in the same loop as the edit that caused them, with `tsc`'s already-machine-readable output. One
 * line per region:
 *
 *   const _ownership: RegionOwnershipOk<typeof actionsArchipelago> = true;
 *
 * Resolves to `true` when every bound key has exactly one owner, and otherwise to a labelled tuple —
 * so the error names the offending keys rather than just failing.
 *
 * What CANNOT move here, and is why `verify` still exists: whether a declared output ever fires, and
 * whether a declaration is HONEST. Both are runtime facts; types can only check consistency.
 */
export type RegionOwnershipOk<A> = [UnownedKeys<A>] extends [never]
  ? [DisputedKeys<A>] extends [never]
    ? true
    : ['declared in `provides` AND written by an island:', DisputedKeys<A>]
  : ['bound but owned by nobody — add to `provides`, or to an island\'s `writes`:', UnownedKeys<A>];

/** The CustomEvent names an island declares as outputs, from its element spec's contract. */
export type EventsOf<E> = E extends { options: { contract: { output: infer O } } }
  ? O[keyof O] & string
  : never;

/**
 * Wiring as a COMPILE failure: every event an island entry wires must be one the island declares.
 *
 * This is the last silently-dead declaration. `writes: { 'week-progres': 'x' }` is a well-typed
 * mapping onto a well-typed key — nothing about it is wrong except that no island will ever dispatch
 * it, which used to be discoverable only by running the region and noticing nothing moved.
 *
 * It needs the project's tag -> element-spec map, which `motu island sync` generates beside the
 * registry; pass it as `TElements`. Type-only, so the archipelago gains no runtime dependency on the
 * island modules:
 *
 *   const _wiring: RegionWiringOk<typeof actionsArchipelago, ElementTypes> = true;
 *
 * Checked against the project's whole event vocabulary, not per island: an array literal of
 * differently-shaped entries is normalised into a union whose members no longer carry their own
 * `element` alongside their own `writes`, so the tag cannot be matched to the entry that used it. A
 * typo therefore fails (it names no island's event); wiring island A's event onto island B does not,
 * and stays a runtime finding ("declared but never fired"). Per-entry precision needs the config
 * declared through a helper with a `const` type parameter, which is a bigger change to how a region
 * is authored.
 */
export type RegionWiringOk<A, TElements> = [Undeclared<A, TElements>] extends [never]
  ? true
  : ['wired to an event no island declares:', Undeclared<A, TElements>];

type Undeclared<A, TElements> = Exclude<AllWiredEvents<A>, AllDeclaredEvents<TElements>>;

type AllWiredEvents<A> = A extends { islands: readonly (infer I)[] } ? WiredEvents<I> : never;

type AllDeclaredEvents<TElements> = { [K in keyof TElements]: EventsOf<TElements[K]> }[keyof TElements];

/** Every event name an island entry mentions, in `writes` or in `on`. */
type WiredEvents<I> = (I extends { writes: infer W } ? keyof W & string : never) | (I extends { on: infer H } ? keyof H & string : never);

/**
 * The half of a region the HOST may still assign — everything it does not declare an island to
 * produce. Put it where the page already declares its shape (`… satisfies HostRegion<R, typeof arch>`)
 * and assigning a produced key becomes a compile error naming the file that was doing the laundering.
 *
 * A host that also wants `motu removal-check` to stay green should not import this type into page
 * code: write the split as a plain `Omit` in the APP (no motu import, erases with the framework) and
 * assert the two agree from the archipelago file, which is deleted with motu anyway. See
 * `ProducedKeysAre`.
 */
export type HostRegion<R, A> = Omit<R, ProducedKeys<A> & keyof R>;

/**
 * Compile-time cross-check between an app-side host/produced split and what the archipelago declares.
 *
 * Resolves to `true` when they agree, and to a labelled tuple when they do not — so the type error
 * shows which keys are missing on which side:
 *
 *   type _Check = ProducedKeysAre<typeof actionsArchipelago, 'overallProgress' | 'completedCount'>;
 *   const _check: _Check = true;   // fails to compile when the two drift apart
 */
export type ProducedKeysAre<A, Expected extends string> = [ProducedKeys<A>] extends [Expected]
  ? [Expected] extends [ProducedKeys<A>]
    ? true
    : ['declared by the app but not in any `produces`:', Exclude<Expected, ProducedKeys<A>>]
  : ['in `produces` but still assignable by the host:', Exclude<ProducedKeys<A>, Expected>];

/**
 * A region whose declared shape is not known to the code holding it.
 *
 * Registries, resolvers and the framework's own mount paths only ROUTE archipelagos — they never read
 * a bind key, so the region type is genuinely irrelevant to them, and insisting on it would force
 * every such signature to become generic for no checking gained. The `any` is the erasure, and it is
 * confined to these positions: the place the type actually earns its keep — an archipelago's own
 * declaration — keeps it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyArchipelagoConfig = ArchipelagoConfig<any, string>;

export interface ArchipelagoOptions {
  /** Outward channel for navigation/actions. Defaults to a warning no-op. */
  host?: HostBridge;
  /** Initial store contents so islands render meaningfully on first mount. */
  seed?: Record<string, unknown>;
  /** Inbound channels: host signals mirrored into the store (host -> islands). */
  channels?: Channel[];
}

interface SlotEntry {
  spec: IslandSpec;
  store: Store;
  host: HostBridge;
}

const slots = new Map<string, SlotEntry>();
const layouts = new Map<string, string>();
const stores = new Map<string, Store>();
const archSlots = new Map<string, string[]>();

/** The layout template registered for an archipelago id (used by <motu-archipelago>). */
export function getArchipelagoLayout(id: string): string | undefined {
  return layouts.get(id);
}

/** The slot names of an archipelago, in declared order — the mountpoints the gallery view frames. */
export function getArchipelagoSlots(id: string): string[] {
  return archSlots.get(id) ?? [];
}

/** The store of an archipelago by id — the inbound seam <motu-archipelago>.provide() writes to. */
export function getArchipelagoStore(id: string): Store | undefined {
  return stores.get(id);
}

/** The store backing a slot — the inbound seam a standalone <motu-island>.provide() writes to. */
export function getSlotStore(slot: string): Store | undefined {
  return slots.get(slot)?.store;
}

// --- Dev-only mount registry (debug overlay) -----------------------------------------------------
// The overlay follows islands as they mount/unmount (constantly, under ng-if) WITHOUT holding refs
// that would block their cleanup: it subscribes to this registry and re-reads it, rather than keeping
// its own element list. Each entry carries the linker data the overlay needs (spec.bind/props/on) and
// the shared store, so "bound vs default" and "keys read" are computed with zero per-island cost.

/** One mounted island as the overlay sees it. */
export interface MountedIslandInfo {
  slot: string;
  /** The custom-element tag that was instantiated. */
  element: string;
  el: HTMLElement;
  spec: IslandSpec;
  store: Store;
}

const mounted = new Set<MountedIslandInfo>();
const mountListeners = new Set<() => void>();

/**
 * Feed a value into an archipelago's store from OUTSIDE it — the `provide` seam, without an element.
 *
 * <motu-archipelago>.provide() is the same thing with a DOM handle in front of it, which is what an
 * ocean needs. A React host has no such element (islands render in its own tree), so the seam has to
 * be reachable by archipelago id too, or the host-feeds-the-region direction would exist on one mount
 * path and not the other.
 */
export function provideToArchipelago(id: string, key: string, value: unknown): void {
  const store = stores.get(id);
  if (!store) {
    console.warn(`motu: no archipelago "${id}" to provide("${key}")`);
    return;
  }
  // Tag as a host-origin (external) write so the overlay classifies this key as coming from outside.
  if (DEBUG) runWithWriteSource('host', () => store.set(key, value));
  else store.set(key, value);
}

/**
 * (Re-)establish the INITIAL value of a key from outside the region — including a key an island owns.
 *
 * `provide()` is the host feeding a key it owns; this is the host saying "this is where the data
 * starts", which is a different act and the only legitimate way to touch a produced key from outside
 * (D4: a seed is first paint, `writes` owns what happens next). A page that fetches the week and then
 * lets the island mutate it needs exactly this, and needs it again on every refetch — otherwise the
 * store keeps the island's stale list and the host's new one never lands.
 *
 * Tagged 'seed', so the ownership check lets it through and the lens can tell it from an update. A
 * host that seeds the same key over and over is deriving it, not seeding it — that is the laundering
 * smell in a new hat, and it is worth reporting rather than blocking.
 */
export function seedArchipelago(id: string, key: string, value: unknown): void {
  const store = stores.get(id);
  if (!store) {
    console.warn(`motu: no archipelago "${id}" to seed("${key}")`);
    return;
  }
  if (DEBUG) runWithWriteSource('seed', () => store.set(key, value));
  else store.set(key, value);
}

/**
 * Register an island mounted by something other than the custom element — the React host path, where
 * an island renders inside the page's own tree and no <motu-island> is created.
 *
 * The seam lens reads this registry, so without it a React-mounted island is invisible to the very
 * tool that exists to show what is and is not connected. Returns the disposer to call on unmount.
 * Debug-only, like the registry itself: in production this is a no-op and costs nothing.
 */
export function registerMountedIsland(info: MountedIslandInfo): () => void {
  if (!DEBUG) return () => {};
  mounted.add(info);
  notifyMounts();
  return () => {
    mounted.delete(info);
    notifyMounts();
  };
}

/** Every currently-mounted island (debug only; empty in production). */
export function getMountedIslands(): MountedIslandInfo[] {
  return [...mounted];
}

/** Notified whenever an island mounts or unmounts (debug only). Returns an unsubscribe. */
export function subscribeMounts(cb: () => void): () => void {
  mountListeners.add(cb);
  return () => mountListeners.delete(cb);
}

// --- Dev-only host-intent seam (debug overlay) ---------------------------------------------------
// The HostBridge is the OUTBOUND boundary: an island's intent leaving the motu world for the ocean
// (navigate / action). In debug builds the bridge is wrapped to emit each intent — so the overlay can
// show what an island pushes OUT, attributed to the island whose handler fired it.

/** One outbound intent crossing the motu boundary to the host. */
export interface HostIntent {
  kind: 'navigate' | 'action';
  /** The path (navigate) or action name (action). */
  name: string;
  detail?: unknown;
  /** The island slot the intent was fired from, if inside an event handler. */
  source: string | null;
  at: number;
}

const intentListeners = new Set<(i: HostIntent) => void>();

/** Observe outbound host intents (navigate/action) crossing the boundary (debug only). */
export function observeHostIntents(cb: (i: HostIntent) => void): () => void {
  intentListeners.add(cb);
  return () => intentListeners.delete(cb);
}

function emitIntent(i: HostIntent): void {
  intentListeners.forEach((l) => l(i));
}

function instrumentHost(host: HostBridge): HostBridge {
  return {
    navigate: (path) => {
      emitIntent({ kind: 'navigate', name: path, source: currentWriteSource(), at: Date.now() });
      host.navigate(path);
    },
    action: (name, detail) => {
      emitIntent({ kind: 'action', name, detail, source: currentWriteSource(), at: Date.now() });
      host.action(name, detail);
    },
  };
}

function notifyMounts(): void {
  mountListeners.forEach((l) => l());
}

/** Every store key an island's `writes` mapping can update. */
export function writtenKeys(spec: IslandSpec): string[] {
  const out: string[] = [];
  for (const target of Object.values(spec.writes ?? {})) {
    if (typeof target === 'string') out.push(target);
    else if (target) out.push(...Object.values(target));
  }
  return out;
}

/** Event names this island's outputs are wired to — declarative writes and intent handlers alike. */
export function outputEvents(spec: IslandSpec): string[] {
  return [...new Set([...Object.keys(spec.writes ?? {}), ...Object.keys(spec.on ?? {})])];
}

/**
 * Apply one output event: the declared writes first, then the handler (which exists for effects that
 * are NOT store writes — a host intent, a refetch). Shared by both mount paths so an island behaves
 * the same however it was mounted.
 */
export function applyOutput(spec: IslandSpec, eventName: string, detail: unknown, ctx: IslandContext): void {
  const target = spec.writes?.[eventName];
  if (typeof target === 'string') {
    ctx.store.set(target, detail);
  } else if (target) {
    const fields = (detail ?? {}) as Record<string, unknown>;
    for (const [field, key] of Object.entries(target)) ctx.store.set(key, fields[field]);
  }
  spec.on?.[eventName]?.(detail, ctx);
}

/**
 * Registers an archipelago. Each island becomes mountable by slot, all sharing one store and host.
 * Returns the store so a composition root can seed or observe it.
 */
export function defineArchipelago(config: ArchipelagoConfig, opts: ArchipelagoOptions = {}): Store {
  const store = new Store(opts.seed);
  // Who owns which key, for the store's write check. A seed is not a write (it goes through the
  // constructor), so first paint never trips it — `produces` is about UPDATES (D4).
  const producers = new Map<string, string>();
  for (const island of config.islands) {
    for (const key of writtenKeys(island)) producers.set(key, island.slot);
  }
  declareProducers(store, producers);
  const host = DEBUG ? instrumentHost(opts.host ?? warnHost) : opts.host ?? warnHost;
  for (const island of config.islands) {
    slots.set(island.slot, { spec: island, store, host });
  }
  stores.set(config.id, store);
  archSlots.set(config.id, config.islands.map((i) => i.slot));
  if (config.layout) {
    layouts.set(config.id, config.layout);
  }
  if (opts.channels?.length) {
    installChannels(store, opts.channels);
  }
  return store;
}

interface MountedIsland extends HTMLElement {
  __motuDispose?: () => void;
}

/**
 * Mounts the island registered for `slot` into `hostEl`: wires static props, reactive store binds,
 * and event handlers. Returns the created element (with a `__motuDispose` for teardown), or null.
 */
export function mountIsland(slot: string, hostEl: HTMLElement): HTMLElement | null {
  const entry = slots.get(slot);
  if (!entry) {
    console.warn(`motu: no island registered for slot "${slot}"`);
    return null;
  }
  const { spec, store, host } = entry;
  const el = document.createElement(spec.element) as MountedIsland & Record<string, unknown>;

  for (const [k, v] of Object.entries(spec.props ?? {})) {
    el[k] = v;
  }

  let unsub: (() => void) | undefined;
  if (spec.bind) {
    const apply = () => {
      for (const [prop, key] of Object.entries(spec.bind!)) {
        if (!key) continue;
        el[prop] = store.get(key);
      }
    };
    apply();
    unsub = store.subscribe(apply);
  }

  for (const eventName of outputEvents(spec)) {
    el.addEventListener(eventName, (e) => {
      const detail = (e as CustomEvent).detail;
      // Tag every store write this event causes with the island, so the overlay's coupling view can
      // attribute writers (reads are already declarative via spec.bind).
      if (DEBUG) runWithWriteSource(slot, () => applyOutput(spec, eventName, detail, { store, host }));
      else applyOutput(spec, eventName, detail, { store, host });
    });
  }

  let info: MountedIslandInfo | undefined;
  if (DEBUG) {
    info = { slot, element: spec.element, el, spec, store };
    mounted.add(info);
    notifyMounts();
  }

  el.__motuDispose = () => {
    unsub?.();
    if (info) {
      mounted.delete(info);
      notifyMounts();
    }
  };
  hostEl.appendChild(el);
  return el;
}
