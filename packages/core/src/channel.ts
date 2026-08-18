// A channel is the inbound counterpart to the HostBridge: it observes a host signal (an HTTP call,
// a scope value, a DOM event) and carries it into the archipelago store, which islands react to via
// `bind`. Channels live at the composition root and keep islands mode-agnostic — the "seam" between
// the legacy host and the motu islands, in Feathers' sense: a place to inject behaviour without
// editing the host in place.

import type { Store } from './store.js';
import { recordSeedWrite } from './store.js';

// Stripped in production (see the debug overlay). Only in debug builds is each channel handed an
// instrumented store, so its writes are tracked; the typeof guard keeps it safe under bare Node/tsc.
declare const __MOTU_DEBUG__: boolean;
const DEBUG = typeof __MOTU_DEBUG__ !== 'undefined' && __MOTU_DEBUG__;

export interface ChannelContext {
  store: Store;
}

/** Observe a host signal, write the store. Returns an optional disposer. */
export type Channel = (ctx: ChannelContext) => (() => void) | void;

// --- Dev-only channel registry (debug overlay) ---------------------------------------------------
// Channels are anonymous functions with no identity, so the overlay cannot see them directly. In debug
// builds we hand each channel a Proxy over its store that tags every write with the channel, giving us
// "fired / never fired", the last payload + when, and a write count — with no change to any channel.

/** One channel as the overlay sees it. */
export interface ChannelInfo {
  id: number;
  /** Position in the archipelago's channels array. */
  index: number;
  /** Optional author-supplied label (a `channelName` property on the channel function). */
  name?: string;
  /** The store it writes to — identity-compared with an island's store to group by archipelago. */
  store: Store;
  /** Store keys it has written (its "connected" sink side). */
  keys: Set<string>;
  fireCount: number;
  lastKey?: string;
  lastValue?: unknown;
  lastAt?: number;
}

const channelRegistry = new Set<ChannelInfo>();
const channelListeners = new Set<() => void>();
let channelSeq = 0;

/** Every installed channel's live info (debug only; empty in production). */
export function getChannels(): ChannelInfo[] {
  return [...channelRegistry];
}

/** Notified whenever a channel is installed or fires (debug only). Returns an unsubscribe. */
export function subscribeChannels(cb: () => void): () => void {
  channelListeners.add(cb);
  return () => channelListeners.delete(cb);
}

function notifyChannels(): void {
  channelListeners.forEach((l) => l());
}

// A Proxy over the real store (so it stays a genuine Store) that records each write against the
// channel before delegating. Only `set` is intercepted; get/subscribe pass straight through.
function instrumentStore(store: Store, info: ChannelInfo): Store {
  return new Proxy(store, {
    get(target, prop, receiver) {
      if (prop === 'set') {
        return (key: string, value: unknown) => {
          info.keys.add(key);
          info.fireCount++;
          info.lastKey = key;
          info.lastValue = value;
          info.lastAt = Date.now();
          notifyChannels();
          recordSeedWrite(key, value, 'channel'); // capture host-fed value for lagoon seed
          target.set(key, value);
        };
      }
      const v = Reflect.get(target, prop, receiver);
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
}

/** Connects channels to a store (usable on its own for a lone island, or via defineArchipelago). */
export function installChannels(store: Store, channels: Channel[]): () => void {
  const disposers: Array<() => void> = [];
  channels.forEach((channel, index) => {
    let ctxStore = store;
    if (DEBUG) {
      const info: ChannelInfo = {
        id: ++channelSeq,
        index,
        name: (channel as { channelName?: string }).channelName,
        store,
        keys: new Set(),
        fireCount: 0,
      };
      channelRegistry.add(info);
      ctxStore = instrumentStore(store, info);
      notifyChannels();
    }
    const dispose = channel({ store: ctxStore });
    if (dispose) disposers.push(dispose);
  });
  return () => {
    for (const d of disposers) d();
    disposers.length = 0;
  };
}
