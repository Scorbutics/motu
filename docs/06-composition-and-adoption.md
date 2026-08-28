# Composition and adoption

How a page and the lagoon agree on where a region's islands sit — `<X.Root>` or `<X.Island>` — and how
to bring motu into an application that already exists without rewriting its pages first.

This page answers two questions that turn out to be one: *which composition shape should a region be
in*, and *how much of my codebase do I have to change to adopt motu*. Read
[01 — Concepts](01-concepts.md) for the vocabulary and
[05 — Archipelagos and regions](05-archipelagos-and-regions.md) for how a region is declared.

## The two shapes

A region's ARRANGEMENT — the order, the wrappers, the grid, the page header — lives in one of two
places. Both are supported, and both pass `motu check`.

### `<X.Island>` — the page composes

The page keeps its own JSX and wraps each island's child where it already sat:

```tsx
<MotuRegion>
  <div className="flex flex-col gap-4 sm:gap-6 lg:gap-8">
    <DashboardPageHeader title="La Vie du Club" description={<>{greeting} …</>} />
    <Club.Island slot="announcement-card"><AnnouncementCard /></Club.Island>
    <Club.Island slot="counters-banner"><CountersBanner /></Club.Island>
    <div className="grid gap-4 lg:grid-cols-3 lg:gap-6">
      <Club.Island slot="club-feed"><ClubFeed /></Club.Island>
      <Club.Island slot="new-members-card"><NewMembersCard members={recentMembers} /></Club.Island>
    </div>
  </div>
</MotuRegion>
```

The page is untouched except for the wrappers. The lagoon, which cannot import a route module, needs
its own description of that arrangement — a **frame**.

### `<X.Root>` — the archipelago composes

The archipelago names the application's own layout component as `root` and maps its props to slots:

```ts
export const clubArchipelago = archipelago<ClubRegion, /* tags */>()({
  id: 'club',
  root: ClubLayout,
  slots: {
    announcement: 'announcement-card',
    counters: 'counters-banner',
    feed: 'club-feed',
    members: 'new-members-card',
  },
  islands: [ /* … */ ],
});
```

and the page passes its own prop names, never a slot string:

```tsx
<MotuRegion>
  <Club.Root
    greeting={greeting}
    announcement={<AnnouncementCard />}
    counters={<CountersBanner />}
    feed={<ClubFeed />}
    members={<NewMembersCard members={recentMembers} />}
  />
</MotuRegion>
```

The lagoon renders the same `ClubLayout` from the same `slots` map, so there is no second description
to drift.

## What `Root` actually is

Less than people expect. `Root` is one function in
[`packages/react/src/create-region.tsx:122`](../packages/react/src/create-region.tsx). For each prop:

| the prop is | what `Root` does |
|---|---|
| named in `slots` | wraps the node in `<Island slot="…">` |
| named in `hostSlots` | renders the declared component with these props |
| anything else | passes it through untouched |

Then it renders `config.root` — **your component**. motu draws nothing.

Three consequences worth knowing:

- **`null` means absent, and that is the main path.** `Root` maps `value == null` to `null` rather
  than to an empty `<Island>`, because an `<Island>` with no child renders the registered component
  from the store — so `challenges={null}` would put the challenges panel on screen at exactly the
  moment the page said not to (`create-region.tsx:137-145`).
- **A declared slot the page never mentions is not filled in for it.** That would turn a forgotten
  prop into a silently different page. It is a check instead — `integrate check` compares the props on
  `<X.Root>` against the declared slots (`create-region.tsx:158-165`). The lagoon does the opposite
  and mounts every declared slot, because there is no page there to have an opinion.
- **`Root` does not wrap `<X.Region>`.** A page that reads the region to build its props is already
  under the provider, and a component cannot sit inside a provider it renders itself.

Nesting still works: the host's own JSX wins where it passes the prop itself, so an island composed
*inside* another island's props stays written in the page.

## How the lagoon chooses

[`packages/react/src/lagoon-react-mount.tsx:247`](../packages/react/src/lagoon-react-mount.tsx), most
faithful first:

1. the archipelago's `root`, composed from the same `slots` the page uses
2. its `layout` template (for an ocean whose legacy page cannot hand React anything)
3. declared order

