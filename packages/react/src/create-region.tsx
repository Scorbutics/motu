'use client';
// One binding per region, so the host stops repeating itself in strings.
//
// Everything a page did with motu used to be a bare string or a repeated type argument: the slot in
// `<Island slot="week-actions">` (a typo warned at runtime, if you were watching the console), the
// region type at every `useRegion<ActionsRegion>()`, the archipelago id and the key in every
// `seedArchipelago(actionsArchipelago.id, 'weekMissions', m)`. None of that is the page's business to
// get right by hand — it is all already declared, once, in the archipelago.
//
// `createRegion` binds the config to its environment ONCE, at the composition root, and hands back the
// four things a host actually uses, each typed from that config. What it does NOT do is merge the two:
// the archipelago still declares the wiring, the root still chooses the transport and the host bridge.
// That split is what lets the lagoon mount the same region against mocks — so it stays.
import { createElement, type ReactElement, type ReactNode } from 'react';
import { configure, type Transport } from '@motu/runtime';
import {
  provideToArchipelago,
  seedArchipelago,
  type AnyArchipelagoConfig,
  type Channel,
  type HostBridge,
  type MotuFit,
  slotNameOf,
  type RegionOf,
  type SlotsOf,
} from '@motu/core';
import { ArchipelagoProvider, Island, useRegion as useRegionSnapshot } from './react-island';
import type { ElementSpec } from './bootstrap';

export interface CreateRegionOptions {
  /** The project's element registry — the same one the lagoon uses. */
  elements: ElementSpec[];
  /**
   * How contract calls leave. Applied once, at the composition root: choosing it is the host's
   * decision and nothing else's business (the lagoon makes the opposite one for the same islands).
   */
  transport?: Transport;
  /**
   * The outward seam, as a HOOK — a React host usually needs one (`nextHostBridge(useRouter())`), and
   * the binding is created at module scope where hooks cannot run.
   */
  useHost?: () => HostBridge;
  /** Initial store contents, so bound islands render meaningfully on first paint. */
  seed?: Record<string, unknown>;
  /** Inbound channels: host signals mirrored into the store. */
  channels?: Channel[];
}

export interface RegionBinding<TRegion, TSlot extends string, TRootProps = Record<string, unknown>> {
  /** Wraps the host's tree: declares the archipelago and puts its store in context. */
  Region: (props: { children?: ReactNode }) => ReactElement;
  /**
   * THE REGION, COMPOSED — the archipelago's `root` rendered with its declared props filled.
   *
   * The host passes the app's own prop names and never a slot: a prop the archipelago maps in `slots`
   * is wrapped in that island automatically, a prop in `hostSlots` is rendered by the component named
   * there with the props given here, and anything else is passed straight through. So the prop -> slot
   * mapping exists ONCE, in the archipelago, and neither the page nor the lagoon can compose the
   * region differently from the other.
   *
   * It does NOT wrap `<X.Region>`. A page that reads the region to build those props — which is the
   * normal shape, since the islands' own outputs are what it reads — has to be under the provider
   * already, and a component cannot sit inside a provider it renders itself. `integrate check` is
   * what makes sure the wrapping happened.
   */
  Root: (props: TRootProps) => ReactElement;
  /** `<Island slot>` for THIS region — the slot is checked against the ones it declares. */
  Island: (props: {
    slot: TSlot;
    children?: ReactNode;
    props?: Record<string, unknown>;
    className?: string;
    fit?: MotuFit;
  }) => ReactElement;
  /** The region as a typed object. Destructure it; do not put it in a dependency list. */
  useRegion: () => Partial<TRegion>;
  /** Establish a key's starting value — the only legitimate way to touch a key an island produces. */
  seed: <K extends keyof TRegion & string>(key: K, value: TRegion[K]) => void;
  /** Feed a key the region declares as host-owned. */
  provide: <K extends keyof TRegion & string>(key: K, value: TRegion[K]) => void;
  /** The archipelago's id, for the rare call that still needs it. */
  id: string;
}

/** The props `<X.Root>` takes: island slots as nodes, host slots as their component's props. */
export type RootPropsOf<C> = (C extends { slots?: infer S } ? { [K in keyof S]?: ReactNode } : object) &
  (C extends { hostSlots?: infer H } ? { [K in keyof H]?: H[K] extends (p: infer P) => unknown ? P : Record<string, unknown> } : object) &
  Record<string, unknown>;

