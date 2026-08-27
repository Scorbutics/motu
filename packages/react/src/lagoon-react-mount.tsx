// Mounting a lagoon target the way a React host mounts it.
//
// The point of the lagoon is that what passes here is what ships. That guarantee is only worth
// anything if the two run the same way: a project whose pages render islands in their own React tree,
// verified against islands wrapped in custom elements with a root each, is verifying a mount path it
// does not use. Context, error boundaries and prop timing all differ between the two, and those are
// exactly the things that break.
//
// So the React host's lagoon renders through the same `<ArchipelagoProvider>` / `<Island>` its pages
// do. One React root for the whole lagoon — the same as a page has — not one per island.
import { createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  applyOutput,
  getArchipelagoStore,
  getChannels,
  getMountedIslands,
  provideToArchipelago,
  seedArchipelago,
  hostCalls,
  islandOutputs,
  resetIslandOutputs,
  runWithWriteSource,
  ensureMountpointStyle,
  type ArchipelagoConfig,
  type Channel,
  type HostBridge,
  type MotuFit,
} from '@motu/core';
import type { DeclaredChannel } from '@motu/core';
import { ArchipelagoProvider, Island } from './react-island';
import { renderArchipelagoLayout } from './archipelago-layout';
import type { ElementSpec } from './bootstrap';

/** One React root per container, so a re-mount replaces rather than stacks. */
const roots = new Map<HTMLElement, ReturnType<typeof createRoot>>();

export interface ReactLagoonOptions {
  elements: ElementSpec[];
  host?: HostBridge;
  seed?: Record<string, unknown>;
  channels?: DeclaredChannel[];
  fit?: MotuFit;
  /**
   * 'region' renders the archipelago as one area; 'mountpoints' frames each slot separately, standing
   * in for islands placed individually across a host page. Mirrors the custom element's `view`
   * attribute, class names included, so recorded callsite frames (`motu archipelago record-frame`)
   * apply to either mount path.
   */
  view?: 'region' | 'mountpoints';
  /**
   * The APPLICATION's own arrangement for this region, called with a renderer for each slot.
   *
   * Preferred over the archipelago's `layout` template: the template is a second copy of an
   * arrangement the host page already expresses, and it drifts. See `LagoonOverrides.layout`.
   */
  layout?: (island: (slot: string) => ReactNode) => ReactNode;
  /** Per slot: the props the page passes on the island element — see `LagoonOverrides.props`. */
  props?: Record<string, Record<string, unknown>>;
  /** Per HOST slot: the props for the component the archipelago names in `hostSlots`. Data only. */
  hostProps?: Record<string, unknown>;
  /**
   * The ENVIRONMENT the islands need, installed in EVERY view.
   *
   * `layout` is the arrangement and only the region view renders it. That distinction did not matter
   * while islands were self-contained, and broke the moment they were the application's own
   * components: Twenty's widgets read a dozen contexts (Jotai, Apollo, i18n, theme, the record
   * contexts), those providers belong to the PAGE rather than to any island, and putting them in
   * `layout` meant the mountpoints view — the one the flow checks drive — rendered islands with no
   * environment at all and reported "the region rendered nothing".
   *
   * Same rule as `channels`: anything an island cannot render without is installed everywhere, or the
   * checks see a different application than the human does.
   */
  providers?: (children: ReactNode, slot: string) => ReactNode;
}

declare global {
  interface Window {
    /** The verify harness's handle on this mount path: the `provide` seam and a real re-mount. */
    __motuLagoon?: {
      provide: (key: string, value: unknown) => void;
      /** Installed channels and the keys each has written (debug builds only). */
      channels: () => { name: string; keys: string[]; fired: number }[];
      /** Establish a value (attributed as a seed, not a host write). */
      seed: (key: string, value: unknown) => void;
      remount: () => void;
      /**
       * Forget the named keys (all of them when none are named), then re-apply the region's own seed — the state a scenario that seeds
       * nothing must see. Does NOT rebuild the tree: bound islands read the store through
       * `useSyncExternalStore`, so they re-render on the change by themselves, and a caller that also
       * wants a fresh mount can say so by calling `remount()` after this.
       *
       * For SCENARIO lanes only. A flow's steps build on each other, so resetting between them would
       * erase the journey the flow exists to describe.
       */
      reset: (keys?: readonly string[]) => void;
      /** Fire one of an island's DECLARED outputs, as if the component had. */
      emit: (slot: string, event: string, detail: unknown) => boolean;
      /** Host modules the islands actually called, for provenance (see `traced`). */
      hostCalls: () => { module: string; fn: string; args: unknown[]; returned?: number; at: number }[];
      /** Read a region key, for a check that needs to know whether it moved. */
      read: (key: string) => unknown;
      /** Which keys the region HOLDS — a declared source that was seeded rather than installed still
       *  leaves its keys with values, and that is what separates "seeded" from "dead". */
      held: () => string[];
      /** Every declared output that has FIRED, with a count.
       *
       *  `emit` and a flow's own `emit` both go through the emit seam, so a check built on them proves
       *  the region APPLIES a write — never that the component still produces it. This is the other
       *  half. Read from the OUTPUT rather than from store writes on purpose: `set` early-returns on an
       *  unchanged value, so an output whose payload agrees with the seed moves nothing and would read
       *  as never emitted. */
      outputs: () => { slot: string; event: string; n: number }[];
      /** Clear the tally — the caller then remounts and reads what RENDERING alone produced. */
      resetOutputs: () => void;
      archipelago: string;
    };
  }
}

