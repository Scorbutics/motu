// The "archipelago": one per legacy page. It declares islands (by named slot), gives them a shared
// Store, and a HostBridge for outward intents (navigation/actions). The page only drops thin
// <motu-island slot="…"> markers; all composition lives here, shipped in the composition root.

import { Store, declareProducers, declareReaders, noteIslandOutput } from './store';
import { installChannels, type Channel } from './channel';
import { runWithWriteSource, currentWriteSource } from './store';

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

export interface IslandSpec<TRegion = Record<string, unknown>, TTag extends string = string> {
  /** Marker name the page references: <motu-island slot="member-results">. */
  slot: string;
  /**
   * Custom element tag to instantiate.
   *
   * `TTag` defaults to `string`, which is what an ocean needs. Narrow it to `keyof ElementTypes` (the
   * map `motu island sync` generates) and two things follow: an unknown tag is a compile error rather
   * than a runtime warning, and the tag stays a LITERAL — without which nothing downstream can look
   * the island up to check the events this entry wires (`RegionWiringOk`).
   */
  element: TTag;
  /**
   * For a CATALOGUE region only: the discriminator this island renders, as it appears in the data.
   *
   * `slot` is motu's name for the island; this is the APP'S name for the row that summons it —
   * Twenty's `WidgetType.FIELDS`, a `ViewType.TABLE`. Keeping them separate matters because the check
   * that becomes possible (`checkCatalogue`) compares against captured rows and a codegen'd enum, and
   * neither of those has ever heard of a motu slot. Defaults to `slot` when the two coincide.
   */
  member?: string;
  /**
   * Keys this island CONSUMES without taking them as props — because the host's own store hands them
   * over directly.
   *
   * `bind` is the prop path and it is the only reader motu can see by itself. That is enough while
   * motu owns the store, and it is not enough for an application that already has one: Twenty's side
   * panel subscribes to `pageLayoutEditingWidgetId` from a Jotai atom, renders the settings for
   * whichever widget it names, and takes no prop for it at all. Declared reads make that reader
   * visible — without them the key is written by an island, read by nobody motu knows about, and the
   * `coupling` check reports a real coupling as one that escapes the archipelago.
   *
   * This is a CLAIM, not a wire: motu cannot enforce a store it does not own (see `foreign-store.ts`).
   * What it buys is that the claim can be contradicted — by the lens, and by a flow that moves the key
   * and asserts on what this island then renders.
   */
  reads?: readonly string[];
  /**
   * DECLARED, NOT YET BUILT — the survey's output before anyone implements it.
   *
   * Declaring a whole region up front is what makes parallel work safe: an agent branches from an
   * archipelago that already carries everyone else's ownership, so a second claim on a key fails in
   * their own branch instead of at merge. The cost, measured on a two-agent run, is that the region
   * is RED in every branch until the last island lands — `islands-registered` cannot find a tag whose
   * island nobody has written yet, and an agent can verify their island but not their region.
   *
   * `planned: true` separates the two questions. Ownership still counts this entry (that is the whole
   * point — conflicts must fail early), while the checks that ask "does it exist and mount?" skip it.
   *
   * It removes itself: once the island IS registered, the flag becomes an ERROR rather than a
   * courtesy, so the survey cannot quietly become a list of things nobody built.
   */
  planned?: boolean;
  /** Static properties set once on mount. */
  props?: Record<string, unknown>;
  /**
   * Props this island fills with ANOTHER island: prop name -> slot.
   *
   * Nesting was expressible in the page (`<Island slot="week-nav"><WeekNavigator ambassador={<Island
   * slot="ambassador-inline"/>} /></Island>`) and nowhere else, so the lagoon rendered the outer island
   * with holes and the region's own composition lived only in host JSX. Two islands are two islands
   * whether or not one sits inside the other's DOM — a navigator that owns which week is on screen is
   * not "environment" because it happens to contain a progress strip.
   *
   * Declared here for the same reason `bind` is: it is a fact about how THIS region composes, and the
   * same island may be nested in one region and standalone in another. The host's own JSX still wins
   * where it passes the prop itself — page seeds, region fills the rest.
   */
  slots?: Record<string, string>;
  /**
   * Reactively bind an element property to a store key (elementProp -> storeKey).
   *
   * The store key is `keyof TRegion`, so a region that declares its shape gets the binding checked by
   * the compiler: rename the key in the app and this fails to build. That matters because the page and
   * the archipelago otherwise name the same value twice and nothing links them — in peps the page
   * already called it `loadingReceived` while the store key was `receivedLoading`.
   *
   * `| undefined` is not an invitation to write one: it is what lets a region be declared with
   * `satisfies` (which `ProducedKeys` needs — see below), because an array literal of differently
   * shaped island entries infers each absent key as `?: undefined`. Readers skip falsy keys.
   */
  bind?: BindDeclaration<TRegion>;
  /**
   * Handle a CustomEvent the island emits; typically writes the store or fires a host intent.
   *
   * `| undefined` for the same reason as `bind`: it keeps a `satisfies`-declared region assignable.
   */
  on?: Record<string, ((detail: unknown, ctx: IslandContext) => void) | undefined>;
  /**
   * What this island's output WRITES: event name -> the store key it owns, or a map from fields of the
   * event's detail to keys. Declaring it does three things a handler function cannot:
   *
   *  1. it declares OWNERSHIP — nobody else may update those keys (see `producerOf`), which is what
   *     stops a page wiring two islands together through its own state (docs/plan-key-ownership.md);
   *  2. it makes the region's graph readable WITHOUT running it — event, key and reader are all
   *     declared, so the lens can draw the wiring before anything fires;
   *  3. it is EJECTABLE. Removing motu has to leave the coupling working, and a `useState` + callback
   *     prop can be generated from this mapping. It cannot be generated reliably from an arbitrary
   *     function body, which is why writing goes here and `on` keeps only what has no store effect
   *     (host intents).
   *
   * Declared on the region's wiring rather than on the island: the same island can own a key in one
   * region and be a pure consumer of it in another (D2).
   *
   * Ownership is about UPDATES, not first paint — a key is normally host-seeded and island-produced
   * afterwards (D4), so `seed` and this coexist.
   *
   *   writes: { 'new-count': 'newReceivedCount' }                       // detail IS the value
   *   writes: { 'week-progress': { overallProgress: 'overallProgress' } } // detail.field -> key
   */
  writes?: Record<string, (keyof TRegion & string) | Record<string, keyof TRegion & string> | undefined>;
}

