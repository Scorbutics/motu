# Key ownership — the design record

**Provenance: this record was RECONSTRUCTED.** The original `docs/plan-key-ownership.md` was cited
from source but never present in the repository. What follows was rebuilt from the code that cites it
— `packages/core/src/store.ts:44` and `:52`, `packages/core/src/archipelago.ts:141`,
`packages/cli/src/lib/eject.mjs:2`, `packages/cli/src/commands/verify.mjs:2323`,
`packages/react/src/react-island.tsx:246` and `:392`, `CLAUDE.md:125` — plus the numbered decisions
those sites quote (D1–D5, D8–D11). Each decision below names the citation that pins it, or is marked
`reconstructed, unpinned` where the number appears in no citation and the rule was recovered from the
enforcing code alone. Where this record and the code disagree, **the code is right and this file is
the bug**.

## What a key is

A key is one named value in a region's store: a string on `Store`'s backing record
(`packages/core/src/store.ts:226-250`), typed as `keyof TRegion & string` wherever an archipelago
mentions one (`packages/core/src/archipelago.ts:115`, `:158`). Keys are how islands in one region
share state, and the store is the ONLY place every write passes through — which is why it is where a
write from the wrong source is caught (`packages/core/src/store.ts:44-47`).

Three declarations, all static, say who stands where
(`packages/cli/src/commands/verify.mjs:2323-2328`):

```
provides: [...]         the host feeds these
writes:   { ev: key }   an island owns these, and the mapping is what makes them ejectable
bind:     { prop: key } who reads
```

## The producer rule

**A key has exactly one producer, and only its producer may update it.**

`writes` on a region's island entry declares it (`packages/core/src/archipelago.ts:136-158`).
`defineArchipelago` folds every entry into a `key -> slots` map and hands it to the store
(`packages/core/src/archipelago.ts:1105-1126`); the store keeps it in a `WeakMap` and consults it on
every `set` (`packages/core/src/store.ts:49`, `:283-301`):

```ts
const owners = producerOfKey.get(this)?.get(key);
const owner = owners?.[0];
if (owners && writeSource && !owners.includes(writeSource) && writeSource !== 'seed') {
```

The failure it prevents is a page wiring two islands together through its own state
(`packages/core/src/archipelago.ts:140-142`): island A emits, the page computes something from it,
the page passes the result as a prop to island B, and the coupling is real, invisible to the region,
and duplicated in whatever else derives the same number.

The guard is **debug-only, loud, once per `key:source`, and never fatal** — it runs in a browser,
where throwing would take the page down over a diagnostic (`packages/core/src/store.ts:283-301`).
That is also why it needs a check to carry it out of the console; see check 3 below.

## Who may write, and by what name

Writes are attributed by a framework-set source string (`runWithWriteSource`,
`packages/core/src/store.ts:169-181`). The sources that exist:

| `writeSource` | Set by | Allowed to write |
|---|---|---|
| a slot name | the island mount paths, around a declared output | the keys that slot's `writes` claims |
| `'host'` | `provideToArchipelago` (`packages/core/src/archipelago.ts:707-709`) | host-fed keys only |
| `'seed'` | `seedArchipelago` (`packages/core/src/archipelago.ts:731`) | **any** key, including a produced one |
| `null` | anything unattributed (a bare `store.set`) | nothing — reported as "unattributed host code" |

## The decisions

### D1 — Removal is an EJECT, not an unwrap

*Pinned: `packages/cli/src/lib/eject.mjs:2`; `packages/react/src/react-island.tsx:246`;
`peps:app/dashboard/actions/page.tsx:61`.*

`eject.mjs:2` states it as: *"materialise the wiring the archipelago was holding, so removing motu is
a no-op for the APP rather than for the framework's convenience"*.

Ownership takes something away from the host: once a key is an island's to produce, the page stops
deriving it and reads it instead. That is only safe if motu can hand the coupling back. So removal
stops being "delete motu's files, unwrap motu's tags" — which works only while the host also keeps
its own copy of every coupling, i.e. exactly the duplication ownership exists to remove — and becomes
a codemod (`packages/cli/src/lib/eject.mjs:1-19`):

```
const overallProgress = useRegionValue('overallProgress') ?? 0    // read
     ->  const [overallProgress, setOverallProgress] = useState(0)
seedArchipelago(arch, 'weekMissions', m)                          // seed
     ->  setWeekMissions(m)
<Island slot="week-actions"><WeekActionsView … />                 // producer
     ->  <WeekActionsView … onProgress={(d) => { setOverallProgress(d.overallProgress); … }} />
```

