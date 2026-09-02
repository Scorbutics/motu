# 05 — Archipelagos and regions

An archipelago is the declaration of one region: an id, a list of islands referenced by slot, and —
under a modern host — the application component those islands arrange themselves inside. Everything
the region knows about itself is in that one object, and everything downstream (the store's ownership
guard, the lagoon's composition, `motu archipelago verify`, `motu eject`) is derived from it rather
than restated. This page is about the DECLARATION. The adoption strategy — when to reach for
`X.Root`, when for `X.Island`, and how to stage a migration — is
[06 — Composition and adoption](06-composition-and-adoption.md); the vocabulary (island, region,
slot, key) is [01 — Concepts](01-concepts.md).

## The call

```ts
export const actionsArchipelago = archipelago<ActionsRegion, ElementTypes, ProducedActionsKeys>()(
  {
    id: 'actions',
    root: ActionsPageLayout,
    slots: { header: 'actions-header', /* … */ },
    islands: [ /* … */ ],
    sources: { /* … */ },
  },
  { ownership: true, wiring: true, produced: true },
);
```
— `peps:motu/src/archipelagos/actions/actions.archipelago.ts:34`

`archipelago()` is a curried identity function whose only job is to keep types and to make the
region's cross-checks part of the declaration (`packages/core/src/archipelago.ts:605`):

```ts
export function archipelago<TRegion, TElements = string, TProduced extends string = never>() {
  return <const A extends ArchipelagoConfig<TRegion, TagsOf<TElements>>>(
    config: A,
    checks: ArchipelagoChecks<A, TElements, TProduced>,
  ): A & RegionBrand<TRegion> => { void checks; return config; };
}
```

Three things follow from the shape, and the first two are why `satisfies ArchipelagoConfig<R>` is the
weaker form:

- **The `const` type parameter keeps the literals.** `satisfies` widens `slot: 'week-actions'` to
  `string`, and it normalises an array of differently-shaped island entries into a union whose
  members no longer carry their own `element` beside their own `writes`
  (`packages/core/src/archipelago.ts:540-548`). The first loses the typed `<X.Island slot>`
  (`SlotsOf`, `packages/core/src/archipelago.ts:537`); the second degrades `RegionWiringOk` from
  per-island to per-project — it still catches a typo, but not island A wired to island B's event
  (`packages/core/src/archipelago.ts:458-470`).
- **The result is BRANDED with the region type**, so it is never named twice. `RegionBrand<TRegion>`
  is an optional, never-assigned phantom property that erases completely
  (`packages/core/src/archipelago.ts:504-513`), and `RegionOf<C>` recovers it
  (`packages/core/src/archipelago.ts:516`). `satisfies` checks the config and then throws the region
  type away — `typeof actionsArchipelago` remembers the literals and nothing else — which is why the
  composition root would otherwise have to repeat `ActionsRegion` at `createRegion`, at every
  `useRegion<ActionsRegion>()` and at every `seed`.
- **The `checks` argument is REQUIRED**, so a region cannot be declared without asserting at least
  that its keys are owned (`packages/core/src/archipelago.ts:568-577`). See
  [The type-level guards](#the-type-level-guards) for what each property claims and why they are an
  argument rather than part of the signature.

`TRegion` is the CONTRACT TYPE and it is **extracted from the host application**: it contains no motu
import and it erases at runtime, so removing motu leaves it and the page that uses it untouched
(`packages/core/src/archipelago.ts:161-170`). `motu archipelago verify` requires the parameter under
a modern host and reports it as `region-type`; on an ocean the check is skipped, because there is no
app-side type to reference — region state lives in `$scope` and motu declares it
(`packages/cli/src/commands/verify.mjs:2267-2296`).

`TElements` narrows `element` to the project's tags, and it takes either of two forms — `TagsOf<T>`
resolves a bare union to itself and an ELEMENTS MAP to its keys
(`packages/core/src/archipelago.ts:548`). Left at its default `string` — what an ocean needs — an
unknown tag is a runtime warning; narrowed it is a compile error, and the tag stays a LITERAL,
without which nothing downstream can look the island up to check the events an entry wires
(`packages/core/src/archipelago.ts:37-45`).

Prefer the MAP: `ElementTypes` (the interface `motu island sync` generates beside the registry), or a
`Pick<ElementTypes, 'x-a' | 'x-b'>` when the region should only admit its own islands' tags. A bare
union `'x-a' | 'x-b'` narrows the tags exactly as well, and it carries nothing else — so a region
declared that way cannot state `wiring`, whose check needs each tag's contract to look its events up.
The `Pick` is the same narrowing plus a checkable claim.

`TProduced` is the app's own `Produced…Keys` union, for the `produced` check. It defaults to `never`,
which is the right value for a region whose islands write nothing and which still asserts
`produced: true`.

## `id`

`id: string` (`packages/core/src/archipelago.ts:202`). It is the region's runtime handle: the key
under which `defineArchipelago` files the store, the config and the slot list
(`packages/core/src/archipelago.ts:1140-1144`), the argument to `provideToArchipelago` and
`seedArchipelago` (`:683`, `:725`), the name `<motu-archipelago name="id">` resolves, and the `region`
parameter in a lagoon address. `motu archipelago verify <id>` also requires the file to live at
`<archipelagosDir>/<id>/<id>.archipelago.ts` and to be imported by the generated registry — the
`registered` check (`packages/cli/src/commands/verify.mjs:2515-2524`), and the directory layout
`readRegions` walks (`packages/cli/src/lib/eject.mjs:32-57`).

## `islands`

`islands: readonly IslandSpec<TRegion, TTag>[]` (`packages/core/src/archipelago.ts:203`). Each entry
is one island IN THIS REGION — the wiring, not the island. The same island may own a key in one
region and be a pure consumer of it in another, which is why `writes` is declared here and not on the
island (`packages/core/src/archipelago.ts:149-151`, D2).

### `slot` and `element`

```ts
{ slot: 'week-actions', element: 'x-week-actions', … }
```

`slot` is the marker name the page references (`packages/core/src/archipelago.ts:36`); `element` is
the custom-element tag to instantiate (`:45`). Slot names are motu's vocabulary and are what
`<X.Island slot>` is typed against.

### `bind` — what the island READS

```ts
bind: ['compactMode', 'isCurrentWeek', { missions: 'weekMissions', isLoading: 'weekLoading' }]
```

Prop name → region key. `BindDeclaration<TRegion>` accepts both the plain record and the short array
form, where a bare string means the prop and the key are the same word and only a RENAME needs the
map (`packages/core/src/archipelago.ts:171-183`). The key side is `keyof TRegion & string`, so a
rename in the app fails the build — the failure it prevents is the page and the archipelago naming
the same value twice with nothing linking them (`loadingReceived` in the page vs `receivedLoading` in
the store; `packages/core/src/archipelago.ts:103-114`). `bindEntries()` returns the long form whichever
was written (`:186`).

`| undefined` in the value type is not an invitation to write one: it is what lets a region be
declared with `satisfies` at all, because an array literal of differently shaped entries infers each
absent key as `?: undefined`. Readers skip falsy keys.

### `writes` — what the island OWNS

```ts
writes: {
  'week-progress': { overallProgress: 'overallProgress', completedCount: 'completedCount' },
  'missions-changed': 'weekMissions',
}
```

Event name → the store key the island owns, or a map from fields of the event's `detail` to keys
(`packages/core/src/archipelago.ts:136-158`). Declaring it does three things a handler function
cannot: it declares OWNERSHIP (nobody else may update those keys — see `producerOf`,
`packages/core/src/store.ts:147`), it makes the region's graph readable WITHOUT running it, and it is
EJECTABLE — a `useState` plus a callback prop can be generated from a mapping and cannot be generated
reliably from an arbitrary function body (`packages/cli/src/lib/eject.mjs:459-484`). Ownership is
about UPDATES, not first paint, so `writes` and a host `seed` coexist
(`packages/core/src/archipelago.ts:152-153`).

### `on` and `intents` — outputs that are NOT store writes

`on: Record<string, (detail, ctx: IslandContext) => void>` handles a CustomEvent with a function;
`ctx` carries the shared `store` and the `HostBridge`
(`packages/core/src/archipelago.ts:29-32`, `:121`). `intents: Record<string, string>` is the
declarative form of the same thing for an output that ASKS THE HOST for something — "accept these
baselines", "load more" — where the result is whatever the host then says the state is
(`packages/core/src/archipelago.ts:122-135`). A declared source answers it (`intents` on the source
instance, `packages/core/src/archipelago.ts:802`); unanswered intents fall through to the host bridge,
which is what a navigate is. Leaving a store write inside an `on` body still works and is reported:
an opaque write cannot be drawn before it fires and cannot be materialised on eject
(`packages/cli/src/commands/verify.mjs:2481-2491`).

### `reads` — a claim about a store motu does not own

`reads?: readonly string[]` names keys the island consumes without taking them as props, because the
host's own store hands them over directly — Twenty's side panel subscribing to a Jotai atom
(`packages/core/src/archipelago.ts:55-70`). `bind` is the only reader motu can see by itself; without
`reads`, such a key is written by an island, read by nobody motu knows about, and the `coupling`
check reports a real coupling as one that escapes the archipelago
(`packages/cli/src/commands/verify.mjs:2333-2339`). It is a CLAIM, not a wire — motu cannot enforce a
store it does not own (`packages/core/src/foreign-store.ts`).

### `planned: true`

```ts
{ slot: 'w-tasks', element: 'x-record-tasks', member: 'TASKS', bind: { widget: 'tasksWidget' } }
```

`planned?: boolean` marks an entry as DECLARED, NOT YET BUILT
(`packages/core/src/archipelago.ts:71-86`). Declaring a whole region up front is what makes parallel
work safe: an agent branches from an archipelago that already carries everyone else's ownership, so a
second claim on a key fails in their own branch instead of at merge. The cost, before the flag
existed, was that the region was RED in every branch until the last island landed. With it,
**ownership still counts the entry** — that is the point — while the checks that ask "does it exist
and mount?" skip it (`packages/cli/src/commands/verify.mjs:2526-2553`).

The flag REMOVES ITSELF: once the island is registered, `planned: true` is an ERROR, not a courtesy,
so a survey cannot quietly become a list of things nobody built
(`packages/cli/src/commands/verify.mjs:2536-2545`).

### `props` and island-level `slots`

`props?: Record<string, unknown>` sets static properties once on mount
(`packages/core/src/archipelago.ts:88`) — a placement decision of this page, such as
`props: { className: 'hidden lg:block' }`, keeping the component general.

`slots?: Record<string, string>` on an ISLAND fills that island's props with ANOTHER island, prop name
→ slot (`packages/core/src/archipelago.ts:89-102`):

```ts
{ slot: 'week-nav', element: 'x-week-nav', slots: { ambassador: 'ambassador-inline', summary: 'received-summary' } }
```

Two islands are two islands whether or not one sits inside the other's DOM. Before this, nesting was
expressible only in the page's JSX, so the lagoon rendered the outer island with holes. The host's own
JSX still wins where it passes the prop itself — page seeds, region fills the rest. A nested slot must
be one this region declares, or the `composition` check errors
(`packages/cli/src/commands/verify.mjs:2391-2415`).

### `member` — the app's name for a catalogue row

`member?: string` is the discriminator this island renders AS IT APPEARS IN THE DATA — Twenty's
`WidgetType.FIELDS`, a `ViewType.TABLE` — as opposed to `slot`, which is motu's name for the island
(`packages/core/src/archipelago.ts:46-54`). It defaults to `slot` when the two coincide. Keeping them
separate is what makes `checkCatalogue` possible: it compares declarations against captured rows and a
codegen'd enum, and neither has ever heard of a motu slot
(`packages/core/src/catalogue.ts`, `packages/cli/src/commands/verify.mjs:1428-1432`).

## `root`, `slots`, `hostSlots` — the arrangement, declared once

`root?: unknown` is THE REGION'S ROOT COMPONENT, the application's own, imported
(`packages/core/src/archipelago.ts:228-244`). An archipelago is the scope of one root component;
usually that is a page, and it does not have to be.

Declaring it here is what leaves ONE copy of the arrangement. Before, the prop → island mapping was
written twice — once in the page's JSX and once in a hand-written lagoon frame — with nothing
comparing them, and the frame drifted every time: peps' lagoon showed a `/forgot-password` heading
that existed nowhere in the application, and its annuaire rendered with no header at all, both under a
green PASS. With a root declared, neither side composes: the page renders `<X.Root prop={…} />` using
the APPLICATION's own prop names and never writes a slot; the lagoon renders the same component with
islands in the same props and writes no JSX at all.

`slots?: Record<string, string | { slot: string; when?: string; unless?: string }>` says which of the
root's props an ISLAND fills — the app's vocabulary on the left, motu's on the right
(`packages/core/src/archipelago.ts:245-266`):

```ts
root: ActionsPageLayout,
slots: { header: 'actions-header', weekNav: 'week-nav', actions: 'week-actions', received: 'received-actions' },
```

The object form declares EXCLUSIVE slots. Two islands can be alternatives in one position — a sign-in
form and an "expired link" banner — and the page expresses that by passing `null` for the one that
does not apply. The lagoon has no page to do that, so it mounted both and previewed a screen the
application can never show. `when` / `unless` name the region key that decides, and are the LAGOON's
condition only (`packages/core/src/archipelago.ts:251-265`; the runtime predicate is `slotShows`,
`:529`, and `slotNameOf` reads the name out of either form, `:519`).

`hostSlots?: Record<string, unknown>` maps root props the HOST fills to the application component that
fills them (`packages/core/src/archipelago.ts:267-278`):

```ts
hostSlots: { header: DirectoryHeader },
```

For region UI that reads no region key and writes none — a title, a link and two buttons acting on the
member. Islanding it would invent an island that binds nothing. **A COMPONENT, never a hole**:
`hostSlots: ['header']` with nothing behind it blesses exactly the bug this replaces, the lagoon
rendering nothing there and calling it correct. Naming the component means the preview shows the real
one and only its PROPS are supplied as data.

A region composed by a hand-written frame instead is reported by the `region-root` check, as an error
once a project sets `"regionRoot": "required"` in its config
(`packages/cli/src/commands/verify.mjs:2240-2257`; see [04 — Configuration](04-configuration.md)).

## `layout`

`layout?: string` is the "new design" layout: HTML arranging the island slots, rendered natively by
`<motu-archipelago name="id">` in the standalone app and swapped in as a whole region when previewing
inside a legacy app (`packages/core/src/archipelago.ts:279-284`). It is registered by
`defineArchipelago` and read back with `getArchipelagoLayout(id)`
(`packages/core/src/archipelago.ts:1143-1145`, `:591`). This is the OCEAN's form of arrangement:
under a modern host the page owns the arrangement and `root` + `slots` carries it, so the region
declares no layout (host modes are
[12 — Hosts and adapters](12-hosts-and-adapters.md)).

```ts
layout: `
<div class="gm-arch">
  <motu-island slot="user-search" theme="motu" fit="native"></motu-island>
</div>`,
```
— `demo-app/src/archipelagos/users/users.archipelago.ts:20`

## `membership: 'catalogue'`

`membership?: 'placed' | 'catalogue'`, default `'placed'`
(`packages/core/src/archipelago.ts:285-301`). It declares WHERE THE ISLAND LIST COMES FROM.

- `placed`: the page names its islands in source — `<X.Island slot="…">` — and every declared slot
  must appear there. That is what makes `motu integrate check` able to ask "is this wired".
- `catalogue`: the region's members are decided at RUNTIME, from data. Twenty's record page renders
  widgets from a database row through a `WidgetType` enum — users add, remove, drag and resize them —
  so there is no placement in source to check, and asking for one produces three findings that cannot
  be true or false.

What stays checkable is the CONTRACT: every type the layout may contain declares what it reads and
writes, and ownership still has exactly one owner per key. `catalogueCheck` compares the declared
`member` values against the app's own captured payloads and the enum its codegen emits, supplied by
`<id>.evidence.ts` as `export const capture = { universe, present }`
(`packages/cli/src/commands/verify.mjs:1420-1432`); a catalogue region where no island declares a
`member` is a warning, because nothing ties a declaration to a data row (`:1431`). Evidence files are
[10 — Evidence and testing](10-evidence-and-testing.md).

## `coverage.enums`

`coverage?: { enums?: readonly (keyof TRegion & string)[] }` names which of the region's keys are
CLOSED SETS for the production coverage fold (`packages/core/src/archipelago.ts:215-227`):

```ts
coverage: { enums: ['viewMode'] },
```
— `host-app/motu/src/archipelagos/review/review.archipelago.ts:41`

Declared on the region rather than in `motu.config.json` because it is a fact about the KEY —
`viewMode` is one of three words wherever this region is mounted — and it travels with the region
rather than with a deployment. **OPT-IN PER KEY, never inferred**: a fingerprint reduces every other
value to a category precisely so that nothing identifying survives it, and motu cannot tell an enum
from an email address by looking at one string. `defineArchipelago` offers the list to the coverage
installer, which only exists if the generated registry imported `@motu/coverage`
(`packages/core/src/archipelago.ts:1149-1155`; `packages/core/src/sandbox.ts`). The fold itself is
[09 — Coverage](09-coverage.md).

## `sources` and channels — declaring the inbound seam

`writes` names who UPDATES a key. The other direction had no name: a key bound by an island and
written by no island was "host-fed" — derived, anonymous, unenforceable — so nothing could say that
the page and the lagoon must feed it from the SAME logic
(`packages/core/src/archipelago.ts:302-341`). `sources` closes that. Each entry points at an
APPLICATION module and lists the keys it produces, either as the source object itself (a value import,
so the module a channel installs and the module the region declares are the same object by
construction) or as a `{ module, produces }` pair for a key no channel installs:

```ts
sources: {
  week: weekSource,
  revenue: { module: '@/lib/services/revenue-thanks', produces: ['monthEur'] },
},
```

A **channel** is what installs one. `ArchipelagoOptions.channels` (and `createRegion`'s `channels`)
takes `Channel[]` — `(ctx: { store }) => (() => void) | void`, the inbound counterpart to the
`HostBridge` (`packages/core/src/channel.ts:15-20`, `packages/core/src/archipelago.ts:627-633`).
`installChannels` wires them at `defineArchipelago` (`packages/core/src/archipelago.ts:1208`).
Channels are not hand-written: `channelFrom({ to, id, args })` builds one from a declared source, and
the type system checks the archipelago declares that source id, that the module exports the creator,
and that the arguments match its signature (`packages/core/src/archipelago.ts:956-1010`). A source
declared by module name only throws — there is nothing to install (`:975-979`). `rawChannel(reason,
channel)` is the escape hatch and it costs a sentence: an empty reason throws
(`packages/core/src/archipelago.ts:913-916`).

The channel's publish loop is where ownership meets the inbound seam: a key an island owns is SEEDED,
not written, because writing it from the host is the violation the store guard reports
(`packages/core/src/archipelago.ts:988-993`).

### This is not the only inbound seam, and it answers a different question

A channel is about OWNERSHIP: which module feeds a host-fed key, so the page and the lagoon cannot
answer the same coupling differently. It is a declaration.

Where the fake DATA enters is a separate axis, one layer below, and motu now mocks at the WIRE:
`@motu/runtime/postgrest-fetch` is a fake `fetch` injected into the app's database client, so the
app's own services and repositories execute for real against synthetic rows
([11 — Contract and backend](11-contract-and-backend.md)). The two compose — a region can declare a
source AND have that source's reads answered at the wire — and neither replaces the other. What wire
mocking did change is the ARGUMENT for extracting a source: a port used to exist partly so the lagoon
could substitute data, and the fake fetch now does that beneath the real service. What is left is
orchestration across calls — a generation guard, a debounce, reset-on-new-search — which is an
application decision, not a motu rule.

### `sourced` is opt-in, and cannot always be turned on

`RegionSourcesOk` — the `sourced` property of the checks argument — asserts that every host-fed key
has a declared source. Being optional is not only about regions that declare no `sources`: a region
that declares one may still be unable to assert it, because some keys have no module to name.

Two shapes, from motu's own host app. `repos` in the review region is fetched by the page itself
(`listRepos(cfg)` in an effect), so `sourced` reports it as host-fed and claimed by nobody; that one
is answerable, by extracting the source the check is asking for. `authError` and `returnTo` in the
signin region arrive on the QUERY STRING and the page hands them down — there is no producing module
at all, and the name-only form does not help, because `integrate check` holds it to a module a host
file actually imports (`source`), and declaring a source for a key the page `provide()`s is itself an
error (`source-owned`).

So: turn `sourced` on for a region whose host-fed keys all come from modules. A region fed by its
route cannot currently satisfy it, and that is a limit of the mechanism rather than a fact about the
region.

## The type-level guards

These are set operations over declarations the compiler already holds, so they can be a build error
instead of a report someone has to run — in the same loop as the edit that caused them. They are the
declaration's SECOND ARGUMENT (`packages/core/src/archipelago.ts:568-577`):

```ts
export const reviewArchipelago = archipelago<ReviewRegion, ElementTypes, ProducedReviewKeys>()(
  { id: 'review', /* … */ } as const,
  { ownership: true, wiring: true, produced: true },
);
```

| Property | Type | Required |
|---|---|---|
| `ownership` | `RegionOwnershipOk<A>` | **yes** — the one check every region can make |
| `wiring` | `RegionWiringOk<A, TElements>` | no — needs `TElements` given as a map |
| `produced` | `ProducedKeysAre<A, TProduced>` | no |
| `sourced` | `RegionSourcesOk<A>` | no — nothing to say when a region declares no `sources` |

Each property's TYPE is the check's result, so `true` is the only value that compiles. Each resolves
to `true` when it holds and to a LABELLED TUPLE when it does not, and the error lands on that
property, naming the offending keys:

```
review.archipelago.ts(98,34): error TS2322: Type 'boolean' is not assignable to type
  '["declared by the app but not in any `produces`:", "viewMode"]'.
```

**Why an argument and not part of the signature.** Every check depends on `A`, which is inferred from
the config, so the two ways of folding them into `archipelago()` that look natural both fail. A
self-referential CONSTRAINT reports `argument of type { id: 'review', … } is not assignable`, burying
the labelled tuple inside a structural mismatch over the whole literal. A defaulted type parameter
(`_Checks extends true = RegionOwnershipOk<A>`) is checked against its constraint GENERICALLY, at the
declaration, where the conditional resolves to the union of both branches — so it errors on motu's
own line and never on the call. A second argument is the one position where `A` is already inferred
and the error lands on the `true` that failed.

**Write `as const` on the config.** The checks are derived from the config's *literal* type — slot names
as literals, and the islands as a TUPLE, because two islands writing one key are only distinguishable
while they are still two members of a tuple. `const A` asks TypeScript for that, but it is BEST EFFORT:
past a certain config size the compiler stops and falls back to the CONSTRAINT, which is a legal
outcome and therefore silent. The constraint declares `writes?:` as optional, every derived key set
comes back `never`, and every check passes without checking anything. `as const` makes the argument
narrow before inference, so there is nothing left to give up on.

Forgetting it is now a build error rather than a green row — a tuple's `length` is a literal and a
plain array's is `number`, which is the whole detector (`ConstInferenceLost`,
`packages/core/src/archipelago.ts`). It reports on `ownership`, and says what to add.

This was found in peps, where two large regions had crossed the threshold: `ownership`, `wiring` and
`sourced` were all passing vacuously and only `produced` could notice, because it alone compares
against a type declared outside the config. With the detector in place, seven more regions turned out
to be in the same state.

**Why required.** These used to be `const _x: Check<typeof arch> = true` lines below the config, and
the repetition was not the problem: a file that omitted all three looked identical to one that
asserted all three, so the guards were opt-in by silence. `ownership` being a required property is
what that shape could not express. The optional ones stay optional because adoption is per region —
omitting one skips it, exactly as omitting its `const` used to.

Optional does mean forgettable, and that part did not improve: a missing `produced` property is as
invisible as the missing `const` was.

### The derived key sets

| Type | Definition | Line |
|---|---|---|
| `ProducedKeys<A>` | every key some island's `writes` claims | `packages/core/src/archipelago.ts:363` |
| `BoundKeys<A>` | every key some island's `bind` reads | `:372` |
| `HostFedKeys<A>` | `Exclude<BoundKeys, ProducedKeys>` — bound, written by none | `:387` |
| `SourcedKeys<A>` | every key a declared source claims to produce | `:390` |
| `DuplicateProducers<A>` | a key written by two different ELEMENTS | `:433` |

`HostFedKeys` is why nothing can be "unowned": a key either has an island that writes it, or the host
feeds it, and there is no third case. The runtime twin is `hostFedKeys(config)`.

### `RegionOwnershipOk<A>`

`packages/core/src/archipelago.ts:451`. One key, one producer — checked at compile time, in the editor,
before any agent runs anything:

```ts
export type RegionOwnershipOk<A> = [DuplicateProducers<A>] extends [never]
  ? true
  : ['written by more than one island — a key has ONE producer:', DuplicateProducers<A>];
```

Grouped by ELEMENT, not by slot: one island placed twice (peps' filter panel, desktop + mobile) is one
producer and stays legal. `ProducedKeys` cannot answer this on its own — it is a union over every
island, so two writers of one key collapse into the same member — which is why `DupWalk` walks the
island tuple pairwise.

**It used to assert nothing.** The old form tested `UnownedKeys` and `DisputedKeys`, and both were
`never` BY CONSTRUCTION: `UnownedKeys` excluded `HostFedKeys`, which is itself
`Exclude<BoundKeys, ProducedKeys>`, so every bound key fell on one side or the other and nothing was
ever left over; `DisputedKeys` needed `provides`, which no region had used since `HostFedKeys` began
deriving it. So the one REQUIRED check on every region resolved to `true` for every region that
exists, and a second island claiming a key compiled cleanly. Found by writing exactly that and
watching `tsc` pass — the CLI's own `ownership` check had been carrying the rule alone.

What CANNOT move here, and is why `verify` still exists: whether a declared output ever fires, and
whether a declaration is HONEST. Both are runtime facts.

### `ProducedKeysAre<A, Expected>`

`packages/core/src/archipelago.ts:488-501`. Cross-checks the archipelago's `writes` against the
APP-SIDE host/produced split, which is the thing that actually makes a page's assignment illegal. The
page compiles against its own `Omit` — `HostRegion<TRegion, TProduced>` in `@motu/types`
(`packages/types/src/index.ts:59`), whose motu-side twin is `HostRegionOf<R, A>`
(`packages/core/src/archipelago.ts:486`) — and nothing would otherwise keep that `Omit` in step with
the declarations. This line does, and it lives on motu's side of the boundary, so it goes when motu
goes. A drift on either side yields a labelled tuple: `'declared by the app but not in any
\`produces\`'` or `'in \`produces\` but still assignable by the host'`.

The failure it prevents: a page that keeps a key in the half it may assign after an island has taken
ownership of it, so the page's own state and the producer's both write the value and neither is the
source of truth.

### `RegionWiringOk<A, TElements>`

`packages/core/src/archipelago.ts:436-455`. Every event an island entry wires — in `writes` or in `on`
— must be one the island's own contract declares (`EventsOf`, `:432`). This is the last silently-dead
declaration: `writes: { 'week-progres': 'x' }` is a well-typed mapping onto a well-typed key, and
nothing about it is wrong except that no island will ever dispatch it. It needs the project's tag →
element-spec map, which `motu island sync` generates beside the registry; pass it as `TElements`. It
is type-only, so the archipelago gains no runtime dependency on the island modules. Checked PER
ISLAND only when the config is declared through `archipelago()` — see the call, above.

### `RegionSourcesOk<A>`

`packages/core/src/archipelago.ts:397-401`. Every host-fed key has a declared source. It resolves to
`true` while a region declares no `sources` at all — adoption is per region — and once it declares
one, every host-fed key has to be accounted for, or the tuple names those that are not. Which is why
declaring a source does not automatically let you assert it: see [`sourced` is opt-in, and cannot
always be turned on](#sourced-is-opt-in-and-cannot-always-be-turned-on) above.

Its property on the checks argument is spelled `sourced`, not `sources`: the CLI's text readers find
a config's declared sources by looking for `sources:` (`packages/cli/src/lib/eject.mjs:184`), and a
second `sources:` in the same file would be the first thing they found.

## The host side: `createRegion`

```ts
export const Signin = createRegion(signinArchipelago, {
  elements: ELEMENT_REGISTRY,
  useHost: () => nextHostBridge(useRouter()),
});
```
— `host-app/components/motu/signin-region.tsx:16`

`createRegion(config, opts)` binds the archipelago to the environment it runs in, ONCE, at the
composition root (`packages/react/src/create-region.tsx:97-100`). What it does not do is merge the
two: the archipelago declares the wiring, the root chooses the transport and the host bridge, and that
split is what lets the lagoon mount the same region against mocks. The region type is recovered from
the brand (`RegionOf<C>`) and the slot union from the config's own declarations (`SlotsOf<C>`), so
neither is named twice and a slot typo is a build error rather than a console warning
(`packages/react/src/create-region.tsx:90-100`).

`CreateRegionOptions` (`packages/react/src/create-region.tsx:30-47`):

| Option | Meaning |
|---|---|
| `elements: ElementSpec[]` | the project's element registry — the same one the lagoon uses (`:31-32`) |
| `transport?: Transport` | how contract calls leave; applied once via `configure()` at module scope, because a transport is a property of this composition root and not of a render (`:33-37`, `:101-102`) |
| `useHost?: () => HostBridge` | the outward seam AS A HOOK — a React host usually needs one (`nextHostBridge(useRouter())`) and the binding is created at module scope where hooks cannot run (`:38-42`, `:104-105`) |
| `seed?: Record<string, unknown>` | initial store contents, so bound islands render meaningfully on first paint (`:43-44`) |
| `channels?: Channel[]` | inbound channels: host signals mirrored into the store (`:45-46`) |

It returns seven members (`packages/react/src/create-region.tsx:168-176`, typed by
`RegionBinding<TRegion, TSlot, TRootProps>` at `:49-83`):

```ts
return {
  Region,
  Root: Root as …,
  Island: Island as …,
  useRegion: () => useRegionSnapshot<RegionOf<C>>(),
  seed: (key, value) => seedArchipelago(config.id, key, value),
  provide: (key, value) => provideToArchipelago(config.id, key, value),
  id: config.id,
};
```

- **`Region`** — `(props: { children? }) => ReactElement`. Wraps the host's tree: declares the
  archipelago and puts its store in context, forwarding `elements`, `host`, `seed` and `channels` to
  `ArchipelagoProvider` (`:51`, `:107-114`).
- **`Root`** — `(props: TRootProps) => ReactElement`. The archipelago's `root`, rendered with its
  declared props filled. Every prop is decided by the ARCHIPELAGO: a prop named in `slots` is wrapped
  in that island, a prop in `hostSlots` is rendered by the declared component with the props given
  here, anything else is passed straight through (`:52-66`, `:116-166`). Three rules live in that
  loop and each names a real failure: a `null` value is left NULL rather than mounted, because an
  `<Island>` with no child renders the registered component from the store and would put a panel on
  screen at the moment the page said not to (`:142-150`); a declared slot the page never mentions is
  NOT filled in for it — that is the `integrate check`'s question, not a silent substitution, and the
  LAGOON does the opposite because there is no page there to have an opinion (`:159-165`); a region
  with no `root` throws with the two ways out (`:132-137`). `Root` does NOT wrap `<X.Region>`: a page
  that reads the region to build those props has to be under the provider already, and a component
  cannot sit inside a provider it renders itself (`:61-64`). The prop type is `RootPropsOf<C>` —
  island slots as `ReactNode`, host slots as their component's own props (`:85-88`).
- **`Island`** — `(props: { slot: TSlot; children?; props?; className?; fit? }) => ReactElement`.
  `<Island slot>` for THIS region, with the slot checked against the ones it declares (`:67-74`).
- **`useRegion`** — `() => Partial<TRegion>`. The region as a typed object, rebuilt on every store
  change: destructure it, do not put it in a dependency list (`:75-76`; the underlying hook is
  `packages/react/src/react-island.tsx:280`, over `useSyncExternalStore`).
- **`seed`** — `<K extends keyof TRegion & string>(key: K, value: TRegion[K]) => void`. Establish a
  key's starting value; **the only legitimate way to touch a key an island produces** (`:77-78`,
  delegating to `seedArchipelago`, `packages/core/src/archipelago.ts:725`).
- **`provide`** — same signature, for a key the region declares as host-owned (`:79-80`, delegating to
  `provideToArchipelago`, `packages/core/src/archipelago.ts:683`, which throws for a key a declared
  source produces).
- **`id`** — the archipelago's id, for the rare call that still needs it (`:81-82`).

`seed` vs `provide` is the ownership boundary, not a stylistic choice — see
[`writes`](#writes--what-the-island-owns) above. Which of `Root` and `Island` a page
should reach for, and in what order to adopt them, is
[06 — Composition and adoption](06-composition-and-adoption.md). What each declaration above is
checked by is [07 — Checks and verification](07-checks-and-verification.md).