/**
 * A region's declared shape.
 *
 * `TRegion` is the CONTRACT TYPE, and it is extracted from the host application — it contains no motu
 * import and it erases at runtime, so removing motu leaves it (and the page that uses it) untouched.
 * It defaults to an open record for the ocean, where there IS no app-side type to extract: region
 * state lives in `$scope` and motu declares it. Under a modern host, `motu archipelago verify`
 * requires the parameter, because there the page owns the state and motu must reference it rather
 * than restate it.
 */
/**
 * What an island reads: a list of region keys, and a map only where the names differ.
 *
 *   bind: ['profilsWaiting', 'isCurrentWeek', { stats: 'networkStats' }]
 *
 * A RENAME is a decision — the component's word for the value is not the region's, and someone chose
 * that. Everything else was transcription: `{ compactMode: 'compactMode', weekLoading: 'weekLoading' }`
 * said the same word twice per key, and a page's worth of that buries the two or three lines a
 * reviewer actually needs to look at. The plain record stays legal (nothing has to be rewritten).
 */
export type BindDeclaration<TRegion> =
  | readonly ((keyof TRegion & string) | Record<string, (keyof TRegion & string) | undefined>)[]
  | Record<string, (keyof TRegion & string) | undefined>;

/** A `bind` declaration in its long form: [prop, key] pairs, whichever form was written. */
export function bindEntries(spec: { bind?: BindDeclaration<never> | undefined }): [string, string][] {
  const bind = spec.bind;
  if (!bind) return [];
  const pairs = (record: Record<string, string | undefined>): [string, string][] =>
    Object.entries(record).filter((e): e is [string, string] => typeof e[1] === 'string');
  if (Array.isArray(bind)) {
    return bind.flatMap((entry) =>
      typeof entry === 'string'
        ? ([[entry, entry]] as [string, string][])
        : pairs(entry as Record<string, string | undefined>),
    );
  }
  return pairs(bind as Record<string, string | undefined>);
}

