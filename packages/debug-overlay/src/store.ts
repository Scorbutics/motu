// What the lens has OBSERVED, and the questions answered from it.
//
// One module-level store, subscribed to the framework's seams once and read by both surfaces the lens
// draws: the React panel and the imperative page layer (outlines + the coupling graph). They used to
// be private fields on one class, which is why every derivation was a method on the same object that
// also built DOM.
//
// READ-ONLY, like the rest of the lens: it observes the mount registry, the shared stores, the
// channel list and the call logs, and never writes a store, fires a channel or forces a render.
//
// COALESCED. A store write, a channel firing and a host call can all land in the same frame, and the
// panel used to be rebuilt from scratch on each of them. Listeners are notified once per animation
// frame instead — which is what the old `#panelDirty` flag plus the rAF loop were doing by hand, kept
// because the reason for it has not changed.

import {
  getMountedIslands,
  getChannels,
  getIslandDefinition,
  getArchipelagoStore,
  archipelagoConfigs,
  observeStoreWrites,
  observeHostIntents,
  subscribeMounts,
  subscribeChannels,
  subscribeHostCalls,
  subscribeUnattributedWrites,
  hostCalls,
  type MountedIslandInfo,
  type ChannelInfo,
  type HostIntent,
  type Store,
} from '@motu/core';
import { observeCalls, type CallEvent } from '@motu/runtime';
import { CALL_BUFFER, bindKeys, computeProps, safeKey, type CallRecord } from './model';

/**
 * What outlives a session, by key. Read by the shell (is the lens open?) and written by the panel
 * (minimize, the coupling graph) — one home, so the two halves cannot disagree about a name.
 */
export const FLAG = {
  open: 'motu:debug',
  minimized: 'motu:debug:min',
  coupling: 'motu:debug:coupling',
} as const;

export function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === 'on';
  } catch {
    return false;
  }
}

export function writeFlag(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? 'on' : 'off');
  } catch {
    // Storage may be unavailable; the flag just won't outlive the session.
  }
}

/** How a store key has moved: how often, when, and who did it last. */
export interface KeyMove {
  n: number;
  at: number;
  by: string;
}

/** A declared source, as the archipelago spells it. */
export interface DeclaredSource {
  module?: string;
  produces?: readonly string[];
}

class LensStore {
  // --- observed ---------------------------------------------------------------------------------
  calls: CallRecord[] = [];
  intents: HostIntent[] = [];
  writes = new Map<Store, Map<string, Set<string>>>();
  moves = new Map<Store, Map<string, KeyMove>>();

  // --- the lens' own state, which the panel and the page layer both read -------------------------
  selected: MountedIslandInfo | null = null;
  hovered: MountedIslandInfo | null = null;
  showCoupling = false;
  /**
   * Collapsed to its title bar. The panel is the heavy part (five sections, a live call log); the
   * page-wide lenses on the header — the coupling graph, the picker, the recorder — are not.
   * Minimize keeps those running with the outlines and wires, so the graph survives losing the
   * reading pane.
   */
  minimized = false;
  /** Mid-drag. The panel's own head draws the cursor from it. */
  dragging = false;
  recording = false;
  recStatus = '';
  picking = false;

  #listeners = new Set<() => void>();
  #version = 0;
  #queued = false;
  #started = false;

