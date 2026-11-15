# Proposal — docks: a region's island placed inside another region's arrangement

**Status:** implemented on `feat/dock`. The reference is
[05 — Docks](../05-archipelagos-and-regions.md#docks--an-island-placed-in-another-regions-arrangement);
this page keeps the reasoning, the rules that were decided, and what is still open.

## The gap

« Ma Base » (`base`) places « Mon Équipage Business » (`equipage`) in one of its root props —
`businessTeamPanel: { region: 'equipage' }`. The design then puts `base`'s island `x-base-conseil` («
Ton Conseil Énergie ») INSIDE `equipage`'s arrangement, to the right of the rocket (before it on a
phone). The island is `base`'s in every sense: it binds `base` keys, its intents go to `base`'s source,
the page's callbacks on it are `base`'s. Only its DOM position is `equipage`'s.

motu had no way to say so, so the application hand-rolled it:

```tsx
// equipage-layout.tsx — an empty place, handed UP by ref
<div ref={asideRef} data-part="equipage-aside" className="… [&:not(:has([data-block=conseil-column]))]:hidden" />

// base-layout.tsx — the column portalled into it, or left in the flow when there is no rocket
{!docked && conseil}
{businessTeamPanel}
{docked && conseilDock && conseil ? createPortal(conseil, conseilDock) : null}

// page.tsx — the node threaded from one region's page code into the other's
const [conseilDock, setConseilDock] = useState<HTMLDivElement | null>(null)
conseilDock={rocketOn ? conseilDock : undefined}
businessTeamPanel={… <EquipageSection asideRef={setConseilDock} /> …}
```

Consequences: the lagoon renders each region alone, so the two never meet; `integrate check` sees the
island placed in `base` and nothing else; and nothing anywhere checks the placement. A refactor that
drops the `ref` leaves both regions green and the column gone.

## The declaration — both sides, in `slots`

`slots` already answers "what fills this prop of the root": an island (`'slot'` / `{ slot }`) or a whole
region (`{ region }`). A dock is two more answers to that question, one per side.

```ts
// equipage.archipelago.ts — B DECLARES THE OPEN PLACE
root: EquipageLayout,
slots: {
  rocket: 'equipage-rocket',
  // …
  // A DOCK: an open slot ANOTHER region's island fills. Named in motu's vocabulary, like a slot.
  aside: { dock: 'equipage-aside' },
},

// base.archipelago.ts — A DECLARES WHAT GOES THERE
root: BaseLayout,
slots: {
  // The island stays base's; its PLACEMENT is equipage's dock. When equipage is not on screen it
  // renders where BaseLayout puts `conseil` — the declared fallback.
  conseil: { slot: 'base-conseil', dockInto: { region: 'equipage', dock: 'equipage-aside' } },
  businessTeamPanel: { region: 'equipage' },
  // …
},
```

```tsx
// equipage-layout.tsx — the place is a ROOT PROP like any other; motu fills it
export function EquipageLayout({ rocket, aside, … }: EquipageLayoutSlots) {
  …
  <div className="min-w-0 lg:flex-1">{rocket}</div>
  <div data-part="equipage-aside" className="order-first … lg:order-none">{aside}</div>
}

// base-layout.tsx — `conseil` sits at its FALLBACK position, once; no portal, no dock prop
{invitations}{empty}{conseil}{businessTeamPanel}…

// page.tsx — unchanged except for what is deleted: no useState, no asideRef, no conseilDock
<Base.Root conseil={<ConseilColumn … />} businessTeamPanel={… <EquipageSection /> …} />
```

### Who names what

| side | writes | in whose vocabulary |
|---|---|---|
| B (the host of the place) | `prop: { dock: '<name>' }` | the prop is B's app vocabulary; the dock name is motu's, like a slot |
| A (the owner of the island) | `prop: { slot, dockInto: { region: '<B id>', dock: '<name>' } }` | the prop and slot are A's; B is named by id |

