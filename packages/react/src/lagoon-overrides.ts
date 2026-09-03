// What the lagoon is TOLD about one region — and the two shapes it may be told it in.
//
// `LagoonOverrides` was keyed KIND-FIRST: `seed`, `layout`, `channels`, `providers` and `props` were
// each a `Record<regionId, …>`. Adding one region therefore meant an entry in up to five different
// maps, in one file every region shares — 219 lines of pure transposition on a ten-region project,
// and the file two parallel agents are guaranteed to collide in.
//
// So a region may now be declared in ONE place (`regions: { 'forgot-password': { seed, layout } }`),
// which is the shape the region's own module already has. The kind-first maps still work and still
// mean the same thing; where both name a field, the region-first one wins, because it is the more
// specific statement about that region.
import { channelRegionId } from '@motu/core';
import type { AnyArchipelagoConfig, DeclaredChannel, RegionOf, SlotsOf } from '@motu/core';
import type { DeclaredWire } from './lagoon-wire';
import type { ReactNode } from 'react';

/** Everything the lagoon can be told about ONE region. */
export interface RegionOverrides {
  /** Initial store contents, so bound islands render meaningfully. */
  seed?: Record<string, unknown>;
  /** Inbound seams: host signals mirrored into the store, as the real composition roots do. */
  channels?: DeclaredChannel[];
  /**
   * The region's WIRE: a fake `fetch` answering HTTP BENEATH the application's own client, so the
   * app's service, its URL building, its status handling and its error mapping all run for real.
   *
   * A field, like `channels`, and for the same reasons — see `wireFrom`. It used to be a bare
   * `installFakeFetch(...)` at the region module's top level, which bound the fake to no region,
   * duplicated its route list, and silently ignored every wire after the first.
   */
  wire?: DeclaredWire;
  /**
   * The region's ARRANGEMENT — the APPLICATION's own layout component, called with islands in its
   * slots. Rendered by the region view only.
   */
  layout?: (island: (slot: string) => ReactNode) => ReactNode;
  /**
   * The environment the islands cannot render without, installed in EVERY view. Distinct from
   * `layout`: getting the two confused is invisible in the region view and fatal in mountpoints.
   */
  providers?: (children: ReactNode, slot: string) => ReactNode;
  /**
   * THE APPLICATION'S OWN PAGE — the module the router renders, composed exactly as production
   * composes it (its own `createRegion`, its own `<X.Region>`, its own `<X.Island slot=…>`).
   *
   * EXPERIMENTAL, and narrow on purpose. Every other view here renders the region: motu supplies the
   * provider, the seed and the arrangement, so what is proved is that the ISLANDS work and that the
   * declared couplings carry. What none of them can reach is the page itself — `integrate check`
   * reads the host's SOURCE, so it sees `<X.Island slot="y">` and cannot see whether the branch
   * containing it ever runs. A slot inside `{isOpen && …}` or a `.map()` is reported as conditionally
   * placed, and nothing anywhere proves the page REACHES it. That gap has been the honest boundary of
   * static integration checking; this is the smallest thing that closes it.
   *
   * The lagoon installs `providers` and the `wire` and then renders this, adding NO provider of its
   * own — the page brings its own region. So a page that crashes on load crashes here, and a slot the
   * page never reaches is a slot that never appears in the DOM.
   *
   * `channels` DO NOT FIRE IN THIS VIEW, and that is a limitation rather than a decision. A channel is
   * installed by motu's own `ArchipelagoProvider`, which this view deliberately does not mount — the
   * page supplies its own. A region fed by a channel therefore renders here with those keys unset, and
   * `page-render` may report a slot as unreached when the truth is that nothing fed it. Fixable: the
   * store is module state keyed by archipelago id, so the channels could be installed against it once
   * the page's own region has mounted. Not done, because the one project this was built against
   * declares no channels and a fix nobody can fail is not a fix.
   *
   * It is only renderable where the page module can be IMPORTED into a browser bundle. A React page
   * on a Vite or a plain-React host qualifies; a Next server component does not, and says so rather
   * than pretending.
   */
  page?: () => ReactNode;
  /** Per slot: the props the PAGE passes on the island element itself, for what is not region state. */
  props?: Record<string, Record<string, unknown>>;
  /**
   * Per ROOT PROP the islands do not fill: what the lagoon hands the region's root component.
   *
   * Two kinds, one map, because to the page they are the same thing — a prop it passes:
   *   - a prop the archipelago names in `hostSlots` -> the PROPS for that component;
   *   - any other prop of the root -> the VALUE itself (a greeting, a count).
   *
   * Its own field rather than a second meaning for `props`, which is per ISLAND slot — one map keyed
   * by two different vocabularies is how a value silently reaches nothing.
   *
   * DATA ONLY, and that is the constraint that matters: the components are the application's, named
   * in the archipelago, so the lagoon supplies who is looking and never what it looks like.
   *
   * A plain object is fixed for the region's whole life, which is right for most of these props —
   * but a root that branches on a value describing WHO is looking (an ownership flag, a role) cannot
   * be demoed both ways from one mount: `RegionRoot` never spreads the live store onto the root's
   * props, so a `?flow=` switch that only replays the store leaves such a prop frozen at whatever the
   * override said, and two flows meant to show opposite branches render identically. The function
   * form receives the ACTIVE seed — the requested flow's `seed` when the URL names one, else the
   * region's own — so a root prop can be DERIVED from the same seed the flow already declares,
   * without inventing a second place to say `isOwnPage: true`.
   */
  hostProps?: Record<string, unknown> | ((seed: Record<string, unknown>) => Record<string, unknown>);
}

