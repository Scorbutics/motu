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
import { Component, createElement, Fragment, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { lagoonHarness } from './lagoon-harness';
import {
  applyOutput,
  getArchipelagoStore,
  getChannels,
  getMountedIslands,
  provideToArchipelago,
  seedArchipelago,
  hostCalls,
  outboundCalls,
  islandOutputs,
  resetIslandOutputs,
  runWithWriteSource,
  ensureMountpointStyle,
  slotNameOf,
  slotShows,
  type ArchipelagoConfig,
  type Channel,
  type HostBridge,
  type MotuFit,
} from '@motu/core';
import type { DeclaredChannel } from '@motu/core';
import { ArchipelagoProvider, Island, useRegion } from './react-island';
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
  view?: 'region' | 'mountpoints' | 'page';
  /** EXPERIMENTAL — the application's own page module, for `view: 'page'`. See `RegionOverrides.page`. */
  page?: () => ReactNode;
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
      /** Rebuild the tree. Absent on a mount path whose teardown the harness drives through the DOM. */
      remount?: () => void;
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
      /**
       * EVERY outbound ask, whichever door it left by — a traced host module, a contract call, a wire
       * reach. `hostCalls` is one of the three and stays for the lens, which reads a module's calls.
       */
      outbound: () => { via: 'host-module' | 'contract' | 'wire'; name: string; args: string; owner: string; at: number }[];
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
 * A page that throws must FAIL VISIBLY, not blank the lagoon.
 *
 * This view exists to catch a page that crashes on load — the one failure no other check here can
 * see. Without a boundary React unmounts the whole tree on a render error, which is a white screen
 * that looks exactly like a page still loading; the check driving this view would then have to
 * distinguish "crashed" from "slow" by guessing. The marker below is what it reads instead.
 */
class PageErrorBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state: { err: Error | null } = { err: null };
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div data-motu-page="crashed" style={{ padding: 16, font: '13px/1.5 ui-monospace, monospace' }}>
        <strong>This page threw while rendering.</strong>
        <pre style={{ whiteSpace: 'pre-wrap' }}>{String(this.state.err?.stack ?? this.state.err)}</pre>
      </div>
    );
  }
}

/**
 * The region as the APPLICATION composes it: its `root`, with an island in every prop the archipelago
 * maps and the declared component in every host-filled one.
 *
 * The lagoon writes no JSX of its own here — that is the whole point. `props` supplies DATA for a host
 * slot (its component's props), never a node, so nothing the lagoon shows can be arrangement nobody
 * ships.
 */
function RegionRoot({
  config,
  islandNode,
  hostProps,
}: {
  config: ArchipelagoConfig;
  islandNode: (slot: string) => ReactNode;
  hostProps: Record<string, unknown> | undefined;
}): ReactNode {
  // THE LIVE REGION, not the seed it started with. `when`/`unless` was read once at mount against the
  // initial seed, so a slot the seed hid stayed hidden for the rest of the session — and a FLOW is
  // exactly the thing that changes that state afterwards. Every login flow that signs in failed with
  // "no island mounted under slot login-form", because the region had moved and the arrangement had
  // not. A component, so it re-renders with the store like everything else here does.
  const region = useRegion<Record<string, unknown>>();
  return renderRegionRoot(config, islandNode, hostProps, region as Record<string, unknown>) ?? null;
}

function renderRegionRoot(
  config: ArchipelagoConfig,
  islandNode: (slot: string) => ReactNode,
  hostProps: Record<string, unknown> | undefined,
  state: Record<string, unknown> | undefined,
): ReactNode | undefined {
  const declared = config as {
    root?: unknown;
    slots?: Record<string, string | { slot: string; when?: string; unless?: string }>;
    hostSlots?: Record<string, unknown>;
  };
  if (!declared.root) return undefined;
  const composed: Record<string, unknown> = {};
  // A DECLARED SLOT IS NOT ALWAYS SHOWN. Two islands can be alternatives in one position, and the page
  // says so by passing null for the one that does not apply. Mounting both here previewed a login
  // screen carrying an expired-link banner AND a sign-in form at once — a state the application cannot
  // produce, which is exactly the kind of thing a preview exists to not invent.
  for (const [prop, entry] of Object.entries(declared.slots ?? {})) {
    composed[prop] = slotShows(entry, state ?? {}) ? islandNode(slotNameOf(entry)) : null;
  }
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
      // KEYED, like the branch above. This one returned the node bare, so the region view rendered an
      // ARRAY of elements without keys and React logged "missing key prop" against
      // `ArchipelagoProvider` — motu's own component, on motu's own render path, in every region view.
      // Seen by two independent cold-start agents on two applications; one chased it and could not
      // reproduce it by navigating to the same state by hand, because the warning fires once per
      // mount and the console had been cleared by then.
      <Fragment key={island.slot}>{islandNode(island.slot)}</Fragment>
    ),
  );

  // THE PAGE VIEW RENDERS THE APPLICATION, not the region. Deliberately outside the provider below:
  // the page composes its OWN region (`createRegion` … `<X.Region>`), so wrapping it in a second
  // ArchipelagoProvider would seed a store the page never reads and hide the very thing this view
  // exists to show. Providers, channels and the wire are already installed for every view, so what
  // renders here is the page with its environment and its data answered, and nothing else supplied.
  if (opts.view === 'page') {
    const root = createRoot(mountEl);
    roots.set(mountEl, root);
    root.render(
      opts.page ? (
        <PageErrorBoundary>{opts.providers ? opts.providers(opts.page(), '') : opts.page()}</PageErrorBoundary>
      ) : (
        <div className="motu-empty" data-motu-page="absent">
          This region declares no <code>page</code>, so there is nothing to render here. Add{' '}
          <code>page: () =&gt; &lt;YourPage /&gt;</code> to its lagoon overrides.
        </div>
      ),
    );
    return;
  }

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
        ((config as { root?: unknown }).root ? (
          <RegionRoot config={config} islandNode={islandNode} hostProps={opts.hostProps} />
        ) : (
          renderArchipelagoLayout(config.layout, islandNode) ?? islands
        ))
      )}
    </ArchipelagoProvider>
  );

  let root = createRoot(mountEl);
  roots.set(mountEl, root);
  root.render(tree);

  window.__motuLagoon = {
    // EVERY CAPABILITY THAT IS NOT ABOUT TEARDOWN lives in `lagoonHarness`, shared with the custom-
    // element mount. It sat here for years, which quietly made region FLOWS a React-only feature — see
    // that module for what it cost.
    ...lagoonHarness(config, { seed: opts.seed, host: opts.host }),
    //  - remount: tear the tree down and build a fresh one. Cloning the DOM node — what the element
    //    path does — only detaches React's tree here and would compare a live render against an empty
    //    div. Modules are not reloaded, which is the point: state that survives a remount is the leak
    //    the check is looking for.
    remount: () => {
      root.unmount();
      root = createRoot(mountEl);
      roots.set(mountEl, root);
      root.render(tree);
    },
  };
}