/** Render every slot of `config` into `mountEl`, in one React tree. */

/**
 * The region as the APPLICATION composes it: its `root`, with an island in every prop the archipelago
 * maps and the declared component in every host-filled one.
 *
 * The lagoon writes no JSX of its own here — that is the whole point. `props` supplies DATA for a host
 * slot (its component's props), never a node, so nothing the lagoon shows can be arrangement nobody
 * ships.
 */
function renderRegionRoot(
  config: ArchipelagoConfig,
  islandNode: (slot: string) => ReactNode,
  hostProps: Record<string, unknown> | undefined,
): ReactNode | undefined {
  const declared = config as { root?: unknown; slots?: Record<string, string>; hostSlots?: Record<string, unknown> };
  if (!declared.root) return undefined;
  const composed: Record<string, unknown> = {};
  for (const [prop, slot] of Object.entries(declared.slots ?? {})) composed[prop] = islandNode(slot);
  for (const [prop, Component] of Object.entries(declared.hostSlots ?? {})) {
    composed[prop] = createElement(Component as never, ((hostProps ?? {})[prop] ?? {}) as never);
  }
  // Anything else the lagoon was given is a PLAIN prop of the root — the page passes one too (a
  // greeting, a required-referrals count). Without this the region rendered those holes empty and
  // looked like a page with a missing word in its header.
  for (const [prop, value] of Object.entries(hostProps ?? {})) {
    if (prop in composed) continue;
    composed[prop] = value;
  }
  return createElement(declared.root as never, composed as never);
}