/** The fields of a region override, so a reader cannot forget one the writer supplied. */
const REGION_FIELDS = ['seed', 'channels', 'wire', 'layout', 'providers', 'props', 'hostProps', 'page'] as const;

/** The kind-first maps, one per field of `RegionOverrides`. */
type KindFirst = {
  [K in keyof RegionOverrides]?: Record<string, NonNullable<RegionOverrides[K]>>;
};

/** What a lagoon entry may be told, in either shape. */
export interface RegionOverrideMaps extends KindFirst {
  /**
   * Region-first, and the one to prefer.
   *
   * An ARRAY of `overridesFor(someArchipelago, …)` is the strongest form: each entry carries the id it
   * belongs to, so no name is written twice and none can be misspelt. A `Record<id, …>` is still
   * accepted for a project that has not moved, and for an override with no archipelago to point at.
   *
   * Absent fields fall back to the kind-first maps below, so the shapes may be mixed.
   */
  regions?: Record<string, RegionOverrides> | readonly BoundRegionOverrides[];
}

/**
 * Everything the lagoon knows about one region, whichever shape it was declared in.
 *
 * Read through this rather than reaching into the maps: the two entries (the gallery and the focused
 * lagoon `motu island verify` drives) have twice shipped a bug where one of them honoured a field the
 * other silently dropped — `props` rendered a blank frame in every check, and `setup` was never
 * called on the entry every check drives. Both were a reader that had forgotten a field.
 */
export function regionOverrides(maps: RegionOverrideMaps | undefined, id: string | undefined): RegionOverrides {
  if (!maps || !id) return {};
  const declared = maps.regions;
  const own: RegionOverrides =
    (Array.isArray(declared)
      ? (declared as readonly BoundRegionOverrides[]).find((r) => r.regionId === id)
      : (declared as Record<string, RegionOverrides> | undefined)?.[id]) ?? {};
  const merged: RegionOverrides = {};
  for (const field of REGION_FIELDS) {
    const value = own[field] ?? maps[field]?.[id];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- keyed write over a union of field types
    if (value !== undefined) (merged as any)[field] = value;
  }
  // INSTALLED HERE, in the one reader both entries share, for the reason in this function's own doc
  // comment: the gallery and the focused entry have twice shipped a bug where one honoured a field the
  // other dropped, and a wire that is installed in only one of them is the same bug with a worse
  // symptom — the checks drive the focused entry, so the lane a human looks at would be the only one
  // answering HTTP. Idempotent per fake, so being called on every resolve costs nothing.
  merged.wire?.install();
  return merged;
}

/** A region override that KNOWS which archipelago it belongs to. */
export type BoundRegionOverrides = RegionOverrides & { readonly regionId: string };

/**
 * Everything the lagoon is told about ONE region, bound to the archipelago it is about.
 *
 * The alternative — and what this replaces — is a string key in a map: `regions: { actions: … }`,
 * matched by convention against the registry, against `<id>.evidence.ts`, and against a regex in
 * `verify.mjs`. Nothing checked those four spellings against each other, so renaming a region gave a
 * silently unseeded lagoon rather than an error, and a check that scraped the wrong name skipped an
 * entire runtime lane while still reporting PASS.
 *
 * So the link is a REFERENCE, exactly as `channelFrom({ to })` already made it. What that buys, all
 * of it from the one argument:
 *
 *   - the id is derived, so it cannot be misspelt;
 *   - `seed` is `Partial` of the region's OWN type — a key the region does not declare is an error
 *     here, where before it was a value the lagoon stored and no island ever read;
 *   - `layout` and `props` are keyed by the DECLARED SLOTS;
 *   - a channel built against a different archipelago is refused, by the type where the ids are
 *     literal and by the stamp `channelFrom` leaves either way.
 */