There is deliberately no hand-written frame in that chain any more. One existed; it was a second copy
of the page, and every copy drifted.

## How `motu check` grades each shape

The check is **`region-root`**, implemented at
[`packages/cli/src/commands/verify.mjs:2130`](../packages/cli/src/commands/verify.mjs).

| your region | grade |
|---|---|
| declares `root` | **ok** |
| `.Island` + a frame holding only your own components, fragments and `island(slot)` | **ok**, with a line naming `root` |
| …same, but the project sets `"regionRoot": "required"` | **error** |
| `.Island` + a frame drawing its own `<div>` or literal text | **error** |
| …same, wrapped in `inventedArrangement('why', …)` | **warn** |
| `.Island` + no frame at all | **error** (a region with no islands yet gets a **warn**) |
| declares `root` *and* still has a `layout` frame | **error** — two arrangements for one region |

Only errors fail a run: `motu check` exits on `errors.length === 0` (`verify.mjs:1063`), so warnings
are green. See [07 — Checks and verification](07-checks-and-verification.md) for the full catalogue.

The default is `regionRoot: "encouraged"`, and the source says why
([`packages/cli/src/lib/config.mjs`](../packages/cli/src/lib/config.mjs)):

> a tool that fails a project on its first day for not having done it is a tool nobody adopts.

## Adoption is staged

Three stages, and a project is expected to sit in the middle one for a long time.

### Stage 1 — thin overlay

Add islands, wrap them with `<X.Island>` inside the page's existing JSX, and give the lagoon a frame
that holds only the application's own components. `region-root` grades this `ok`. **No page changes
beyond the wrappers, so nothing in a page can regress.**

If the arrangement genuinely has no component to point at yet, say so once:

```tsx
inventedArrangement('the dashboard shell is generated by the CMS; there is no component to import', <…/>)
```

It downgrades the error to a warning and prints the reason beside it
([`packages/react/src/lagoon-overrides.ts:171`](../packages/react/src/lagoon-overrides.ts); the
constructor throws if the reason is empty, which is the whole point of the wrapper). It is a **hold,
not an answer** — the reason string is what a later reader uses to decide whether it is still true.

### Stage 2 — migrate opportunistically

Move one region to `root` **when you already have a reason to open its page**. You are reading and
testing it anyway, and the extraction is nearly free at that moment.

`motu archipelago adopt-root <id>` does the derivable half — the frame's host component becomes
`root`, each `island('x')` and the prop it sits in become `slots` — and **refuses rather than
approximating** when the frame nests two host components, because that is a decision about the
application's structure ([`packages/cli/src/commands/adopt-root.mjs`](../packages/cli/src/commands/adopt-root.mjs)).

Where a region already has a `root`, `motu island integrate` adds the new slot to `slots` and prints
the two things it cannot derive: the prop to add to the root component, and the line the page must
pass. Do both, or the island is declared and never placed.

### Stage 3 — close it

When the last region has a `root`, set `"regionRoot": "required"` in `motu.config.json`. A frame
becomes an error from then on, which is what stops the old shape creeping back in. Without this
switch the arc stalls half-done.

## Do not migrate every region in one sweep

The reason is not diff size. Two things change in a move to `root` that **no check sees**.

### Exclusivity gets demoted

A ternary whose branches cannot both render becomes two independent props, and nothing enforces that
at most one is non-null. A real example, from an adopting project's actions page:

```tsx
// before — mutually exclusive by construction
{weeksLoaded
  ? (availableWeeks.length > 0 || hasNoCurrentWeek ? <WeekNavigator … /> : null)
  : <Skeleton className="h-11 w-full rounded-lg" />}

// after — two props, rendered adjacently in the layout
weekNav={weeksLoaded && (…) ? <WeekNavigator … /> : null}
weekNavPlaceholder={weeksLoaded ? null : <Skeleton className="h-11 w-full rounded-lg" />}
```

The layout renders `{weekNav}{weekNavPlaceholder}` one after the other. The guarantee moved from the
type system into a comment.

**When `slots` cannot express an either/or, keep the ternary in the page and pass one node** — not two
props and a promise.

