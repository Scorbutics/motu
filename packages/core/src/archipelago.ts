// The "archipelago": one per legacy page. It declares islands (by named slot), gives them a shared
// Store, and a HostBridge for outward intents (navigation/actions). The page only drops thin
// <motu-island slot="…"> markers; all composition lives here, shipped in the composition root.

import { Store } from './store.js';
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

export interface IslandSpec {
  /** Marker name the page references: <motu-island slot="member-results">. */
  slot: string;
  /** Custom element tag to instantiate. */
  element: string;
  /** Static properties set once on mount. */
  props?: Record<string, unknown>;
  /** Reactively bind an element property to a store key (elementProp -> storeKey). */
  bind?: Record<string, string>;
  /** Handle a CustomEvent the island emits; typically writes the store or fires a host intent. */
  on?: Record<string, (detail: unknown, ctx: IslandContext) => void>;
}

export interface ArchipelagoConfig {
  id: string;
  islands: IslandSpec[];
  /**
   * The "new design" layout: HTML arranging the island slots (e.g. hero + toolbar + results). It is
   * rendered natively by <motu-archipelago name="id"> in the standalone app, and swapped in as a
   * whole region when previewing inside the legacy app. Shared so both stay in lock-step.
   */
  layout?: string;
}

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

/**
 * Registers an archipelago. Each island becomes mountable by slot, all sharing one store and host.
 * Returns the store so a composition root can seed or observe it.
 */
export function defineArchipelago(config: ArchipelagoConfig, opts: ArchipelagoOptions = {}): Store {
  const store = new Store(opts.seed);
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
        el[prop] = store.get(key);
      }
    };
    apply();
    unsub = store.subscribe(apply);
  }

  if (spec.on) {
    for (const [eventName, handler] of Object.entries(spec.on)) {
      el.addEventListener(eventName, (e) => {
        const detail = (e as CustomEvent).detail;
        // Tag any store write the handler makes with this island, so the overlay's coupling view can
        // attribute writers (reads are already declarative via spec.bind).
        if (DEBUG) runWithWriteSource(slot, () => handler(detail, { store, host }));
        else handler(detail, { store, host });
      });
    }
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