Two consequences the rest of the design leans on:

- **The page reading region state is legal.** `useRegionValue` / `useRegion` are "the direction that
  only becomes legal once removal is an EJECT" (`packages/react/src/react-island.tsx:244-252`). A
  page that handed a value's ownership to an island still has chrome of its own to render with it;
  before ownership it derived the value a second time, which is two sources of truth for one number.
- **`writes` must be a MAPPING, not a function.** A `useState` + callback prop can be generated from
  `{ event: key }`; it cannot be generated reliably from an arbitrary handler body
  (`packages/core/src/archipelago.ts:144-147`), which is what `ejectFile` walks
  (`packages/cli/src/lib/eject.mjs:459-484`). Hence `on` keeps only what has no store effect.

`eject` is honest about its limits: it is a codemod, not a refactor, and may leave state the page also
keeps under another name (`packages/cli/src/lib/eject.mjs:18-19`).

### D2 — Ownership is declared on the REGION's wiring, not on the island

*Pinned: `packages/core/src/archipelago.ts:150`.*

> Declared on the region's wiring rather than on the island: the same island can own a key in one
> region and be a pure consumer of it in another (D2).

`writes` therefore lives in `IslandSpec` as it appears inside an archipelago's `islands` array
(`packages/core/src/archipelago.ts:34`, `:158`), never in the island's own definition. The island
declares an OUTPUT in its contract; the region decides whether that output owns a key here.
`RegionWiringOk` is what keeps the two honest — every event a region wires must be one the island's
contract declares (`packages/core/src/archipelago.ts:436-455`).

### D3 — Ownership is adopted PER KEY

*Pinned: `packages/cli/src/commands/verify.mjs:2464`.*

> A warning, not an error: ownership is adopted per key (D3), so an un-migrated region is not broken —
> it is un-migrated, and this is its backlog.

A key that is read but claimed by nobody is a `warn` on the `ownership` check
(`packages/cli/src/commands/verify.mjs:2463-2472`); a key claimed TWICE is an `error` (`:2455-2462`).
The same split exists at the type level: `UnownedKeys` and `DisputedKeys` are separate arms of
`RegionOwnershipOk` (`packages/core/src/archipelago.ts:404-429`). `RegionSourcesOk` adopts the same
posture for the inbound half: `true` while a region declares no `sources` at all, strict from the
first one (`packages/core/src/archipelago.ts:391-401`).

### D4 — Ownership is about UPDATES, not first paint

*Pinned: `packages/core/src/archipelago.ts:153`, `:717`, `:935`, `:1105`;
`peps:app/dashboard/actions/page.tsx:191`.*

> Ownership is about UPDATES, not first paint — a key is normally host-seeded and island-produced
> afterwards (D4), so `seed` and this coexist. (`archipelago.ts:152-153`)

The seam is the two host entry points, which are different acts and only look alike:

- **`provide()`** — the host feeding a key it owns. `provideToArchipelago` tags the write `'host'`
  (`packages/core/src/archipelago.ts:683-710`), which the ownership guard rejects for a produced key.
- **`seed()`** — the host saying "this is where the data starts", *"the only legitimate way to touch a
  produced key from outside"* (`packages/core/src/archipelago.ts:712-732`). It tags the write
  `'seed'`, which the guard lets through (`packages/core/src/store.ts:291`).

First paint never trips the guard for another reason too: `defineArchipelago`'s `opts.seed` goes
through the `Store` constructor rather than `set`
(`packages/core/src/archipelago.ts:1102-1105`, `packages/core/src/store.ts:248-250`). The channel
publish loop applies the same split — a key an island owns is seeded, never written
(`packages/core/src/archipelago.ts:920-936`).

### D5 — Owned keys are not the page's to publish

*Pinned: `packages/react/src/react-island.tsx:392`;
`peps:app/dashboard/actions/page.tsx:323`.*

The peps citation states the consequence exactly: *"`week-actions` produces these three, so motu will
not publish them and the store keeps the producer's numbers"*. It sits on a `<NetworkStatsBanner>`
whose `overallProgress`, `completedCount` and `applicableCount` props are passed for FIRST PAINT only.

The mechanism: a React host publishes an island's bound props into the store, and that loop refuses a
key with a declared producer (`packages/react/src/react-island.tsx:387-403`):

```ts
// OWNED KEYS ARE NOT THE PAGE'S TO PUBLISH (docs/plan-key-ownership.md, D5).
const owner = producerOf(ctx.store, key);
if (owner) {
  warnUnpublished(slot, key, owner);
  continue;
}
```