A STRING id and name, never an import of B's archipelago — for the same reason `{ region }` uses one:
an import makes a cycle an ES-module cycle (base imports equipage for the dock, equipage is placed by
base) instead of an error that names it. What an import would catch at compile time, the `dock` check
catches statically (below).

Both sides are declared, so either side's change is caught: B renaming or dropping its dock fails A's
claim; A claiming a dock B never opened fails A; a second claimant fails both.

### The rules that were decided

- **One island per dock.** A dock is one position in B's arrangement. Two foreign islands in one place
  need an order between them, and only B's layout can decide one — so B declares two docks. A second
  claim on a dock is an error. No ordering field exists because no dock holds two things.
- **The island is A's in every sense.** Bindings, `writes`, `intents`, `on`, sources, contracts,
  ownership, flows, `render-coverage`, `placed` — all A's, computed exactly as before. A dock changes
  only where the island's DOM lands. B's checks never count it as one of B's islands.
- **A must compose B.** B must be reachable from A through `{ region }` slots (directly, or through a
  region A places that places B). That is what gives the lagoon a deterministic composition and
  `integrate check` a precise rule ("the page places B in the prop A declared for it"). A dock into a
  region A does not compose — a sibling on a screen, a parent — is refused, not guessed at.
- **Not also placed in A.** The claimed slot appears in A's `slots` exactly once (the claim), and in no
  island's nested `slots`. The claim's prop IS its one A placement; docking redirects it.
- **Fallback = the claim's own prop.** When B is absent, the island renders where A's root places that
  prop — today's « the column opens the page » behaviour, declared. A separate fallback slot was
  considered and rejected: it would be a second A placement of the same island, which the previous
  rule forbids, and it would need a second copy of the page's handlers. `fallback: 'none'` opts out
  (the island only makes sense docked; when B is absent it renders nowhere).
- **Docks need a `root`, on both sides.** The dock is a root prop of B and the claim a root prop of A.
  An ocean region (layout template, custom elements) has neither; docks are a React-host feature.

### Absent B, late B, and SSR

Placement is decided from what is MOUNTED, not from a flag the page threads through:

| what is on screen | where the island renders |
|---|---|
| B's `<X.Region>` is not mounted (feature gate off, `businessTeamPanel={null}`, the legacy panel) | A's fallback position (or nowhere, `fallback: 'none'`) |
| B's `<X.Region>` is mounted, its root has not rendered the dock yet (crew loading) | **nowhere** — waiting, so it never jumps from the flow into the dock |
| B's dock is rendered | inside the dock, through a React portal from A's tree |
| server render, and the first client render | nowhere — decided before the first paint |

Presence is B's `ArchipelagoProvider` being mounted, registered in a layout effect; the dock element
registers through a ref. A's `<Root>` decides in its own layout effect, which React runs AFTER every
descendant's — including B's provider and B's dock, because B is placed inside A — so the first frame
the browser paints already has the island in its final place. A page must therefore mount B's
`<X.Region>` in the same commit as the prop that holds it, and keep B's loading INSIDE it; Peps'
`EquipageSection` already does (`<MotuEquipageRegion>` first, `if (!crewLoaded) return null` inside).

Under SSR the docked island is absent from the server HTML (a portal has no server target) and appears
on hydration, at its final place. Everything else in both regions renders on the server as before.

Because the portal is created inside A's tree, the island keeps A's React context — A's store, host
bridge, providers, error boundary. That is why the application's `createPortal` was right in principle;
the feature moves it into motu and declares it.

## What it looks like in the DOM

```html
<div data-motu-region-dock="equipage.equipage-aside" style="display:contents">
  <div data-motu-region-dock-place style="display:contents">           <!-- the portal's container -->
    <div data-motu-docked-in="equipage.equipage-aside" data-motu-docked-from="base.base-conseil" style="display:contents">
      <div data-motu-island="x-base-conseil" data-motu-slot="base-conseil" data-motu-region="base" style="display:contents">…</div>
    </div>
  </div>
</div>
```