export interface ArchipelagoConfig<TRegion = Record<string, unknown>, TTag extends string = string> {
  id: string;
  islands: readonly IslandSpec<TRegion, TTag>[];
  /**
   * Store keys fed from OUTSIDE the region — the host's own, written through `provideToArchipelago`
   * or a channel.
   *
   * DERIVED, and only declarable for the case derivation cannot see: a key the host feeds that no
   * island binds. Host-fed is what is LEFT after ownership — every bound key an island does not write
   * is fed from outside, by definition, so listing them restated a subtraction the compiler can do
   * (`HostFedKeys`). The list also had to be maintained: sixteen entries in peps' actions region, each
   * of them a place to typo a key that `keyof TRegion` would have caught anyway.
   */
  provides?: readonly (keyof TRegion & string)[];
  /**
   * The "new design" layout: HTML arranging the island slots (e.g. hero + toolbar + results). It is
   * rendered natively by <motu-archipelago name="id"> in the standalone app, and swapped in as a
   * whole region when previewing inside the legacy app. Shared so both stay in lock-step.
   */
  layout?: string;
  /**
   * Where the island LIST comes from.
   *
   * `placed` (the default): the page names its islands in source — `<X.Island slot="…">` — and every
   * declared slot must appear there. That is true of most pages and it is what makes `integrate
   * check` able to ask "is this wired".
   *
   * `catalogue`: the region's members are decided at RUNTIME, from data. Twenty's record page renders
   * widgets from a database row through a `WidgetType` enum — users add, remove, drag and resize them
   * — so there is no placement in source to check, and asking for one produces three findings that
   * cannot be true or false. Dashboards, CRMs and BI tools are all this shape.
   *
   * What stays checkable is the CONTRACT: every type the layout may contain declares what it reads and
   * writes, and ownership still has exactly one owner per key. Declaring the membership kind is what
   * lets the checks ask the answerable question instead of the unanswerable one.
   */
  membership?: 'placed' | 'catalogue';
  /**
   * The region's INBOUND seam, named.
   *
   * `writes` says which island updates a key, and everything motu can enforce about ownership follows
   * from that declaration existing. The other direction had none: a key bound by an island and written
   * by no island was "host-fed" — derived, anonymous, and therefore unenforceable. Nothing could say
   * that the page and the lagoon must feed it from the SAME logic, so they drifted, and the framework
   * had only a guideline to offer.
   *
   * Naming the producer closes that. Each entry points at an APPLICATION module — the page's own data
   * source — and lists the keys it produces:
   *
   *   sources: {
   *     results: { module: '@/app/dashboard/directory/directory-source',
   *                produces: ['members', 'total', 'loading', 'loadingMore', 'facetCounts'] },
   *   }
   *
   * It is a reference, not an implementation: the module belongs to the app and survives motu's
   * removal, while this declaration goes with motu. What it buys is checkable — every host-fed key has
   * exactly one declared producer, and both the page and the lagoon must install THAT module rather
   * than restate what it does.
   */
  sources?: Readonly<
    Record<
      string,
      | {
          /**
           * The source itself, IMPORTED from the application beside the thing it describes.
           *
           * It used to be named here as a `module` + `symbol` string pair, which meant the same fact
           * was written in two files with a check to keep them agreeing — a symptom, not a safety
           * property. A reference cannot disagree with itself, and the module a channel installs is
           * the module this points at, by construction rather than by inspection.
           */
          create(...args: never[]): unknown;
          produces: readonly (keyof TRegion & string)[];
        }
      // A key no channel installs — the page fetches it itself. There is nothing to reference, so the
      // module is still named: it is what `motu integrate check` holds the page to.
      | { module: string; produces: readonly (keyof TRegion & string)[] }
    >
  >;
}

/**
 * The keys a region declares as island-produced, as a union.
 *
 * Only meaningful when the config keeps its literal types — declare it with `satisfies
 * ArchipelagoConfig<Region>` rather than a type annotation, or every `produces` entry widens to
 * `keyof Region` and this yields the whole region.
 */
export type ProducedKeys<A> = A extends { islands: readonly (infer I)[] } ? ProducesOf<I> : never;

/** Distributes over the island union; an entry without `writes` contributes nothing. */
type ProducesOf<I> = I extends { writes: infer W } ? KeysIn<W[keyof W]> : never;

/** A `writes` value is the key itself, or a map of detail fields to keys. */
type KeysIn<V> = V extends string ? V : V extends Record<string, infer K> ? (K extends string ? K : never) : never;

/** Every store key an island reads, as a union. Entries without `bind` contribute nothing. */
export type BoundKeys<A> = A extends { islands: readonly (infer I)[] } ? BindsOf<I> : never;
type BindsOf<I> = I extends { bind: infer B }
  ? B extends readonly (infer E)[]
    ? E extends string
      ? E
      : E[keyof E] & string
    : B[keyof B] & string
  : never;

/** Every key the region declares as host-fed, in the rare case it says so explicitly. */
export type ProvidedKeys<A> = A extends { provides: readonly (infer K)[] } ? (K extends string ? K : never) : never;

/**
 * Host-fed keys, DERIVED: bound by an island, written by none.
 *
 * This is the whole of `provides`, computed. It is also why nothing can be "unowned" any more: a key
 * either has an island that writes it, or the host feeds it, and there is no third case.
 */
export type HostFedKeys<A> = Exclude<BoundKeys<A>, ProducedKeys<A>>;

/** Every key a declared source claims to produce. */
export type SourcedKeys<A> = A extends { sources: infer S }
  ? S[keyof S] extends { produces: readonly (infer K)[] }
    ? K extends string
      ? K
      : never
    : never
  : never;

/**
 * Host-fed, and claimed by no declared source — the keys nobody has said who feeds.
 *
 * `true` while a region declares no `sources` at all (adoption is per region, like ownership was);
 * once it declares one, every host-fed key has to be accounted for.
 */
export type RegionSourcesOk<A> = [SourcedKeys<A>] extends [never]
  ? true
  : [Exclude<HostFedKeys<A>, SourcedKeys<A>>] extends [never]
    ? true
    : ['host-fed but produced by no declared source:', Exclude<HostFedKeys<A>, SourcedKeys<A>>];