export function mountReactLagoon(
  mountEl: HTMLElement | null,
  config: ArchipelagoConfig,
  opts: ReactLagoonOptions,
): void {
  if (!mountEl) {
    console.warn('motu: lagoon has no mount element');
    return;
  }
  // Switching station or view re-mounts: drop the previous root first, or React warns about two roots
  // on one container and the old tree keeps its store subscription alive.
  roots.get(mountEl)?.unmount();

  // PER ISLAND, not once around the set: some of what an island needs is per-island (Twenty's widgets
  // read a `WidgetComponentInstanceContext` keyed by widget id), and a wrapper around the whole
  // region cannot supply that. Page-wide providers repeated per island are idempotent — they are
  // context providers over module-level state — so the per-island form covers both cases.
  const islandNode = (slot: string) => {
    const el = <Island key={slot} slot={slot} fit={opts.fit} props={opts.props?.[slot]} />;
    return opts.providers ? opts.providers(el, slot) : el;
  };

  // The cell chrome for this view lives in @motu/core, and nothing else on this path would install
  // it: the element route folds it into the region's own sheet, which a React mount never builds. Get
  // it wrong and the markup below still renders — a slot name as body text, no frame, no padding —
  // which is what a host mounting through React used to see.
  if (opts.view === 'mountpoints') ensureMountpointStyle();

  const islands = config.islands.map((island) =>
    opts.view === 'mountpoints' ? (
      <section
        key={island.slot}
        className="motu-frame"
        data-motu-arch={config.id}
        data-motu-slot={island.slot}
      >
        <header className="motu-frame__label">
          <span>{island.slot}</span>
        </header>
        <div className="motu-frame__stage">{islandNode(island.slot)}</div>
      </section>
    ) : (
      islandNode(island.slot)
    ),
  );

  const tree = (
    <ArchipelagoProvider
      config={config}
      elements={opts.elements}
      host={opts.host}
      seed={opts.seed}
      channels={opts.channels}
    >
      {opts.view === 'mountpoints' ? (
        <div className="motu-gallery">{islands}</div>
      ) : (
        // Preference order, most faithful first: the archipelago's ROOT — the application's own
        // component, the same one the page renders, composed from the same `slots` — then its
        // `layout` template (an ocean, whose legacy page cannot hand React anything), then declared
        // order. There is deliberately no hand-written frame in between any more: one existed, it was
        // a second copy of the page, and every copy drifted.
        (renderRegionRoot(config, islandNode, opts.hostProps) ??
          renderArchipelagoLayout(config.layout, islandNode) ??
          islands)
      )}
    </ArchipelagoProvider>
  );

  let root = createRoot(mountEl);
  roots.set(mountEl, root);
  root.render(tree);

  // The harness drives both of these through <motu-archipelago> on the element path, which does not
  // exist here. Expose the same two capabilities so the SAME checks run against this mount path:
  //  - provide: feed a host value into the region (the data-flow check).
  //  - remount: tear the tree down and build a fresh one. Cloning the DOM node — what the element path
  //    does — only detaches React's tree here and would compare a live render against an empty div.
  //    Modules are not reloaded, which is the point: state that survives a remount is the leak the
  //    check is looking for.
  window.__motuLagoon = {
    archipelago: config.id,
    provide: (key, value) => provideToArchipelago(config.id, key, value),
    //  - seed: ESTABLISH a value rather than update one. The wiring probe puts a produced key back
    //    the way it found it, and doing that through `provide` made the harness itself look like a
    //    host reaching into island-owned state — motu's ownership guard fired on every probed key.
    //    A rollback is not the host updating the region; it is a re-seed, so say so.
    seed: (key, value) => seedArchipelago(config.id, key, value),
    //  - hostCalls: WHERE THE INPUT CAME FROM. A stub that wraps its exports in `traced` records the
    //    calls the islands actually made, which is the one thing the lagoon otherwise hides: it
    //    replaces the host module so completely that nothing shows a fetch happened at all.
    hostCalls: () => hostCalls().map((c) => ({ ...c })) as ReturnType<NonNullable<Window["__motuLagoon"]>["hostCalls"]>,
    outputs: () => islandOutputs(),
    resetOutputs: () => resetIslandOutputs(),
    //  - channels: what each installed channel has actually WRITTEN. The registry tracks it already
    //    (debug builds hand every channel a store proxy that tags its writes); exposing it is what
    //    lets a check compare the region's declared `sources` against what really produced its keys.
    //    Declared-and-silent, or writing a key no source claims, are both invisible without it.
    channels: () =>
      getChannels()
        .filter((c) => c.store === getArchipelagoStore(config.id))
        .map((c) => ({ name: c.name ?? `channel #${c.index}`, keys: [...c.keys], fired: c.fireCount })),
    //  - emit: fire an island's declared output without touching its DOM.
    //
    //    This is the only interaction primitive the harness gets, and deliberately so: it can drive
    //    what an island DECLARES, never a selector or a synthetic click. That keeps a check derivable
    //    from the archipelago (every `writes` entry can be probed) instead of hand-scripted — which is
    //    the line between a harness and a second, untyped test suite.
    read: (key) => getArchipelagoStore(config.id)?.get(key),
    held: () => {
      const store = getArchipelagoStore(config.id);
      // `has`, not a truthy value: a key deliberately set to `undefined` is established, and the
      // question here is whether anything ever fed it.
      return store ? Object.keys(config.islands.length ? store.snapshot() : {}).filter((k) => store.has(k)) : [];
    },
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
    remount: () => {
      root.unmount();
      root = createRoot(mountEl);
      roots.set(mountEl, root);
      root.render(tree);
    },
    //  - reset: forget the region, then put the PAGE's own seed back. A remount alone does NOT do
    //    this — the store is registered per archipelago id and deliberately survives one, so the tree
    //    comes back holding everything the last scenario put in it. That is right for a flow and
    //    wrong for a scenario. Kept separate from `remount` so a lane that measures pixels can reset
    //    without restarting the entrance animations a fresh mount would replay.
    reset: (keys) => {
      getArchipelagoStore(config.id)?.clear(keys);
      // BACK TO WHAT THE PAGE ESTABLISHES, not to empty. The region's own seed is applied once, when
      // the store is built (`defineArchipelago` in the provider's `useMemo`, which reuses the store by
      // id) — so forgetting a key the page seeded and stopping there would measure every later
      // scenario against a state the application never produces. Re-seeding through `seedArchipelago`
      // keeps the write attributed as a seed, so the ownership guard stays quiet about keys an island
      // produces.
      for (const [key, value] of Object.entries(opts.seed ?? {})) seedArchipelago(config.id, key, value);
    },
  };
}