export function overridesFor<const A extends AnyArchipelagoConfig>(
  to: A,
  spec: {
    /** Initial store contents — the region's own keys, and only those. */
    seed?: Partial<RegionOf<A>>;
    /** The ARRANGEMENT: the application's own layout component, called with the declared slots. */
    layout?: (island: (slot: SlotsOf<A>) => ReactNode) => ReactNode;
    /** What the islands cannot render without, installed in EVERY view. */
    providers?: (children: ReactNode, slot: SlotsOf<A>) => ReactNode;
    /** Per slot: what the PAGE passes on the island element, for what is not region state. */
    props?: Partial<Record<SlotsOf<A>, Record<string, unknown>>>;
    /**
     * Per root prop the islands do not fill: a host slot's props, or a plain prop's value.
     *
     * The function form is called with the ACTIVE seed (the requested flow's, else the region's own)
     * — see `RegionOverrides.hostProps` for why a root prop sometimes needs to move with the flow
     * rather than stay fixed for the region's whole life.
     */
    hostProps?:
      | ((A extends { hostSlots?: infer H }
          ? { [K in keyof H]?: H[K] extends (p: infer P) => unknown ? P : Record<string, unknown> }
          : object) &
          Record<string, unknown>)
      | ((seed: Partial<RegionOf<A>>) => (A extends { hostSlots?: infer H }
          ? { [K in keyof H]?: H[K] extends (p: infer P) => unknown ? P : Record<string, unknown> }
          : object) &
          Record<string, unknown>);
    /** Inbound seams. Each must have been built against THIS archipelago. */
    channels?: readonly DeclaredChannel<A['id']>[];
    /** The wire fake beneath the app's own client. Must have been built against THIS archipelago. */
    wire?: DeclaredWire<A['id']>;
    /**
     * EXPERIMENTAL — the application's own page module. See `RegionOverrides.page`.
     *
     * Listed here because this function enumerates what it forwards: a field the type allows and this
     * body forgets is dropped in silence, and the check downstream then reports "no page declared"
     * for a region whose overrides declare one.
     */
    page?: () => ReactNode;
  },
): BoundRegionOverrides {
  for (const channel of spec.channels ?? []) {
    const belongsTo = channelRegionId(channel);
    // `rawChannel` belongs to no archipelago by design, so an absent stamp is not a finding.
    if (belongsTo && belongsTo !== to.id) {
      throw new Error(
        `motu: a channel built for region "${belongsTo}" is declared in the overrides for "${to.id}". ` +
          `The lagoon would install a stand-in answering questions no island here asks — file it under ` +
          `"${belongsTo}", or point its \`channelFrom({ to })\` at this archipelago.`,
      );
    }
  }
  // Same refusal as a channel's, and it matters more here: a wire filed under the wrong region patches
  // `globalThis.fetch` for a page whose islands ask none of the questions it answers, so the region it
  // WAS written for goes unanswered while the one it landed in looks stubbed.
  if (spec.wire && spec.wire.regionId !== to.id) {
    throw new Error(
      `motu: a wire built for region "${spec.wire.regionId}" is declared in the overrides for "${to.id}". ` +
        `File it under "${spec.wire.regionId}", or point its \`wireFrom({ to })\` at this archipelago.`,
    );
  }
  return {
    regionId: to.id,
    wire: spec.wire,
    seed: spec.seed as RegionOverrides['seed'],
    layout: spec.layout as RegionOverrides['layout'],
    providers: spec.providers as RegionOverrides['providers'],
    props: spec.props as RegionOverrides['props'],
    hostProps: spec.hostProps as RegionOverrides['hostProps'],
    channels: spec.channels ? [...spec.channels] : undefined,
    page: spec.page as RegionOverrides['page'],
  };
}

/**
 * The escape hatch for a frame that genuinely cannot be the page's own code, and it costs a sentence.
 *
 * Same shape as `rawChannel`: the reason stays in the file, where `region-root` finds it and prints
 * it beside a WARNING instead of an error. Some arrangement really has no component to point at — a
 * page whose layout is generated, a host motu does not own — and saying so out loud is the difference
 * between a known stand-in and a drawing nobody knew was a drawing.
 *
 * It is not a way to keep a copy of the page. A copy drifts: this project shipped a lagoon that said
 * "On récupère ton accès" over a page that said "Mot de passe oublié ?", and no check could see it.
 */
export function inventedArrangement<T>(reason: string, node: T): T {
  if (!reason) throw new Error('motu: inventedArrangement needs a reason — it is the whole point of the wrapper');
  return node;
}