The dock element is `display: contents`, so it adds no box and B's layout keeps its own wrapper and CSS.
`[data-motu-region-dock]` is the one selector the runtime checks and the flows' `in` read — not
`data-motu-dock`, which the lagoon's own chrome panel (also called "the dock") already sets on `<html>`.

## Checks

| check | tier | catches |
|---|---|---|
| `dock` | static, `motu check` / `archipelago verify` | unknown target region; unknown dock; two claims on one dock; a dock declared twice in one region; docking into your own region; A does not compose B (no `{ region }` path); the claimed slot is not an island of A, or is also placed elsewhere in A; either side without `root`; a dock no region claims (warning) |
| `dock` | `integrate check` | B's page passes the dock prop itself (`<Equipage.Root aside={…}>` — motu fills it); A's page never places B in the prop A declared for it; a hand-rolled `createPortal` in a region's root or page (warning: declare a dock) |
| `dock-placement` | runtime, `archipelago verify --runtime` | in the composed state, the docked island is NOT inside B's dock element (placement, not "rendered somewhere"); in A's own state, it is not at its fallback; a region with docks but no claimant renders nothing to check (skip, never pass) |
| flows | runtime | `expectRender: { 'base-conseil': { in: 'equipage.equipage-aside', text: '…' } }`, in a flow declared `dock: 'equipage.equipage-aside'` (it runs in that composed view) |
| `removal-check` | removal | unchanged surgery — `<X.Root>` becomes the layout and the claim's prop is passed as before, so the island renders at its fallback position and B's dock prop is simply not passed. The report says so per dock |

A check that examined nothing reports nothing (no docks, no row) or `skip` (declared, nothing to look
at) — never a pass.

## Lagoon — the composition is a declared state, at its own address

Each region's own address stays isolated, exactly as `{ region }` slots are today: a parent previews
and snapshots without its child. **That isolated view IS the absent-B state** — A's region view shows
B's placeholder and the docked island at its fallback — so it needs no address of its own beyond
`?region=base`.

The composition is a state, listed and addressed like every other:

```
?region=base&state=base.dock.equipage.equipage-aside       A, with B loaded in place: the island in B's dock
?region=equipage&state=equipage.dock.equipage.equipage-aside   B, with A's docked island mounted as A's guest
```

`<region>.dock.<dock region>.<dock name>`, the same dotted form as `.flow.` and `.scenario.`. In A's
view every `{ region }` slot on the path to B is loaded in place (from B's own config and overrides, as
« Load it here » does). In B's view A's island is mounted from A's config, seed and channels in an A
provider that renders nothing but that portal — so the island is still A's island.

- A composition is not a store state, so it composes with one flow or scenario state per region:
  `?region=base&state=base.dock.equipage.equipage-aside&state=equipage.flow.opening-a-sphere`.
- `window.__motuLagoonState` reports `{ ok, kind: 'dock', name: 'equipage.equipage-aside', placed:
  'base-conseil' }` once the island is inside the dock — and REFUSES (banner, nothing claimed) when the
  address names no declared dock, or the island never lands there.
- `motu lagoon states` lists both addresses under both regions; `window.__motuLagoonStates.docks`
  carries them for the page.

## Removal

`removal-check` needs no new surgery. `<Base.Root conseil={…}>` is rewritten to `<BaseLayout
conseil={…}>`, which renders the column at its fallback position; `<Equipage.Root>` becomes
`<EquipageLayout>` without `aside`, an empty place. The app compiles and renders the « no rocket »
arrangement — the declared fallback, which is the honest meaning of "motu is not load-bearing". With
`fallback: 'none'` the layout must still place the prop somewhere for that to hold, and the report
says so.

## Not built

- **Many islands per dock**, with an order. Two docks today.
- **Docking upward** (into a region that places A) or **sideways** (a sibling on a screen). The
  composition rule above refuses them; a screen-level dock would need the screen to own it.
- **The chrome's dock panel** does not list dock states as pills yet; they are addresses, in
  `motu lagoon states` and `__motuLagoonStates`.
- **The element (ocean) mount path.** Docks are a React-host feature; an ocean region has no root.