  /**
   * Attach to the framework's seams. Idempotent and called once, from the overlay's constructor —
   * before that the store is inert, so importing this module costs nothing on a page with no lens.
   */
  start(): void {
    if (this.#started) return;
    this.#started = true;

    subscribeMounts(() => {
      // A selection whose island has unmounted is a selection of nothing; drop it rather than let
      // the detail view render an island that is no longer on the page.
      if (this.selected && !getMountedIslands().includes(this.selected)) this.selected = null;
      this.changed();
    });
    observeCalls((e) => this.#onCall(e));
    observeHostIntents((i) => {
      this.intents.unshift(i);
      if (this.intents.length > CALL_BUFFER) this.intents.length = CALL_BUFFER;
      this.changed();
    });
    subscribeChannels(() => this.changed());
    // A stub's fetch resolves AFTER the lens has drawn — an island's data arrives a tick or two into
    // the mount — so without this the provenance rows are empty until something else redraws them.
    subscribeHostCalls(() => this.changed());
    // A foreign store contradicting a declaration is the one finding that arrives without any motu
    // write to observe — nothing else here would notice it.
    subscribeUnattributedWrites(() => this.changed());
    observeStoreWrites((w) => {
      let byKey = this.writes.get(w.store);
      if (!byKey) this.writes.set(w.store, (byKey = new Map()));
      let writers = byKey.get(w.key);
      if (!writers) byKey.set(w.key, (writers = new Set()));
      if (w.source) writers.add(w.source);
      let moves = this.moves.get(w.store);
      if (!moves) this.moves.set(w.store, (moves = new Map()));
      const prev = moves.get(w.key);
      moves.set(w.key, { n: (prev?.n ?? 0) + 1, at: w.at ?? Date.now(), by: w.source ?? 'host' });
      this.changed();
    });
  }

  // --- the external-store contract React reads ---------------------------------------------------

  subscribe = (fn: () => void): (() => void) => {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  };

  /**
   * A VERSION NUMBER, not a snapshot object.
   *
   * `useSyncExternalStore` requires a getSnapshot that is stable between changes, and the things
   * being observed here are live Maps and a mutating array — building an immutable copy of all of it
   * on every store write, whether or not the panel is open, would cost more than the render it
   * exists to trigger. A monotonic counter satisfies the contract exactly, and the panel reads the
   * live fields, which is the same thing the imperative version did.
   */
  getSnapshot = (): number => this.#version;

  /** Something moved. Listeners are told once per frame, however many times this is called. */
  changed(): void {
    this.#version++;
    if (this.#queued || typeof requestAnimationFrame === 'undefined') return;
    this.#queued = true;
    requestAnimationFrame(() => {
      this.#queued = false;
      for (const fn of this.#listeners) fn();
    });
  }

  /** A change the caller needs on screen NOW — a click on a control in the panel itself. */
  changedNow(): void {
    this.#version++;
    for (const fn of this.#listeners) fn();
  }

  #onCall(e: CallEvent): void {
    const existing = this.calls.find((c) => c.id === e.id);
    if (existing) {
      existing.phase = e.phase;
      existing.status = e.status ?? existing.status;
      existing.durationMs = e.durationMs ?? existing.durationMs;
      existing.error = e.error ?? existing.error;
    } else {
      this.calls.unshift({
        id: e.id,
        service: e.service,
        method: e.method,
        argsKey: safeKey(e.args),
        island: e.island,
        phase: e.phase,
        status: e.status,
        durationMs: e.durationMs,
        error: e.error,
      });
      if (this.calls.length > CALL_BUFFER) this.calls.length = CALL_BUFFER;
    }
    this.changed();
  }

  // --- scope ------------------------------------------------------------------------------------

  /**
   * The stores of the archipelago region(s) currently in the DOM. All archipelagos are defined up
   * front (their channels/stores live for the whole session), but a switcher shows one region at a
   * time — so the archipelago-level views scope to these to reset when the on-screen region changes.
   */
  activeStores(): Set<Store> {
    const stores = new Set<Store>();
    for (const region of document.querySelectorAll('motu-archipelago')) {
      const store = getArchipelagoStore(region.getAttribute('name') ?? '');
      if (store) stores.add(store);
    }
    // AND the stores of the islands actually on screen. The element route puts a <motu-archipelago>
    // in the DOM; the React route (`mountReactLagoon`, and any host page using <Island>) does not —
    // so on every React-mounted region this returned nothing and INPUT read "No channels installed"
    // over a channel that had fired 44 times. Mounted islands are the definition that holds either
    // way, and the declared-sources rows are what made the contradiction visible.
    for (const info of getMountedIslands()) stores.add(info.store);
    return stores;
  }

  /** The element tags of the islands currently mounted — scopes the observed call log to the region. */
  activeIslandTags(): Set<string> {
    return new Set(getMountedIslands().map((i) => i.element));
  }

  slotIndex(): Map<string, MountedIslandInfo> {
    const m = new Map<string, MountedIslandInfo>();
    for (const i of getMountedIslands()) m.set(i.slot, i);
    return m;
  }

  // --- per island -------------------------------------------------------------------------------

  islandWrites(info: MountedIslandInfo): string[] {
    const byKey = this.writes.get(info.store);
    if (!byKey) return [];
    const out: string[] = [];
    for (const [key, slots] of byKey) if (slots.has(info.slot)) out.push(key);
    return out;
  }

  islandCalls(info: MountedIslandInfo): CallRecord[] {
    return this.calls.filter((c) => c.island === info.element);
  }

  inboundChannels(info: MountedIslandInfo): ChannelInfo[] {
    const reads = new Set(bindKeys(info));
    return getChannels().filter((c) => c.store === info.store && [...c.keys].some((k) => reads.has(k)));
  }

  /** Islands whose observed writes feed a key this island reads (this island depends on them). */
  upstream(info: MountedIslandInfo): { key: string; islands: MountedIslandInfo[] }[] {
    const byKey = this.writes.get(info.store);
    if (!byKey) return [];
    const bySlot = this.slotIndex();
    const res: { key: string; islands: MountedIslandInfo[] }[] = [];
    for (const key of bindKeys(info)) {
      const slots = byKey.get(key);
      if (!slots) continue;
      const islands = [...slots]
        .filter((s) => s !== info.slot)
        .map((s) => bySlot.get(s))
        .filter((x): x is MountedIslandInfo => !!x);
      if (islands.length) res.push({ key, islands });
    }
    return res;
  }

  /** Islands that read a key this island has written (they depend on this island). */
  downstream(info: MountedIslandInfo): { key: string; islands: MountedIslandInfo[] }[] {
    const res: { key: string; islands: MountedIslandInfo[] }[] = [];
    for (const key of this.islandWrites(info)) {
      const islands = getMountedIslands().filter(
        (i) => i.store === info.store && i !== info && bindKeys(i).includes(key),
      );
      if (islands.length) res.push({ key, islands });
    }
    return res;
  }

  /**
   * Other islands reading a key this island also reads — a shared input source, visible even before
   * any write is observed. Keys already shown as a dependency are omitted to avoid repetition.
   */
  coReaders(info: MountedIslandInfo): { key: string; islands: MountedIslandInfo[] }[] {
    const upKeys = new Set(this.upstream(info).map((u) => u.key));
    const res: { key: string; islands: MountedIslandInfo[] }[] = [];
    for (const key of bindKeys(info)) {
      if (upKeys.has(key)) continue;
      const islands = getMountedIslands().filter(
        (i) => i.store === info.store && i !== info && bindKeys(i).includes(key),
      );
      if (islands.length) res.push({ key, islands });
    }
    return res;
  }

  /**
   * A short integration-risk phrase for an island: inputs that haven't arrived and channels feeding
   * it that have never fired — exactly what works in the lagoon but silently breaks in the ocean.
   */
  externalRisk(info: MountedIslandInfo): string | null {
    const def = getIslandDefinition(info.element);
    const rows = computeProps(info, def);
    const awaiting = rows.filter((r) => r.state === 'bound-empty').length;
    const dead = this.inboundChannels(info).filter((c) => c.fireCount === 0).length;
    const hostScope = def?.coupling?.hostScope?.length ?? 0;
    const parts: string[] = [];
    if (awaiting) parts.push(`${awaiting} input${awaiting > 1 ? 's' : ''} awaiting`);
    if (dead) parts.push(`${dead} channel${dead > 1 ? 's' : ''} never fired`);
    if (hostScope) parts.push(`${hostScope} host-scope dep${hostScope > 1 ? 's' : ''}`);
    return parts.length ? parts.join(' · ') : null;
  }

  // --- per key ----------------------------------------------------------------------------------

  /**
   * Where a store key's value comes from — the motu BOUNDARY question. `channel`/`host` mean it is
   * fed from OUTSIDE the archipelago (the ocean, via a channel or the provide() seam); `islands` are
   * sibling islands inside. External origins are the ones the lagoon stubs, so they are the
   * integration risk: if they don't arrive embedded, the island silently runs on defaults.
   */
  keyWriters(store: Store, key: string): { channel: boolean; host: boolean; islands: string[] } {
    let channel = false;
    let host = false;
    for (const c of getChannels()) {
      if (c.store === store && c.keys.has(key)) {
        channel = true;
        break;
      }
    }
    const islands: string[] = [];
    const writers = this.writes.get(store)?.get(key);
    if (writers) for (const s of writers) (s === 'host' ? (host = true) : islands.push(s));
    return { channel, host, islands };
  }

  /** The declared source that produces a key, if the region names one. */
  sourceOf(store: Store, key: string): { name: string; module?: string } | null {
    for (const [name, source] of this.sourcesFor(store)) {
      if ((source.produces ?? []).includes(key)) return { name, module: source.module };
    }
    return null;
  }

  /** The `sources` the archipelago behind this store declares. */
  sourcesFor(store: Store): [string, DeclaredSource][] {
    const config = archipelagoConfigs().find((c) => getArchipelagoStore(c.id) === store);
    return Object.entries((config?.sources ?? {}) as Record<string, DeclaredSource>);
  }

  /** The store keys any mounted island binds (reads), per store — a channel's "sink side". */
  storeReaders(store: Store): Set<string> {
    const keys = new Set<string>();
    for (const info of getMountedIslands()) {
      if (info.store !== store) continue;
      for (const k of bindKeys(info)) keys.add(k);
    }
    return keys;
  }

  /** The mounted islands that read a key this channel writes — what it "links to". Same store only. */
  channelReaders(ch: ChannelInfo): MountedIslandInfo[] {
    return getMountedIslands().filter(
      (info) => info.store === ch.store && bindKeys(info).some((k) => ch.keys.has(k)),
    );
  }

  // --- the graph --------------------------------------------------------------------------------

  /**
   * store -> (store key -> islands that read or write it). Reads come from spec.bind (declarative),
   * writes from the attributed write-log; together they are the keys' "touchers".
   */
  couplingByStore(): Map<Store, Map<string, Set<MountedIslandInfo>>> {
    const islands = getMountedIslands();
    const bySlot = new Map<string, MountedIslandInfo>();
    for (const i of islands) bySlot.set(i.slot, i);
    const result = new Map<Store, Map<string, Set<MountedIslandInfo>>>();
    const add = (store: Store, key: string, info: MountedIslandInfo) => {
      let m = result.get(store);
      if (!m) result.set(store, (m = new Map()));
      let s = m.get(key);
      if (!s) m.set(key, (s = new Set()));
      s.add(info);
    };
    for (const info of islands) {
      for (const key of bindKeys(info)) add(info.store, key, info);
    }
    for (const [store, byKey] of this.writes) {
      for (const [key, slots] of byKey) {
        for (const slot of slots) {
          const info = bySlot.get(slot);
          if (info) add(store, key, info);
        }
      }
    }
    return result;
  }

  /** Islands in any shared-key coupling — their outlines light up while the graph is on. */
  coupledIslands(): Set<MountedIslandInfo> {
    const out = new Set<MountedIslandInfo>();
    // An island the requests graph wires up needs its outline too, or the spoke ends in blank page.
    const byTag = new Map(getMountedIslands().map((i) => [i.element, i]));
    for (const c of hostCalls()) {
      const info = c.island ? byTag.get(c.island) : undefined;
      if (info) out.add(info);
    }
    for (const c of this.calls) {
      const info = c.island ? byTag.get(c.island) : undefined;
      if (info) out.add(info);
    }
    for (const [, byKey] of this.couplingByStore()) {
      for (const islands of byKey.values()) {
        if (islands.size >= 2) for (const i of islands) out.add(i);
      }
    }
    return out;
  }
}

/** The one store. Inert until `start()`, which the overlay calls when it mounts. */
export const lens = new LensStore();