/**
 * Bind an archipelago to the environment it runs in, and derive the host's surface from it.
 *
 * The region type is recovered from the config's brand (see `archipelago()`), so it is never named
 * twice — and the slot union comes from the config's own declarations, so a typo is a build error
 * instead of a console warning nobody reads.
 */
export function createRegion<C extends AnyArchipelagoConfig>(
  config: C,
  opts: CreateRegionOptions,
): RegionBinding<RegionOf<C>, SlotsOf<C>, RootPropsOf<C>> {
  // Module scope on purpose: a transport is a property of this composition root, not of a render.
  if (opts.transport) configure(opts.transport);

  // Fixed for the life of the binding, so this is one unconditional hook call, not a conditional one.
  const useHost: () => HostBridge | undefined = opts.useHost ?? (() => undefined);

  function Region({ children }: { children?: ReactNode }): ReactElement {
    const host = useHost();
    return createElement(
      ArchipelagoProvider,
      { config, elements: opts.elements, host, seed: opts.seed, channels: opts.channels },
      children,
    );
  }

  /**
   * Compose the root. Every prop is decided by the ARCHIPELAGO, never by the caller:
   *   - named in `slots`      -> wrapped in that island, so the page never writes a slot string;
   *   - named in `hostSlots`  -> rendered by the declared component with the props given here;
   *   - anything else         -> passed through (data the root takes directly).
   */
  function Root(props: Record<string, unknown>): ReactElement {
    // `C` is generic, so its optional members are not visible on the parameter's type; the CONFIG
    // interface is where they are declared, and this is the one place that has to read them.
    const declared = config as AnyArchipelagoConfig;
    // The page decides exclusivity ITSELF, by passing a node or null — `when`/`unless` is the lagoon's
    // way of following that decision, and is not consulted here.
    const slots = Object.fromEntries(
      Object.entries((declared.slots ?? {}) as Record<string, string | { slot: string }>).map(([p, e]) => [p, slotNameOf(e)]),
    );
    const hostSlots = (declared.hostSlots ?? {}) as Record<string, unknown>;
    if (!declared.root) {
      throw new Error(
        `motu: region "${config.id}" has no \`root\` — declare the application's own component as ` +
          `\`root\` in the archipelago, or compose the page yourself with <${config.id}.Island>.`,
      );
    }
    const composed: Record<string, unknown> = {};
    for (const [prop, value] of Object.entries(props)) {
      const slot = slots[prop];
      if (slot) {
        // NULL MEANS ABSENT, and this is the main path rather than an edge case: peps' actions page
        // decides five of its seven optional slots with a condition, and the false branch is `null`.
        //
        // Mounting the island anyway would not render nothing — an `<Island>` with no child renders
        // the registered component from the store, so `challenges={null}` would put the challenges
        // panel on screen at exactly the moment the page said not to. The wrapper only exists to hold
        // a child; with no child there is nothing to wrap.
        composed[prop] = value == null ? null : createElement(Island as never, { slot, key: slot } as never, value as ReactNode);
        continue;
      }
      const Component = hostSlots[prop];
      if (Component) {
        composed[prop] = value == null ? null : createElement(Component as never, value as never);
        continue;
      }
      composed[prop] = value;
    }
    // A declared slot the page never mentions is NOT filled in for it. The temptation is to mount it
    // anyway — the archipelago says the region has it — but that turns a forgotten prop into a
    // silently different page, which is the whole failure this design exists to remove. It is a
    // CHECK instead: `integrate check` compares the props on `<X.Root>` against the declared slots,
    // where a human can see the answer and decide. The LAGOON does the opposite and mounts every
    // declared slot, because there is no page there to have an opinion.
    return createElement(declared.root as never, composed as never);
  }

  return {
    Region,
    Root: Root as RegionBinding<RegionOf<C>, SlotsOf<C>, RootPropsOf<C>>['Root'],
    Island: Island as RegionBinding<RegionOf<C>, SlotsOf<C>, RootPropsOf<C>>['Island'],
    useRegion: () => useRegionSnapshot<RegionOf<C>>(),
    seed: (key, value) => seedArchipelago(config.id, key, value),
    provide: (key, value) => provideToArchipelago(config.id, key, value),
    id: config.id,
  };
}