The prop still renders THIS island and nothing else; the store keeps whatever the producer put there
(`packages/react/src/react-island.tsx:118-127`). This is where a host-mediated coupling used to become
invisible: the page computes a value from what ANOTHER island did, passes it as a prop, and the loop
published it under the RECEIVING island's name — so the store looked fed and the real producer was
nowhere.

The same rule has a compile-time form. The page compiles against
`HostRegion<TRegion, TProduced>` = `Omit<TRegion, TProduced>` (`packages/types/src/index.ts:59`) —
*"using it is what makes a laundered value a compile error: the page cannot claim a key another island
produces, so it cannot pass one on to a third island behind the archipelago's back"*
(`packages/types/src/index.ts:56-58`). `ProducedKeysAre` asserts that the app's split and the
archipelago's declarations are the same set (`packages/core/src/archipelago.ts:488-501`), and
`HostRegionOf` is motu's own twin of the `Omit` (`:486`).

### D6 — One producer per key; a producer is an IMPLEMENTATION, not a slot

*Reconstructed, unpinned — recovered from `packages/core/src/archipelago.ts:1105-1126`,
`packages/core/src/store.ts:136-154`, `packages/cli/src/commands/verify.mjs:2417-2449`.*

Two SLOTS may share a producer; two IMPLEMENTATIONS may not. peps caught the first version of this
rule as a false positive: its filter panel is one island placed twice (`filters-desktop`,
`filters-mobile`), both writing `filters` — which is exactly what "two slots, one island" has to mean
(`packages/cli/src/commands/verify.mjs:2428-2431`). So `declareProducers` normalises to a LIST of
slots (`packages/core/src/store.ts:136-144`), `defineArchipelago` groups by `element` and only treats a
different element as a genuine dispute (`packages/core/src/archipelago.ts:1112-1126`), and the static
check groups writers by element before erroring (`packages/cli/src/commands/verify.mjs:2432-2449`).

The check is grouped **per island, not over the file**, and that was a real miss:
`declaredWritten` is a `Set`, so two islands claiming the same key collapsed into one entry and the
region reported "4/4 bound key(s) owned" for a key with two owners — caught only later, at runtime, by
the store guard (`packages/cli/src/commands/verify.mjs:2419-2421`).

It has to be STATIC and in the fast loop, because of when the conflict appears: two agents each add an
island in their own branch, neither branch is wrong alone, and the conflict surfaces where the two
declarations meet. Declaring the region UP FRONT — every slot and owner before implementation, with
`planned: true` on what nobody has built — moves that meeting into each agent's own first `motu check`
(`packages/cli/src/commands/verify.mjs:2423-2427`, `packages/core/src/archipelago.ts:71-86`).

### D7 — Host-fed is DERIVED, and every host-fed key has one declared source

*Reconstructed, unpinned — recovered from `packages/core/src/archipelago.ts:204-214`, `:342-401`,
`:683-707`, `packages/cli/src/commands/verify.mjs:2340-2342`.*

Host-fed is what is LEFT after ownership: `HostFedKeys<A> = Exclude<BoundKeys<A>, ProducedKeys<A>>`
(`packages/core/src/archipelago.ts:380`), with the value-level twin `hostFedKeys(config)` (`:1088`)
and the same subtraction in `verify` (`packages/cli/src/commands/verify.mjs:2340-2342`). This is why
nothing can be "unowned" any more — a key either has an island that writes it or the host feeds it,
and there is no third case (`packages/core/src/archipelago.ts:374-380`). `provides` survives only for
the case derivation cannot see, a key the host feeds that no island binds; listing the rest restated a
subtraction the compiler can do, and had to be maintained (`:175-185`).

Anonymity was the gap on the inbound side: nothing could say that the page and the lagoon must feed a
key from the SAME logic, so they drifted (`packages/core/src/archipelago.ts:302-323`). `sources` names
the producer of each host-fed key, `RegionSourcesOk` makes an unaccounted one a build error (`:362`),
and `provide()` REFUSES a key a declared source produces
(`packages/core/src/archipelago.ts:683-707`):

```
motu: "<key>" is produced by the declared source "<source>" of archipelago "<id>", so the host cannot
provide() it. Install the source instead — the same call the lagoon makes …
```

Same rule, both sides: the lagoon lost its expression position for hand-written orchestration when
`channelFrom` stopped taking a factory, and the page lost its when this threw.

### D8 — The region's shape is the APP's type, referenced not restated