/** Bound, but claimed by nobody. Empty by construction now that host-feeding is the default. */
export type UnownedKeys<A> = Exclude<BoundKeys<A>, ProvidedKeys<A> | ProducedKeys<A> | HostFedKeys<A>>;

/** Claimed twice — the host says it feeds it, an island says it writes it. */
export type DisputedKeys<A> = ProvidedKeys<A> & ProducedKeys<A>;

/**
 * Ownership as a COMPILE failure rather than a report.
 *
 * `verify` can only say these things after the fact, in a separate step someone has to run. They are
 * set operations over declarations the compiler already holds, so they can be a build error instead —
 * in the same loop as the edit that caused them, with `tsc`'s already-machine-readable output. One
 * line per region:
 *
 *   const _ownership: RegionOwnershipOk<typeof actionsArchipelago> = true;
 *
 * Resolves to `true` when every bound key has exactly one owner, and otherwise to a labelled tuple —
 * so the error names the offending keys rather than just failing.
 *
 * What CANNOT move here, and is why `verify` still exists: whether a declared output ever fires, and
 * whether a declaration is HONEST. Both are runtime facts; types can only check consistency.
 */
export type RegionOwnershipOk<A> = [UnownedKeys<A>] extends [never]
  ? [DisputedKeys<A>] extends [never]
    ? true
    : ['declared in `provides` AND written by an island:', DisputedKeys<A>]
  : ['bound but owned by nobody — add to `provides`, or to an island\'s `writes`:', UnownedKeys<A>];

/** The CustomEvent names an island declares as outputs, from its element spec's contract. */
export type EventsOf<E> = E extends { options: { contract: { output: infer O } } }
  ? O[keyof O] & string
  : never;

/**
 * Wiring as a COMPILE failure: every event an island entry wires must be one the island declares.
 *
 * This is the last silently-dead declaration. `writes: { 'week-progres': 'x' }` is a well-typed
 * mapping onto a well-typed key — nothing about it is wrong except that no island will ever dispatch
 * it, which used to be discoverable only by running the region and noticing nothing moved.
 *
 * It needs the project's tag -> element-spec map, which `motu island sync` generates beside the
 * registry; pass it as `TElements`. Type-only, so the archipelago gains no runtime dependency on the
 * island modules:
 *
 *   const _wiring: RegionWiringOk<typeof actionsArchipelago, ElementTypes> = true;
 *
 * Checked PER ISLAND when the config is declared through `archipelago()` — wiring island A to island
 * B's event fails, not just a typo. A `satisfies`-declared config degrades to the project's whole
 * event vocabulary, because its entries lose the correlation between `element` and `writes`.
 */
export type RegionWiringOk<A, TElements> = [Undeclared<A, TElements>] extends [never]
  ? true
  : ['wired to an event its island does not declare:', Undeclared<A, TElements>];

type Undeclared<A, TElements> = A extends { islands: readonly (infer I)[] } ? PerIsland<I, TElements> : never;

/**
 * Distributes over the entries, so each one's events are checked against ITS OWN island.
 *
 * This is only precise because the config is declared through `archipelago()`: a `satisfies` array
 * literal is normalised into a union whose members no longer carry their own `element` beside their
 * own `writes`, and the best you can do there is compare against the project's whole vocabulary —
 * which catches a typo but not island A wired to island B's event.
 */
type PerIsland<I, TElements> = I extends { element: infer Tag }
  ? Tag extends keyof TElements
    ? Exclude<WiredEvents<I>, EventsOf<TElements[Tag]>>
    : never
  : never;

/** Every event name an island entry mentions, in `writes` or in `on`. */
type WiredEvents<I> = (I extends { writes: infer W } ? keyof W & string : never) | (I extends { on: infer H } ? keyof H & string : never);

/**
 * The half of a region the HOST may still assign — everything it does not declare an island to
 * produce. Put it where the page already declares its shape (`… satisfies HostRegion<R, typeof arch>`)
 * and assigning a produced key becomes a compile error naming the file that was doing the laundering.
 *
 * Named `…Of` because it derives the split FROM an archipelago, which is motu's own type — so this one
 * belongs to motu's side and page code should not name it. The app-facing spelling is
 * `HostRegion<TRegion, TProducedKeys>` in `@motu/types`: same concept, its own keys, and it survives
 * motu's removal because that package does. The two are asserted to agree by `ProducedKeysAre`.
 */
export type HostRegionOf<R, A> = Omit<R, ProducedKeys<A> & keyof R>;

/**
 * Compile-time cross-check between an app-side host/produced split and what the archipelago declares.
 *
 * Resolves to `true` when they agree, and to a labelled tuple when they do not — so the type error
 * shows which keys are missing on which side:
 *
 *   type _Check = ProducedKeysAre<typeof actionsArchipelago, 'overallProgress' | 'completedCount'>;
 *   const _check: _Check = true;   // fails to compile when the two drift apart
 */