### The server/client boundary moves

`Root` renders inside `<X.Region>`, which is a client component. A layout the page used to render on
the server crosses into the client bundle when it becomes the root, and the nesting inverts:

```
before:  page → AuthLayout → Screen        (AuthLayout rendered on the server)
after:   page → Screen → Region → AuthLayout   (AuthLayout in the client bundle)
```

Same pixels, different tree, different bundle. **Read what the extracted layout imports before you
move it.**

## What the migration buys, and what it costs

**Buys: one thing.** The lagoon previews the page instead of a drawing of it. That is not
theoretical — one project's ten hand-written frames had accumulated seven silent drifts under green
checks, including a `/forgot-password` heading that existed nowhere in the application.

**Does not affect:** islands, contracts, key ownership, coverage, `removal-check`. All of them work
identically in either shape.

**Costs: the extraction is not reversible by the tool.** `removal-check` handles both shapes, but
asymmetrically ([`packages/cli/src/commands/removal-check.mjs`](../packages/cli/src/commands/removal-check.mjs)):

| shape | what removal does |
|---|---|
| `<X.Island>` | unwraps it, leaving the page's own child in the page's own JSX |
| `<X.Root>` | rewrites the tag to the layout component, restores `hostSlots` props to elements, adds the import |

So `<X.Root>` de-wraps to `<ClubLayout …/>` — it does **not** inline the layout's JSX back into the
page. Stage 1 returns a page to exactly the source it had; stage 2 leaves the extracted layout files
behind permanently.

That asymmetry is the honest argument for staging: a region earns the move when somebody is already
editing it.

## Choosing, in one table

| you are… | shape |
|---|---|
| adopting motu into pages that already exist | `.Island` + frame — stage 1 |
| building a new region from nothing (`archipelago create`) | `root`, scaffolded for you; the safe shape is free here |
| extracting one island from a live page | `.Island` — do not couple the extraction to a page refactor |
| already editing a region's page for other reasons | `root` — take the migration now |
| finished migrating every region | `root` + `regionRoot: "required"` |
| blocked by an arrangement with no component to name | `.Island` + `inventedArrangement('why')`, and revisit |

## Working examples in this repository

`host-app/` carries one region in each stage, on the same host, with identical bindings — so the diff
between them is the composition and nothing else. See
[`host-app/MOTU-EXAMPLES.md`](../host-app/MOTU-EXAMPLES.md) for the side-by-side.

| | stage 1 — `corpus` | stage 2 — `signin` |
|---|---|---|
| the page | [`app/corpus/corpus-screen.tsx`](../host-app/app/corpus/corpus-screen.tsx) | [`app/signin/signin-screen.tsx`](../host-app/app/signin/signin-screen.tsx) |
| the archipelago | [`corpus.archipelago.ts`](../host-app/motu/src/archipelagos/corpus/corpus.archipelago.ts) | [`signin.archipelago.ts`](../host-app/motu/src/archipelagos/signin/signin.archipelago.ts) |
| the lagoon | [a frame](../host-app/motu/roots/lagoon/src/regions/corpus.tsx) | [data only](../host-app/motu/roots/lagoon/src/regions/signin.tsx) |

`demo-app/` is neither: it is an AngularJS **ocean**, where the arrangement is a `layout` template of
`<motu-island slot="…">` elements ([`members.layout.ts`](../demo-app/src/archipelagos/members/members.layout.ts)).
`root` and `Island` are both React, so an ocean does not face this choice at all. It has a different
problem — how the legacy app and the islands coexist while one replaces the other — and that is
[14 — Migrating an ocean](14-ocean-migration.md).

## See also

- [05 — Archipelagos and regions](05-archipelagos-and-regions.md) — declaring `root`, `slots`, `hostSlots`
- [07 — Checks and verification](07-checks-and-verification.md) — `region-root`, `island-composition`, severities
- [08 — The lagoon](08-lagoon.md) — frames, overrides, `inventedArrangement`
- [12 — Hosts and adapters](12-hosts-and-adapters.md) — `removal-check` in detail
- [13 — Agents and skills](13-agents-and-skills.md) — the same staging, as agent instructions
