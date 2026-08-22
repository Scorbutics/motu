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
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  applyOutput,
  getArchipelagoStore,
  getChannels,
  getMountedIslands,
  provideToArchipelago,
  seedArchipelago,
  hostCalls,
  runWithWriteSource,
  type ArchipelagoConfig,
  type Channel,
  type HostBridge,
  type MotuFit,
} from '@motu/core';
import type { DeclaredChannel } from '@motu/core';
import { ArchipelagoProvider, Island } from './react-island.js';
import { renderArchipelagoLayout } from './archipelago-layout.js';
import type { ElementSpec } from './bootstrap.js';

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
      /** Fire one of an island's DECLARED outputs, as if the component had. */
      emit: (slot: string, event: string, detail: unknown) => boolean;
      /** Host modules the islands actually called, for provenance (see `traced`). */
      hostCalls: () => { module: string; fn: string; args: unknown[]; returned?: number }[];
      /** Read a region key, for a check that needs to know whether it moved. */
      read: (key: string) => unknown;
      archipelago: string;
    };
  }
}

/** Render every slot of `config` into `mountEl`, in one React tree. */
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
    const el = <Island key={slot} slot={slot} fit={opts.fit} />;
    return opts.providers ? opts.providers(el, slot) : el;
  };

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
        // Preference order, most faithful first: the APP's own layout component (one arrangement,
        // shared with the page), then the archipelago's `layout` template (an ocean, whose legacy page
        // cannot hand React anything), then declared order.
        (opts.layout?.(islandNode) ?? renderArchipelagoLayout(config.layout, islandNode) ?? islands)
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
  };
}