export type ProducedKeysAre<A, Expected extends string> = [ProducedKeys<A>] extends [Expected]
  ? [Expected] extends [ProducedKeys<A>]
    ? true
    : ['declared by the app but not in any `produces`:', Exclude<Expected, ProducedKeys<A>>]
  : ['in `produces` but still assignable by the host:', Exclude<ProducedKeys<A>, Expected>];

/**
 * Phantom carrier for a region's app-side TYPE.
 *
 * `satisfies ArchipelagoConfig<ActionsRegion>` checks the config but throws the region type away —
 * `typeof actionsArchipelago` remembers the literals and nothing else. Declaring through `archipelago()`
 * brands the result so a consumer (`createRegion`) can recover the type without being told it again.
 * Optional and never assigned: it erases completely.
 */
export interface RegionBrand<TRegion> {
  readonly __region?: TRegion;
}

/** The region type carried by a branded config, or an open record when there is none. */
export type RegionOf<C> = C extends RegionBrand<infer R> ? (unknown extends R ? Record<string, unknown> : R) : Record<string, unknown>;

/** Every slot a config declares, as a union — literal only when declared through `archipelago()`. */
export type SlotsOf<C> = C extends { islands: readonly (infer I)[] } ? (I extends { slot: infer S } ? (S extends string ? S : never) : never) : never;

/**
 * Declare an archipelago, keeping its literal types.
 *
 * `satisfies` checks a config but widens what it cannot: `slot: 'week-actions'` becomes `string`, and
 * an array literal of differently-shaped entries is normalised into a union whose members no longer
 * carry their own `element` beside their own `writes`. Both matter downstream — the first makes a
 * typed `<Island slot>` possible, the second makes the wiring check per-island rather than per-project.
 * A `const` type parameter keeps both.
 *
 *   export const actionsArchipelago = archipelago<ActionsRegion, keyof ElementTypes>()({ … });
 */
export function archipelago<TRegion, TTag extends string = string>() {
  return <const A extends ArchipelagoConfig<TRegion, TTag>>(config: A): A & RegionBrand<TRegion> => config;
}

/**
 * A region whose declared shape is not known to the code holding it.
 *
 * Registries, resolvers and the framework's own mount paths only ROUTE archipelagos — they never read
 * a bind key, so the region type is genuinely irrelevant to them, and insisting on it would force
 * every such signature to become generic for no checking gained. The `any` is the erasure, and it is
 * confined to these positions: the place the type actually earns its keep — an archipelago's own
 * declaration — keeps it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyArchipelagoConfig = ArchipelagoConfig<any, string>;

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
// The CONFIG, kept by id. `sources` is the region's answer to "where does this key come from" and it
// was written down, checked, and then reachable nowhere at runtime — so the lens could show an island
// with no requests and no way to say what feeds it.
const configs = new Map<string, AnyArchipelagoConfig>();
const archSlots = new Map<string, string[]>();

/** The layout template registered for an archipelago id (used by <motu-archipelago>). */
export function getArchipelagoLayout(id: string): string | undefined {
  return layouts.get(id);
}

/** The slot names of an archipelago, in declared order — the mountpoints the gallery view frames. */
export function getArchipelagoSlots(id: string): string[] {
  return archSlots.get(id) ?? [];
}

/** Every mounted archipelago's declaration — the lens reads `sources` from it. */
export function archipelagoConfigs(): AnyArchipelagoConfig[] {
  return [...configs.values()];
}

/** The store of an archipelago by id — the inbound seam <motu-archipelago>.provide() writes to. */
export function getArchipelagoStore(id: string): Store | undefined {
  return stores.get(id);
}

/**
 * A value a SCENARIO seeded, for a lagoon stub to answer with.
 *
 * The gap this closes: an island that fetches its own data through one of the app's service modules
 * has no props, so a scenario's `seed` reaches nothing. The lagoon replaces that module with a stub,
 * and a stub returning a constant makes every scenario render identically — `data-flow` then either
 * fails honestly or is skipped, and `responsive`, `a11y` and the snapshots all run against ONE state.
 * Three of the four islands on peps' club page were in exactly that position.
 *
 * A stub calls this instead of returning a constant, and the scenario becomes the input again:
 *
 *     export async function fetchClubFeed(limit = 10) {
 *       return (seededValue<ClubFeedEvent[]>('clubFeedEvents') ?? DEFAULT).slice(0, limit);
 *     }
 *
 * It searches every mounted store rather than taking an id, because the caller cannot know one: a
 * single-island verify mounts a synthesised archipelago called `lagoon`, while the region view uses
 * the real id. Asking the stub to guess would make it work in one view and silently not the other.
 */