*Pinned: `packages/cli/src/commands/verify.mjs:2267`;
`peps:motu/src/archipelagos/actions/actions.archipelago.ts:23`.*

> The region's declared shape (D8). Under a host that owns its own page state, the page and the
> archipelago otherwise name the same values twice with nothing linking them — peps' page called it
> `loadingReceived` while the store key was `receivedLoading`. Requiring the parameter makes the app's
> own type the single vocabulary, and a rename becomes a compile error.

`TRegion` contains no motu import and erases at runtime, so it survives motu's removal
(`packages/core/src/archipelago.ts:161-170`) — which is what lets eject type the state it generates
with the app's own type (`packages/cli/src/lib/eject.mjs:50-53`). The `region-type` check requires the
parameter under a modern host, warns rather than errors while the region has no islands yet, and is
SKIPPED on an ocean, where region state lives in `$scope` and there is no second declaration to drift
against (`packages/cli/src/commands/verify.mjs:2267-2296`).

### D9 — The arrangement is the app's

*Pinned: `peps:motu/src/archipelagos/actions/actions.archipelago.ts:190`
— "No layout: the islands are placed by the page, and the arrangement is the app's (D9)."*

Ownership's sibling for composition. Under a modern host the region declares `root` (the
application's own component, imported) and `slots` (prop → island), and neither the page nor the
lagoon composes: the page passes the app's prop names and never writes a slot, the lagoon renders the
same component from the same map (`packages/core/src/archipelago.ts:228-266`,
`packages/react/src/create-region.tsx:116-166`). `layout` — motu arranging the islands itself
(`packages/core/src/archipelago.ts:284`) — is the ocean's form, where there is no app component to
name. The failure a second description caused: peps' lagoon frame showed a `/forgot-password` heading
that existed nowhere in the application, and its annuaire rendered with no header at all, both under a
green PASS (`packages/core/src/archipelago.ts:234-239`). The `region-root` check names a hand-written
frame, and errors on it once a project sets `"regionRoot": "required"`
(`packages/cli/src/commands/verify.mjs:2240-2257`). Declaration details are
[05 — Archipelagos and regions](05-archipelagos-and-regions.md); the adoption path is
[06 — Composition and adoption](06-composition-and-adoption.md).

### D10 — A seed is re-established on every refetch, and repeated seeding is a smell, not an error

*Pinned: `peps:app/dashboard/actions/page.tsx:191` — "The week's list is
the actions island's to UPDATE, so the page cannot hand it over as a prop — it SEEDS it, here and on
every week change (docs/plan-key-ownership.md, D4/D10)."*

D4 makes `seed` legal; D10 says it is legal REPEATEDLY, and where the line is
(`packages/core/src/archipelago.ts:712-732`):

> A page that fetches the week and then lets the island mutate it needs exactly this, and needs it
> again on every refetch — otherwise the store keeps the island's stale list and the host's new one
> never lands.
>
> … A host that seeds the same key over and over is deriving it, not seeding it — that is the
> laundering smell in a new hat, and it is worth **reporting rather than blocking**.

Reporting rather than blocking is the whole posture: provenance is not decidable at a store write, so
the runtime records a suspicion (check 4) instead of refusing the write.

### D11 — A coupling that leaves the page is out of scope

*Pinned: `packages/cli/src/commands/verify.mjs:2365`.*

> Either its reader is an island on this page that is not a member yet, or it is cross-page, which the
> lagoon does not verify (D11) and the store does not survive.

A region's store is per-region and per-mount (`packages/core/src/archipelago.ts:1102`,
`:1140`), so a key written here and read on another page is not a coupling motu holds. The `coupling`
check reports a written-but-unread key as a warning naming both possibilities
(`packages/cli/src/commands/verify.mjs:2359-2367`) — and it is the check that found the real bug:
`newReceivedCount` was written for a reader on the same page that had been left out because the
boundary followed a DOM subtree rather than the page (`:2307-2310`).

## Laundering

*`packages/core/src/store.ts:52-56`, cited as "docs/plan-key-ownership.md, verify check 4".*

> Ownership makes bypass impossible; it cannot make a declaration HONEST. A key declared host-fed but
> really derived from what an island did still passes every check — the page computes it, provides it,
> and the region looks fed from outside. What gives it away is TIMING: the host writing a bound key
> moments after an island emitted. Undecidable statically, cheap to notice at runtime.

The detector is in `Store.set` (`packages/core/src/store.ts:302-318`). Four conditions, each one paid
for by a false positive:

1. the key has declared READERS (`declareReaders`, `packages/core/src/store.ts:131-133`);
2. the write is external — `writeSource` is `null` or `'host'`;
3. it is an OVERWRITE (`wasSet`) — the first value a key ever gets is the host establishing the
   region, and reading that as "the page answered the island" was the loudest false positive;
4. the region has SETTLED — `forceSettled`, or more than 2000 ms since the store was built — because
   at mount some island has always just emitted;

and then a gap of ≤ 1500 ms behind the last declared output, deduplicated per `key` + `slot`.
`resetLaunderingSuspects()` sets `forceSettled` and is the harness's explicit statement that setup is
over (`packages/core/src/store.ts:113-128`). Suspects reach the outside through
`globalThis.__motuSuspects` (`packages/core/src/store.ts:437-441`).

The static cousin is an OPAQUE WRITE — a `store.set` left inside an `on` handler. It updates a key,
but nothing can draw it in the region graph and no wiring can be generated from it when motu is
removed, so `verify` names it (`packages/cli/src/commands/verify.mjs:2481-2491`).

A near-relative worth not confusing with laundering: `expectedForeignWriter`, for a store motu does
NOT own. There, one declared output explains ONE write and the expectation is CONSUMED — *"an
expectation is a receipt, not a permit"* — because in the first run against a Jotai-shaped store a
single legitimate emit absorbed the undeclared write that came a millisecond later
(`packages/core/src/store.ts:11-42`).

## The checks that enforce it

Numbered as this record numbers them — **check 4 is the number pinned by
`packages/core/src/store.ts:52`**; the surrounding order is static-then-runtime and is this file's,
not the code's. The `id` column is what `motu archipelago verify` prints, and is the stable name; see
[07 — Checks and verification](07-checks-and-verification.md).

| # | id | Kind | Asks | Source |
|---|---|---|---|---|
| 1 | `ownership` | static | one producer per key; nothing bound-but-unowned; nothing claimed twice; no opaque writes | `packages/cli/src/commands/verify.mjs:2417-2491` |
| 2 | `coupling` | static | is a written key read here, or does the coupling escape the region (D11)? | `packages/cli/src/commands/verify.mjs:2301-2389` |
| 3 | `store-guard` | runtime | did the store's own guard complain while the region was driven? | `packages/cli/src/commands/verify.mjs:2624-2637` |
| 4 | `laundering` | runtime | did the host write a bound key just after an island emitted? | `packages/cli/src/commands/verify.mjs:1809-1815` |
| 5 | `wiring-live` | runtime | does firing a declared write actually move the key it claims? | `packages/cli/src/commands/verify.mjs:1828-1845` |
| 6 | `sources-live` | runtime | did a channel write a key no declared source claims; did a claimed key stay silent? | `packages/cli/src/commands/verify.mjs:2943-2970` |

**Check 1 — `ownership`.** Four findings over the region's source: a key written by two different
ELEMENTS is an error (D6); a key in both `provides` and an island's `writes` is an error — *"two
owners is the ambiguity the declaration exists to remove"*; a bound key with no owner is a WARNING
(D3); a `store.set` in a handler body is a warning. It also reports the positive, `n/m bound key(s)
owned`, split host vs island (`packages/cli/src/commands/verify.mjs:2473-2479`).

**Check 3 — `store-guard`** exists because of where the guard lives. `no-console-errors` runs on a
page that only MOUNTS the region and never writes, so the ownership guard could fire on every driven
page and never reach a report: *"the framework had already caught it, in a console nobody was
reading"* (`packages/cli/src/commands/verify.mjs:2624-2631`). It scrapes `console.error: motu:` out
of the diagnostics of each driven lane and reports each distinct line as an error.

**Check 5 — `wiring-live`** is the runtime half of `RegionWiringOk`: a type proves an event NAME
resolves to an island that declares it, and that is all a type can do. Whether firing it moves the key
it claims to write is a question only a run answers, and *"a wire that resolves, compiles and moves
nothing is exactly what a broken change looks like from outside"*
(`packages/cli/src/commands/verify.mjs:1828-1835`).

The compile-time guards that make most of this unnecessary to run —`RegionOwnershipOk`,
`ProducedKeysAre`, `RegionWiringOk`, `RegionSourcesOk` — are described in
[05 — Archipelagos and regions](05-archipelagos-and-regions.md#the-type-level-guards). What they
cannot check is whether a declared output ever fires and whether a declaration is HONEST; those are
the two runtime facts the list above exists for (`packages/core/src/archipelago.ts:421-423`).
