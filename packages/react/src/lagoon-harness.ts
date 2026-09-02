// The verify harness's handle on a mounted region — the part that does not care HOW it was mounted.
//
// This lived inside `mountReactLagoon`, which made every capability it exposes a property of the REACT
// mount path by accident rather than by design. The cost showed up the day demo-app — the ocean case,
// `mount: 'element'`, the original motu shape — got its first region flows: every step failed with
// "no emit seam on this mount path", and the region whose islands are the only ones in this repository
// that fetch through the CONTRACT was the one that could not have a flow.
//
// Nothing here is React's. `emit` needs the archipelago's config, its store and the mounted-island
// registry; all three are core's and the custom element fills them exactly as the React tree does
// (`mountIsland` registers, `applyOutput` applies). What genuinely differs is TEARDOWN — React needs
// its root unmounted, the element path re-inserts the marker — so `remount` stays with each mount and
// is optional here.
import {
  applyOutput,
  getArchipelagoStore,
  getChannels,
  getMountedIslands,
  hostCalls,
  outboundCalls,
  islandOutputs,
  resetIslandOutputs,
  provideToArchipelago,
  runWithWriteSource,
  seedArchipelago,
} from '@motu/core';
import type { ArchipelagoConfig, HostBridge } from '@motu/core';

/** Everything the harness can do to a region without knowing which mount built it. */
export type LagoonHarness = Omit<NonNullable<Window['__motuLagoon']>, 'remount'>;

export function lagoonHarness(
  config: ArchipelagoConfig,
  opts: { seed?: Record<string, unknown>; host?: HostBridge },
): LagoonHarness {
  return {
    archipelago: config.id,
    //  - provide: feed a host value into the region (the data-flow check).
    provide: (key, value) => provideToArchipelago(config.id, key, value),
    //  - seed: ESTABLISH a value rather than update one. The wiring probe puts a produced key back the
    //    way it found it, and doing that through `provide` made the harness itself look like a host
    //    reaching into island-owned state — motu's ownership guard fired on every probed key. A
    //    rollback is not the host updating the region; it is a re-seed, so say so.
    seed: (key, value) => seedArchipelago(config.id, key, value),
    //  - hostCalls: WHERE THE INPUT CAME FROM. A stub that wraps its exports in `traced` records the
    //    calls the islands actually made, which is the one thing the lagoon otherwise hides: it
    //    replaces the host module so completely that nothing shows a fetch happened at all.
    hostCalls: () => hostCalls().map((c) => ({ ...c })) as ReturnType<LagoonHarness['hostCalls']>,
    //  - outbound: THE SAME QUESTION, ALL THREE DOORS. An island's I/O leaves through the contract,
    //    through a traced host module, or through the wire beneath the app's own client, and each used
    //    to be observed separately — the contract's calls by nothing a check ever printed.
    outbound: () => outboundCalls().map((c) => ({ ...c })) as ReturnType<LagoonHarness['outbound']>,
    outputs: () => islandOutputs(),
    resetOutputs: () => resetIslandOutputs(),
    //  - channels: what each installed channel has actually WRITTEN. The registry tracks it already
    //    (debug builds hand every channel a store proxy that tags its writes); exposing it is what lets
    //    a check compare the region's declared `sources` against what really produced its keys.
    channels: () =>
      getChannels()
        .filter((c) => c.store === getArchipelagoStore(config.id))
        .map((c) => ({ name: c.name ?? `channel #${c.index}`, keys: [...c.keys], fired: c.fireCount })),
    read: (key) => getArchipelagoStore(config.id)?.get(key),
    held: () => {
      const store = getArchipelagoStore(config.id);
      // `has`, not a truthy value: a key deliberately set to `undefined` is established, and the
      // question here is whether anything ever fed it.
      return store ? Object.keys(config.islands.length ? store.snapshot() : {}).filter((k) => store.has(k)) : [];
    },
    //  - emit: fire an island's declared output without touching its DOM.
    //
    //    This is the only interaction primitive the harness gets, and deliberately so: it can drive
    //    what an island DECLARES, never a selector or a synthetic click. That keeps a check derivable
    //    from the archipelago (every `writes` entry can be probed) instead of hand-scripted — which is
    //    the line between a harness and a second, untyped test suite.
    emit: (slot, event, detail) => {
      const spec = config.islands.find((i) => i.slot === slot);
      const store = getArchipelagoStore(config.id);
      // MOUNTED, not merely declared: a `writes` entry for a slot this region never renders is a
      // declaration pointing at nothing, and firing it anyway would report that wire as healthy.
      const mounted = getMountedIslands().some((i) => i.slot === slot && i.store === store);
      if (!spec || !store || !mounted) return false;
      const host = opts.host ?? { navigate: () => {}, action: () => {} };
      runWithWriteSource(slot, () => applyOutput(spec, event, detail, { store, host }));
      return true;
    },
    //  - reset: forget the region, then put the PAGE's own seed back. A remount alone does NOT do this
    //    — the store is registered per archipelago id and deliberately survives one, so the tree comes
    //    back holding everything the last scenario put in it. That is right for a flow and wrong for a
    //    scenario. Kept separate from `remount` so a lane that measures pixels can reset without
    //    restarting the entrance animations a fresh mount would replay.
    reset: (keys) => {
      getArchipelagoStore(config.id)?.clear(keys);
      // BACK TO WHAT THE PAGE ESTABLISHES, not to empty. The region's own seed is applied once, when
      // the store is built — so forgetting a key the page seeded and stopping there would measure every
      // later scenario against a state the application never produces.
      for (const [key, value] of Object.entries(opts.seed ?? {})) seedArchipelago(config.id, key, value);
    },
  };
}