export function seededValue<T>(key: string): T | undefined {
  for (const store of stores.values()) {
    const value = store.get(key);
    if (value !== undefined) return value as T;
  }
  for (const entry of slots.values()) {
    const value = entry.store?.get(key);
    if (value !== undefined) return value as T;
  }
  return undefined;
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

/**
 * Feed a value into an archipelago's store from OUTSIDE it — the `provide` seam, without an element.
 *
 * <motu-archipelago>.provide() is the same thing with a DOM handle in front of it, which is what an
 * ocean needs. A React host has no such element (islands render in its own tree), so the seam has to
 * be reachable by archipelago id too, or the host-feeds-the-region direction would exist on one mount
 * path and not the other.
 */
export function provideToArchipelago(id: string, key: string, value: unknown): void {
  const store = stores.get(id);
  if (!store) {
    console.warn(`motu: no archipelago "${id}" to provide("${key}")`);
    return;
  }
  // Tag as a host-origin (external) write so the overlay classifies this key as coming from outside.
  if (DEBUG) runWithWriteSource('host', () => store.set(key, value));
  else store.set(key, value);
}

/**
 * (Re-)establish the INITIAL value of a key from outside the region — including a key an island owns.
 *
 * `provide()` is the host feeding a key it owns; this is the host saying "this is where the data
 * starts", which is a different act and the only legitimate way to touch a produced key from outside
 * (D4: a seed is first paint, `writes` owns what happens next). A page that fetches the week and then
 * lets the island mutate it needs exactly this, and needs it again on every refetch — otherwise the
 * store keeps the island's stale list and the host's new one never lands.
 *
 * Tagged 'seed', so the ownership check lets it through and the lens can tell it from an update. A
 * host that seeds the same key over and over is deriving it, not seeding it — that is the laundering
 * smell in a new hat, and it is worth reporting rather than blocking.
 */
export function seedArchipelago(id: string, key: string, value: unknown): void {
  const store = stores.get(id);
  if (!store) {
    console.warn(`motu: no archipelago "${id}" to seed("${key}")`);
    return;
  }
  if (DEBUG) runWithWriteSource('seed', () => store.set(key, value));
  else store.set(key, value);
}

/**
 * Register an island mounted by something other than the custom element — the React host path, where
 * an island renders inside the page's own tree and no <motu-island> is created.
 *
 * The seam lens reads this registry, so without it a React-mounted island is invisible to the very
 * tool that exists to show what is and is not connected. Returns the disposer to call on unmount.
 * Debug-only, like the registry itself: in production this is a no-op and costs nothing.
 */
export function registerMountedIsland(info: MountedIslandInfo): () => void {
  if (!DEBUG) return () => {};
  mounted.add(info);
  notifyMounts();
  return () => {
    mounted.delete(info);
    notifyMounts();
  };
}

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

/**
 * A region's data source: a snapshot, a subscription, and — where the region drives it — the keys it
 * CONSUMES and what to do when they change.
 *
 * `inputs`/`applyInputs` live here and not on the channel deliberately. The page has the same mapping
 * ("the navigator moved, load that week"), so a channel that declared it too would be the input half
 * of the duplication `sources` exists to kill. The source owns both directions; both consumers just
 * install it.
 */
export interface SourceLike {
  /** `object`, not `Record<string, unknown>`: a declared interface has no index signature, so the
   *  stricter shape rejects every real source. The keys that matter are constrained per-channel from
   *  the archipelago's `produces`, which is the check worth having. */
  getState(): object;
  subscribe(listener: () => void): () => void;
  /** Region keys this source consumes, if any. */
  inputs?: readonly string[];
  /** Called when one of them changes — with every input, keyed. */
  applyInputs?(values: Record<string, unknown>): void;
  /** Host intents this source answers: an island asks, the page acts, this is the page's half. */
  intents?: Readonly<Record<string, (detail: unknown) => void>>;
  dispose?(): void;
}

/** The sources a config declares, as a type. */
type SourcesOf<A> = A extends { sources: infer S } ? S : never;
/** The keys one declared source produces, as a union of literals. */
type SourceProduces<A, Id extends keyof SourcesOf<A>> = SourcesOf<A>[Id] extends { produces: readonly (infer K)[] }
  ? K extends string
    ? K
    : never
  : never;

declare const CHANNEL_FROM: unique symbol;
/**
 * A channel motu can vouch for.
 *
 * `channels` accepts THIS, not a bare function, and only `channelFrom` (or a deliberate `rawChannel`)
 * produces one. That is the difference between a convention and a rule: an agent that hand-writes
 * `({ store }) => { … }` does not get a warning, it gets a type error.
 */
export type DeclaredChannel = Channel & { readonly [CHANNEL_FROM]: true };

/**
 * The escape hatch, and it costs a sentence.
 *
 * Some inbound seam will not be a source — a DOM event mirrored into the region, a socket. Wrapping it
 * says so out loud and leaves the reason in the file, which a check can find; an anonymous function is
 * not findable.
 */
export function rawChannel(reason: string, channel: Channel): DeclaredChannel {
  if (!reason) throw new Error('motu: rawChannel needs a reason — it is the whole point of the wrapper');
  return channel as DeclaredChannel;
}

/** What a source answers when the host asks it something an island could not do itself. */
type IntentHandlers = Record<string, (source: never, detail: unknown) => void>;

/** Region id -> intent name -> the installed answer. Filled while a channel is mounted. */
const intentAnswers = new Map<string, Map<string, (detail: unknown) => void>>();

/**
 * Answer a host intent from whatever source declared it.
 *
 * The composition root used to name each intent by hand (`if (name === 'directory-load-more') …`),
 * which is the same freehand glue as a hand-written `publish()` and rots the same way. A source
 * declares what it answers; the host just passes the message on.
 */
export function answerHostIntent(regionId: string, name: string, detail: unknown): boolean {
  const answer = intentAnswers.get(regionId)?.get(name);
  if (!answer) return false;
  answer(detail);
  return true;
}


/**
 * A CHANNEL from a declared source — and there is nowhere to put anything else.
 *
 * The earlier shape took a `factory`, which is a closure, which is arbitrary code: it could assemble a
 * source inline and re-implement the page inside the very construct meant to prevent that. Checks
 * could chase it (does the factory import the declared module? does it CALL it? is the call dead?) but
 * every one of those is a heuristic over text, and the last one is not decidable that way.
 *
 * So the shape changed instead. A channel now supplies a MODULE and DATA:
 *
 *   channelFrom({ to: actionsArchipelago, id: 'week', from: weekSource, args: [fixtures, { now }] })
 *
 * motu calls `from[symbol](...args)` where `symbol` is what the archipelago declared. The types check
 * that the module exports it, that the arguments match its signature, and that what it returns
 * produces the declared keys. There is no expression position left for hand-written orchestration —
 * not "detected", not "discouraged": absent.
 */
export function channelFrom<
  A extends AnyArchipelagoConfig,
  Id extends keyof SourcesOf<A> & string,
>(spec: {
  to: A;
  id: Id;
  /** The arguments the source takes: data, and nothing else. */
  args: SourcesOf<A>[Id] extends { create: (...args: infer P) => unknown } ? P : never;
  channelName?: string;
}): DeclaredChannel {
  const declared = (spec.to.sources as Record<string, { create?: (...a: unknown[]) => SourceLike; produces: readonly string[] }> | undefined)?.[
    spec.id
  ];
  if (!declared) {
    throw new Error(
      `motu: archipelago "${spec.to.id}" declares no source "${spec.id}" — add it to \`sources\` so the keys ` +
        `it produces are named, or this channel is feeding the region from nowhere.`,
    );
  }
  if (typeof declared.create !== 'function') {
    throw new Error(
      `motu: source "${spec.id}" is declared by module name only, so there is nothing to install — point ` +
        `\`sources.${spec.id}\` at the source itself if a channel should build it.`,
    );
  }
  const islandOwned = new Set<string>();
  for (const island of spec.to.islands) for (const key of writtenKeys(island)) islandOwned.add(key);

  const channel: Channel = ({ store }) => {
    const source = declared.create!(...(spec.args as unknown[]));

    const publish = () => {
      const state = source.getState() as Record<string, unknown>;
      for (const key of declared.produces) {
        // A key an island UPDATES is seeded, not written: the page establishing a value is first
        // paint, and writing it from the host is the ownership violation the store guard reports.
        if (islandOwned.has(key)) seedArchipelago(spec.to.id, key, state[key]);
        else store.set(key, state[key]);
      }
    };
    // On CHANGE, deliberately not on install: a seed is first paint (D4), and a source that has not
    // answered yet holds empty defaults — publishing them overwrote the region's seed with nothing.
    const unpublish = source.subscribe(publish);

    let unsubscribe = () => {};
    const inputs = source.inputs;
    if (inputs?.length && source.applyInputs) {
      let last = '';
      const onRegionChange = () => {
        const values = Object.fromEntries(inputs.map((key) => [key, store.get(key)]));
        const signature = JSON.stringify(inputs.map((key) => values[key] ?? null));
        if (signature === last) return; // our own echo, or a key we do not consume
        last = signature;
        source.applyInputs!(values);
      };
      onRegionChange();
      unsubscribe = store.subscribe(onRegionChange);
    }

    // What this source answers when an island asks the host for something.
    const answers = new Map<string, (detail: unknown) => void>();
    for (const [name, handler] of Object.entries(source.intents ?? {})) {
      answers.set(name, (detail) => (handler as (d: unknown) => void)(detail));
    }
    if (answers.size) intentAnswers.set(spec.to.id, answers);

    return () => {
      unsubscribe();
      unpublish();
      if (answers.size && intentAnswers.get(spec.to.id) === answers) intentAnswers.delete(spec.to.id);
      source.dispose?.();
    };
  };
  if (spec.channelName) (channel as { channelName?: string }).channelName = spec.channelName;
  return channel as DeclaredChannel;
}

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

/** Every store key an island's `writes` mapping can update. */
export function writtenKeys(spec: IslandSpec): string[] {
  const out: string[] = [];
  for (const target of Object.values(spec.writes ?? {})) {
    if (typeof target === 'string') out.push(target);
    else if (target) out.push(...Object.values(target));
  }
  return out;
}

/** Event names this island's outputs are wired to — declarative writes and intent handlers alike. */
export function outputEvents(spec: IslandSpec): string[] {
  return [...new Set([...Object.keys(spec.writes ?? {}), ...Object.keys(spec.on ?? {})])];
}

/**
 * Apply one output event: the declared writes first, then the handler (which exists for effects that
 * are NOT store writes — a host intent, a refetch). Shared by both mount paths so an island behaves
 * the same however it was mounted.
 */
export function applyOutput(spec: IslandSpec, eventName: string, detail: unknown, ctx: IslandContext): void {
  noteIslandOutput(spec.slot, eventName);
  const target = spec.writes?.[eventName];
  if (typeof target === 'string') {
    ctx.store.set(target, detail);
  } else if (target) {
    const fields = (detail ?? {}) as Record<string, unknown>;
    for (const [field, key] of Object.entries(target)) ctx.store.set(key, fields[field]);
  }
  spec.on?.[eventName]?.(detail, ctx);
}

/**
 * The keys this region is fed from outside, at runtime: bound by an island, written by none — plus
 * anything the config still names explicitly. The value-level twin of `HostFedKeys`.
 */
export function hostFedKeys(config: AnyArchipelagoConfig): Set<string> {
  const produced = new Set<string>();
  for (const island of config.islands) for (const key of writtenKeys(island)) produced.add(key);
  const out = new Set<string>((config.provides ?? []) as readonly string[]);
  for (const island of config.islands) {
    for (const [, key] of bindEntries(island)) if (!produced.has(key)) out.add(key);
  }
  return out;
}

/**
 * Registers an archipelago. Each island becomes mountable by slot, all sharing one store and host.
 * Returns the store so a composition root can seed or observe it.
 */
export function defineArchipelago(config: ArchipelagoConfig, opts: ArchipelagoOptions = {}): Store {
  const store = new Store(opts.seed);
  // Who owns which key, for the store's write check. A seed is not a write (it goes through the
  // constructor), so first paint never trips it — `produces` is about UPDATES (D4).
  //
  // A key may be claimed by SEVERAL slots when they are the same island mounted more than once — the
  // responsive duplicate (one filter panel, a desktop sidebar and a mobile drawer) is one owner at two
  // slots. Keyed by slot alone, the second declaration silently replaced the first and every write
  // from the other slot was reported as a stranger reaching into the region. Slots of DIFFERENT
  // elements still collide, because that is a real dispute.
  const producers = new Map<string, string[]>();
  const producingElement = new Map<string, string>();
  for (const island of config.islands) {
    for (const key of writtenKeys(island)) {
      const claimed = producingElement.get(key);
      if (claimed !== undefined && claimed !== island.element) {
        producers.set(key, [island.slot]); // a genuine two-island dispute: last declaration wins, as before
        producingElement.set(key, island.element);
        continue;
      }
      producers.set(key, [...(producers.get(key) ?? []), island.slot]);
      producingElement.set(key, island.element);
    }
  }
  declareProducers(store, producers);
  // Who READS each key, so a host write to one can be recognised as feeding an island (see the
  // laundering smell in store.ts).
  const readers = new Map<string, string[]>();
  for (const island of config.islands) {
    for (const [, key] of bindEntries(island)) {
      readers.set(key, [...(readers.get(key) ?? []), island.slot]);
    }
  }
  declareReaders(store, readers);
  const host = DEBUG ? instrumentHost(opts.host ?? warnHost) : opts.host ?? warnHost;
  for (const island of config.islands) {
    slots.set(island.slot, { spec: island, store, host });
  }
  stores.set(config.id, store);
  configs.set(config.id, config as AnyArchipelagoConfig);
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
    const pairs = bindEntries(spec);
    const apply = () => {
      for (const [prop, key] of pairs) {
        el[prop] = store.get(key);
      }
    };
    apply();
    unsub = store.subscribe(apply);
  }

  for (const eventName of outputEvents(spec)) {
    el.addEventListener(eventName, (e) => {
      const detail = (e as CustomEvent).detail;
      // Tag every store write this event causes with the island, so the overlay's coupling view can
      // attribute writers (reads are already declarative via spec.bind).
      if (DEBUG) runWithWriteSource(slot, () => applyOutput(spec, eventName, detail, { store, host }));
      else applyOutput(spec, eventName, detail, { store, host });
    });
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
