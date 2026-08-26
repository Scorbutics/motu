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

export interface RegionBinding<TRegion, TSlot extends string> {
  /** Wraps the host's tree: declares the archipelago and puts its store in context. */
  /**
   * Wraps the page and puts the region's store in context.
   *
   * `region` is the host-fed half of the region as ONE object, applied as one write before paint.
   * Without it the page feeds the region by passing props to islands, and each island publishes its
   * own slice from its own effect — so one value computed in one render reaches the store through N
   * effects, and the store can hold a combination no render produced. Typed against the region, so a
   * key an island produces is a compile error rather than a laundered write.
   */
  Region: (props: { children?: ReactNode; region?: Partial<TRegion> }) => ReactElement;
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
): RegionBinding<RegionOf<C>, SlotsOf<C>> {
  // Module scope on purpose: a transport is a property of this composition root, not of a render.
  if (opts.transport) configure(opts.transport);

  // Fixed for the life of the binding, so this is one unconditional hook call, not a conditional one.
  const useHost: () => HostBridge | undefined = opts.useHost ?? (() => undefined);

  function Region({ children, region }: { children?: ReactNode; region?: Partial<RegionOf<C>> }): ReactElement {
    const host = useHost();
    return createElement(
      ArchipelagoProvider,
      { config, elements: opts.elements, host, seed: opts.seed, channels: opts.channels, region },
      children,
    );
  }

  return {
    Region,
    Island: Island as RegionBinding<RegionOf<C>, SlotsOf<C>>['Island'],
    useRegion: () => useRegionSnapshot<RegionOf<C>>(),
    seed: (key, value) => seedArchipelago(config.id, key, value),
    provide: (key, value) => provideToArchipelago(config.id, key, value),
    id: config.id,
  };
}
