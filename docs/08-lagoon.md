# The lagoon

The lagoon is the sandbox: the application's own components, mounted against the project's evidence
with no backend, no session and no host application around them. The evidence reaches them through one
of two mock layers — `MockTransport` at the contract seam, or a fake `fetch` beneath the app's own
client (see [the two stand-ins](#the-two-stand-ins-and-which-to-reach-for)). This page answers
how to open it, how to address one state inside it, how to serve or publish it, how to host it for
other people, and how its visual baselines work. Vocabulary is in
[01 — Concepts](01-concepts.md); the composition shapes it renders are in
[06 — Composition and adoption](06-composition-and-adoption.md).

---

## What it is, and what it is not

The lagoon proves **a component and its declared boundary**: one island or one page's islands, no
backend, fixtures, deterministic, headless, exit-coded, publishable as a page that opens on a phone
([design and limits](15-design-and-limits.md)).

It does not prove **the system**. Cross-page behaviour — island A changing what island B shows on
another page — is mediated by the database, and the honest tools for it are the real app running
locally with auth bypassed, plus Playwright ([design and limits](15-design-and-limits.md)). Simulating that backend inside the
lagoon (a stateful fake, the schema in pglite) was investigated and declined: it reimplements business
logic that cannot be diffed against the original, and the moment the lagoon has a backend it loses
determinism, one-cause failures, speed, and the artifact with nothing behind it ([design and limits](15-design-and-limits.md)).

**It is always mock-backed, and there is no way to make it otherwise from the browser.** The two mock
layers are guaranteed differently, and it is worth knowing which is which. At the CONTRACT seam a
published or served artifact is built with `MOTU_TRANSPORT='mock'` unconditionally
(`packages/cli/src/commands/lagoon.mjs:81-84`), and every other build a person opens is mock because
nothing offers them a choice (`packages/react/src/transport-mode.ts`) — an env var the browser cannot
reach. At the WIRE, the fake is installed by the project's own region module, so nothing structural
stops a project handing its client a real one; what holds the line there is a CHECK rather than a
build flag. `stubs-sealed` fails the run when any request escaped to a real host, matched no declared
fixture, or was answered by the dev server instead of a stub
([07 — Checks and verification](07-checks-and-verification.md)).

The chip that used to offer one is gone, and the reason is the addressing contract rather than the
artifact. A lagoon address promises a DECLARED state, and a name that resolves to nothing refuses to
render precisely because being handed a different state while believing it is the one you named is
the failure worth engineering against. `?transport=http` was that failure through a side door: the
address still resolved, `window.__motuLagoonState.ok` stayed `true`, and what rendered was whatever
the backend held that second — different for two people opening the same URL, and useless as a
snapshot baseline. It was also a data path with no declaration, in a framework where scenarios,
`seed`, channels, `sources` and `capture` are all declared and therefore comparable; and it answered
a question the design assigns elsewhere, since the far side of the port belongs to the operations
ledger and to unit tests, not to the lagoon. The remembered `motu:transport` in localStorage made it
worse by outliving the intention: one peek turned every address opened afterwards undeclared.

`http` survives as a BUILD-TIME input with exactly one caller — `motu fixtures record <island>
--transport http`, which boots a headless lagoon against the real backend, drives the island's
declared scenarios and writes fixtures to disk (`packages/cli/src/commands/fixtures.mjs`). Nothing is
previewed and nothing is asserted against live data: its output is a declared artifact everything
downstream compares against, which is the capture-refresh shape rather than a live mode. `httpBase`
and `transportFor` exist to serve that one build; there is deliberately no `transport` key in
`lagoon.config.json`, because a committed `"transport": "http"` would be the mode again in
configuration form.

---

## Two entries, and which command builds which

| Entry | File | Chrome | Driven by |
|---|---|---|---|
| **gallery** | `index.html` → `src/main.tsx`, `startLagoon` | full — tide line, stations, view toggle, transport/fit chips, the lens | a human; `lagoon serve`, `lagoon publish` |
| **focused** | `lagoon.html` → `src/lagoon.tsx`, `bootstrapLagoon` | none, deliberately | `motu island verify`, `motu archipelago verify --runtime` |

Both are written by the framework into `.motu/cache/lagoon/` unless the project owns its own
`index.html`, which is the ownership marker (`packages/cli/src/lib/lagoon-materialize.mjs:45-48`,
`:91-96`). `motu lagoon eject` writes them into the project instead, after which motu stops
regenerating them (`packages/cli/src/commands/lagoon.mjs:681-695`).

`resolveTarget` picks the entry (`packages/cli/src/commands/lagoon.mjs:36-70`):

| Invocation | Entry built | `MOTU_TARGET` | slug |
|---|---|---|---|
| `motu lagoon publish` (no target) | gallery | `''` | `all` |
| `motu lagoon publish --archipelago <id>` | **gallery**, focused on that region | `archipelago:<id>` | `archipelago-<id>` |
| `motu lagoon publish <island>` | focused | `island:<tag>` | `island-<kebab>` |

A region publish deliberately uses the gallery entry, not the bare one: `serve` and `publish` are for
a human to look at, and the chrome is most of what makes the lagoon worth looking at
(`packages/cli/src/commands/lagoon.mjs:44-47`).

---

## Declaring a lagoon

A project **declares** its lagoon rather than coding it. What JSON can hold goes in
`roots/lagoon/lagoon.config.json` (`about`, `transport`, `defaultTheme`, `mount`, `chrome`,
`stations`, `viewports`, `alias`, `env`; see [04 — Configuration](04-configuration.md)). What JSON
cannot hold — functions and objects — goes in `roots/lagoon/src/lagoon.tsx` (or `.ts`), resolved at
`packages/cli/src/lib/lagoon-materialize.mjs:62-63` and imported by **both** entries
(`packages/cli/src/lib/scaffold.mjs:257-260`, `:380`).

### The override file is a MAP, not a page

> The lagoon override file is a MAP, not a page. `layout` points at the APPLICATION's own layout
> component — never a second JSX copy of the arrangement, which drifts for the same reason a second
> copy of the region's vocabulary does. `seed` is data. Anything that REACTS has one of TWO homes, and
> neither is the frame. A `channel` installs the application's own SOURCE over a port. The WIRE FAKE
> answers HTTP BENEATH the app's real service, so the service itself runs instead of being replaced.
> Both are installed for every view, which is the property that matters. Behaviour written inside the
> frame runs only in the region view, where those checks are not.
> — `.github/host-rules.md`

One line per region; each region's own seed, arrangement and stand-ins live beside it in `regions/`
(`host-app/motu/roots/lagoon/src/lagoon.tsx:1-16`).

### The two stand-ins, and which to reach for

A region module holds three kinds of thing, and only two of them are `RegionOverrides` fields:

| | What it is | Where it lives | What runs for real |
|---|---|---|---|
| `seed` | data | a field | nothing — it is a value |
| `channels` | the app's own SOURCE, over a port | a field | the source: its timeout, its generation guard, its error mapping |
| `wire` | a fake `fetch` under the app's real client | a field, via `wireFrom({ to, … })` | the source AND everything below it — the service, its URL building, its status handling, its error mapping |

```tsx
// roots/lagoon/src/regions/review.tsx — both, in one module
const wire = wireFrom({ to: reviewArchipelago, appRoutes: ['/api/baselines'], fixtures: [ … ] });

export const reviewRegion = overridesFor(reviewArchipelago, {
  seed: reviewSeed,
  wire,
  channels: [channelFrom({ to: reviewArchipelago, id: 'shots', args: [shotsWirePort] })],
});
```

Reach for the **wire** when the application's own client code is what you want exercised — a module
swap runs the source and stops there, so the service beneath it never executes and nobody notices,
because the swap is silent by construction. Reach for a **channel** when the region needs a key fed.
A region commonly has both, as the one above does.

The rule that has not changed is the one that matters: neither lives in the frame. Both are installed
for **every** view — which is what lets the checks that drive the region see the same answers a human
does.

The wire used to be a bare `installFakeFetch(...)` at the module's top level rather than a field, and
that cost three things, all of them now gone: `appRoutes` was written twice with nothing checking that
the two agreed (`createPostgrestFetch` stamps its own claim, and the installer reads it); the fake was
bound to no region, so nothing could compare the routes it answers against the `reaches` its sources
declare; and the installer latched on a global boolean, so a SECOND region with a wire was a silent
no-op — its routes went to the dev server, its islands rendered empty, and nothing said why. Fakes
register now, and one patch asks each in turn.

`installFakeFetch` is still exported and still works. One case genuinely needs it, or `armFakeFetch()`
at the top of `lagoon.tsx`: a client that captures `globalThis.fetch` at IMPORT time
(`createClient(url, key, { global: { fetch } })` evaluated at module scope) keeps whatever `fetch` was
when its module ran, so a patch installed later is talked past. Hand such a client `wire.fetch`
directly, or arm the patch before any application module is imported. What fired stays legible either way: the lens shows a channel, and `data-reach` /
`provenance` show what went over the wire. Transports, fixtures and the fake's supported surface are
[11 — Contract and backend](11-contract-and-backend.md).

### `overridesFor(archipelago, { … })`

The strongest form. Each entry carries the id it belongs to, so the region's name is written once — in
the archipelago — and nothing in the lagoon can disagree with it
(`packages/react/src/lagoon-overrides.ts:99-158`).

```tsx
// roots/lagoon/src/regions/signin.tsx
export const signinRegion = overridesFor(signinArchipelago, {
  seed: { authError: null },
  channels: [channelFrom({ to: signinArchipelago, id: 'signin', args: [LAGOON_SIGNIN] })],
});

// roots/lagoon/src/lagoon.tsx
export const regions: LagoonOverrides['regions'] = [signinRegion];
```

What the reference buys, all of it from the one argument
(`packages/react/src/lagoon-overrides.ts:108-117`): the id is derived so it cannot be misspelt; `seed`
is `Partial` of the region's OWN type, so a key the region does not declare is an error here rather
than a value the lagoon stores and no island reads; `layout` and `props` are keyed by the DECLARED
SLOTS; and a channel built against a different archipelago is refused with a message naming both
regions (`:138-148`).

### Every field of a region override

`RegionOverrides`, `packages/react/src/lagoon-overrides.ts:16-48`:

| Field | Meaning | Installed in |
|---|---|---|
| `seed` | initial store contents, so bound islands render meaningfully (`:19`) | both views |
| `channels` | inbound seams — host signals mirrored into the store, as the real composition roots do (`:21`) | **every** view |
| `wire` | the fake `fetch` beneath the app's own client, built by `wireFrom({ to, … })` | **every** view |
| `layout` | the region's ARRANGEMENT: the application's own layout component, called with islands in its slots (`:22-26`) | region view only |
| `providers` | the environment the islands cannot render without (`:27-31`) | **every** view, per island |
| `props` | per slot, the props the PAGE passes on the island element itself, for what is not region state (`:32-33`) | both views |
| `hostProps` | per ROOT PROP the islands do not fill: a `hostSlots` component's props, or a plain prop's value. DATA ONLY (`:34-47`) | region view (via `root`) |

Confusing `layout` with `providers` is invisible in the region view and fatal in the mountpoints view
(`packages/react/src/lagoon-overrides.ts:28-30`) — and mountpoints is the view the flow checks drive,
so it reads as "the region rendered nothing" rather than "no providers"
(`.github/host-rules.md:174-178`).

There is a second, older **kind-first** shape — `seed`, `layout`, `channels`, `providers`, `props`
each a `Record<regionId, …>` — still accepted and still meaning the same thing. Where both name a
field, the region-first one wins, because it is the more specific statement about that region
(`packages/react/src/lagoon-overrides.ts:8-11`, merge at `:80-94`). Prefer region-first: the kind-first
file is the one two parallel agents are guaranteed to collide in (`:3-6`).

The whole-lagoon fields sit alongside `regions` in `LagoonOverrides`
(`packages/react/src/lagoon-gallery.ts:68-79`): `host` (the outward seam, defaulting to logging
intents), `setup` (run before anything mounts), and `transportFor`.

### `inventedArrangement(reason, node)`

The escape hatch for a frame that genuinely cannot be the page's own code, and it costs a sentence.
The reason stays in the file, where the `region-root` check finds it and prints it beside a WARNING
instead of an error (`packages/react/src/lagoon-overrides.ts:160-173`); warnings do not fail
`motu check` (`.github/host-rules.md:438-439`). It is a HOLD, not an answer — a copy drifts, and this
project shipped a lagoon that said "On récupère ton accès" over a page that said "Mot de passe
oublié ?", which no check could see (`packages/react/src/lagoon-overrides.ts:168-170`).

---

## How a region mounts

Preference order in the region view, most faithful first
(`packages/react/src/lagoon-react-mount.tsx:242-251`):

1. the archipelago's **`root`** — the application's own component, the same one the page renders,
   composed from the same `slots` (`:247-248`);
2. its **`layout`** template — for an ocean, whose legacy page cannot hand React anything (`:250`);
3. **declared order** — the islands, one after another.

There is deliberately no hand-written frame in between any more: one existed, it was a second copy of
the page, and every copy drifted (`:245-246`). Which shape a region should be in, and the staged path
to `root`, is [06 — Composition and adoption](06-composition-and-adoption.md).

### A slot filled by another region

A root prop declared `{ region: '<id>' }` ([05](05-archipelagos-and-regions.md#a-slot-another-region-fills--region-id))
renders a PLACEHOLDER in the parent's region view, never the child: it names the region, says it is a
separate one, and offers two ways in — **Load it here**, which mounts the child in place from ITS
config with ITS own overrides (seed, channels, providers, `hostProps`), and **Open it on its own**, a
link to `?region=<id>` that the gallery follows in place through the station switch
(`packages/react/src/region-ref-slot.tsx`, wired at `packages/react/src/lagoon-gallery.ts`). Loaded,
it can be unloaded again.

NOT LOADED BY DEFAULT, and that is the point. Rendering it inline would tie the parent's flows,
snapshots and `lagoon-render` to how the child renders: a change to the child would move the parent's
baseline, and a parent flow could pass on the child's data. The placeholder carries no
`data-motu-slot`, so no runtime check counts it as one of the parent's slots; the mountpoints view
frames it (`data-motu-region-slot`) so it is not hidden there either. The child is verified, flowed
and snapshotted at its own address, and `motu lagoon states` lists both regions as usual.

A reference that cannot be honoured — an unknown id, a cycle — REFUSES: a red `role="alert"` box naming
what is wrong, a console error, no load button, and nothing rendered in its place. The focused entry
(`lagoon.html`) has no resolver, so its placeholder names the region and says it cannot be loaded in
that view.

Two views, toggled from the tide line and persisted in `localStorage`
(`packages/react/src/tideline.ts:44`, `:927-938`; `packages/react/src/lagoon-gallery.ts:138`, `:327`):

| View | What it renders | What it is for |
|---|---|---|
| `region` | the arrangement above — what a person sees | looking at the page |
| `mountpoints` | one labelled `motu-frame` per slot, in a grid (`lagoon-react-mount.tsx:213-229`) | probing wires; the view the flow checks drive |

The mount also installs `window.__motuLagoon` — `provide`, `seed`, `emit`, `read`, `held`,
`hostCalls`, `outputs`, `channels`, `remount` — so the same checks run against the React mount path as
against the element path (`packages/react/src/lagoon-react-mount.tsx:261-267` and following).

---

## Screens — the app's layout, a region per part (EXPERIMENTAL)

A region is previewed alone. A real screen is several regions at once — the demo app's sidebar is
the `shell` region and the page beside it is another — and past a dozen regions, a flat list of
stations stops looking like the application. A **screen** is the third level, and deliberately the
thinnest:

    island   a component with a declared surface
    region   declared state — who owns each key, which flows it must end in
    screen   ARRANGEMENT — a route, the app's own layout, a region per slot

```ts
// src/screens/screens.ts — read by the gallery and by `motu check`
screen({
  id: 'events',
  path: '/events',
  layout: AppFrame,                                         // the APPLICATION's layout component
  slots: { sidebar: shellArchipelago, main: eventsArchipelago },
  host: () => ({ shell: { section: 'events', me }, events: { me } }),
})
screen({ id: 'chapters', path: '/chapters', layout: AppFrame,
  slots: { sidebar: shellArchipelago, main: notARegion('plain React — not surveyed yet') } })
```

Pass `screens` to `startLagoon`, or — for a project whose gallery entry the CLI generates — export
them from the lagoon overrides module: `export const screens = [...]` in `lagoon.tsx`. Screens appear
in Find above the regions (`▣`), and each is an address: `?screen=<id>`, plus
`&path=/member/<id>` for a route with parameters (which must declare an `example` path to open at).
A lagoon that declares screens opens the FIRST one at its bare address — the application as a person
meets it, the same for everyone the URL is handed to — rather than its first region (or the one this
browser last looked at); a region alone is `?region=<id>`, a place you go on purpose.

Three more fields, each found by putting screens on Peps:

- `providers` — what the app renders AROUND the layout, outermost first, when the layout above it
  cannot render here (a Next root layout draws `<html>`/`<body>`). The app's own components, listed:
  Peps' sidebar needs the root layout's `CookieConsentProvider`.
- `accepts(params)` — `true`, or why the lagoon cannot show those params. `path` is the APP's route,
  so a link to any team is valid; but a region whose lagoon channel is fixed on one team would show
  that team under another's id. The screen refuses instead, with the reason.
- `notARegion(reason)` in a slot — a page that is not islanded yet, named rather than drawn.

**A screen can declare FLOWS**, in `src/screens/screens.evidence.ts` beside `screens.ts` (plain node
reads it, so no `@/` imports):

```ts
export const scenarios = [
  { name: 'the sidebar opens the member directory', screen: 'home',
    steps: [{ click: 'Members', expectScreen: 'directory', expectRender: { 'member-results': 'Allen' } }] },
  { name: 'a path opens the screen that serves it', screen: 'home',
    steps: [{ navigate: '/events', expectScreen: 'events' }] },
];
```

A step clicks what a person clicks (the app's own link, by accessible name) or navigates to a path, and
asserts which screen is open and what a slot renders. Every backend call a screen makes is held to a
declaration (`flow-calls`): the layout's calls, which no region's flow ever makes, are where Peps' four
undeclared tables were. `motu screen verify [id]` runs it alone; `motu check --runtime` includes it.

**What a screen is not.** It holds no state, declares no keys, writes or flows, and never becomes a
bigger region. Each slot renders its region exactly as the region's own station does — its seed, its
channels, its providers, its own store — INSIDE the layout's React tree, so the layout's context
reaches it as in the app (a separate root per region could never see Peps' member or clock
providers). Nothing crosses between regions except that context and what `host` gives each of them,
which is what the page's own code `provide`s. If two regions on one screen need to WRITE the same key,
they are one region.

**The layout stays mounted across navigation**, as a Next layout does: between two screens with the
same layout and providers, only the slots change. A region on both (the demo's sidebar) stays mounted
and receives the new screen's `host` values through `provide`; regions that leave are unmounted and
forgotten, regions that arrive start fresh. Without this, every click rebuilt the layout, and Peps'
"once per session" news modal reopened on every screen, over the sidebar.

**Navigation follows declared routes.** A region's `host.navigate(path)` opens the screen that serves
`path`. So does the app's OWN navigation on a Next host: the adapter's lagoon stubs for `next/link` and
`next/navigation` hand a `<Link>` click or `router.push` to the mounted screen, and `usePathname()` /
`useParams()` report the screen's path, so the app's sidebar lights the right item. Outside a screen
those stubs stay inert, as before (a link click is swallowed and logged, never followed). A path no screen serves is refused out loud: a banner, a console error, and
`window.__motuScreen.unresolved`. `motu check — screens` does the same statically: routes unique,
every slot a known region (a region REFERENCED by a placed one counts as placed), every
`host.navigate(...)` target in an archipelago resolved to a screen (literals, `'/prefix/' + id`, both
sides of a ternary, every value of a path map). A target built some other way, and a `screen(...)`
whose `id` or `path` is not a string literal, is reported as NOT CHECKED rather than passed. The app's
own `<Link href>`s are not read — only motu intents.

**Know the limits.**
- A target that MATCHES the wrong route passes. `/member/edit` is served by `/member/:memberId`, so a
  button meant for "new member" that opens a profile for a member called "edit" is invisible here —
  it is a test about meaning, and that is the host's test runner.
- The main slot renders the REGION (its lagoon arrangement), not the page around it, so page-level
  chrome the app draws outside its regions does not appear. A region with `root` is where the two
  converge.
- Two stand-ins can disagree, and only a screen shows it: on Peps the page greeted "Ada" while the
  sidebar, reading the member stub, said "Alice". Each region's evidence was consistent on its own.
  A screen is the first place the app's stand-ins are seen side by side — treat what it shows as
  findings about them.
- A write the lagoon cannot persist (a dismissed coach mark, a "seen" flag) reappears whenever its
  region remounts.
- No flows, checks or snapshots run per screen yet: every check is still per region. A screen-level
  smoke check (every slot mounted and rendered) is the natural next step, and cross-region "journeys"
  are deliberately not — that is an end-to-end test.

## States are addresses

Every state a project has written down is reachable by URL. The failure this refuses is the quiet one:
ask for a scenario that does not exist, get the default state, and believe you are looking at the
state you named (`packages/react/src/lagoon-states.ts:25-27`).

### Any state, in any view

A state is played on a REGION, not on a view (`packages/react/src/lagoon-player.ts`). An island alone,
a region's station and a screen differ only in how much of the application is drawn around the region's
store — so every view can show every state of every region it has on screen. The dock's **States** tab
shows ONE region of the view at a time (pills switch between them when a screen holds several):

- **the voyage** — where the region is, as a passage: from the seed to the flow's last step, a buoy
  per step, the boat at the step the region is in and the wake behind it. ‹ / › sail a step at a time
  and, past either end, to the previous or next flow, so pressing › again and again tours every state
  the region declares; the main button sails the flow again from the seed. While a state is being
  replayed the boat is under way ("Sailing to step 2…"). AT ANCHOR (a what-if) the same ‹ / › move
  between the island's what-ifs instead — its anchorages, shown as buoys with the anchor at the one in
  force ("At anchor · 2 of 3") — ‹ past the first weighs anchor back to the seed, and › stops at the
  last rather than setting sail into a flow. While anchored, the rest of the page drops to 70% opacity
  and the island that was told the state is ringed (sand, with a deep inner edge, so it reads on a pale
  island too — opacity alone did not, where the island's own palette was as light as its dimmed
  neighbours). Off while the checks drive the lagoon.
- **the atoll** — the region drawn as a place, its islands as sand dots around the lagoon, each sized by
  how many what-ifs it declares. Tapping one is going there: it drops anchor at that island's first
  what-if, so the voyage shows its anchorages (an island with none opens its details instead).
- **flows** (*the region gets there itself*) and **what-ifs** (*an island is told what to show*). The
  two marks carry the difference: a flow is SAILED — the boat — because the region reached it through
  its own declared outputs; a what-if is ANCHORED — the anchor — because one island was handed the
  state directly, so the water stills and any key it overwrote is named as forged. Under a finger an
  island's what-ifs are a shelf you swipe sideways; under a mouse, a row that opens into its list.
- **Chart** (beside *What-ifs*) replays the region's flows and marks each what-if with how it relates
  to them: *sailed by "a full event refuses the RSVP" · step 2* (press it to sail there), *never sailed
  to* with the nearest step and the keys that still differ, *held at the seed*, or why it cannot be
  compared. It is the same function the region lane's `what-if-reach` check runs. A what-if is reached
  when a flow step holds its SITUATION — the keys some flow moves, lists excluded — after the flow
  moved one of them; context (`me`) may differ, unless the what-if leaves it empty where every flow
  sets it ("a guest").

Screens, regions and every state by name are in **Find** (the button beside the tabs, or Ctrl/Cmd-K):
navigation is a search, not a column. On a phone the closed dock is a mini player — the state playing,
the region and step with the water along its top edge, the same ‹ / ›, **Share** (copies the address of exactly this state, step
included; hosted, the shell's address rather than the frame's) and the picker, **⚓**: point at an
island on the page and the dock drops anchor there — its first what-if, the voyage card in view with
‹ / › on its anchorages, the rest of the page at 70% and the island ringed — press ⚓ again to weigh anchor, back to the region as
the page seeds it. It does not open the
island's details; that is *About <island>* on the card. On a phone the panel stays closed, so what was
pointed at stays visible and the bar carries the anchor. An island with no what-ifs has nowhere to
anchor: the page still steps back around it until the region's state moves. On a screen, hovering a
region outlines it with a chip of its counts; the chip aims the dock at that region instead of scoping
the view to one island.

- **One state per region.** Regions share nothing, so on a screen the sidebar can be in one state and
  the main region in another. Within one region a new state replaces the last one — the region is reset
  first, never stacked.
- **Reachable vs what-if.** A flow only fires declared outputs: the state it reaches is one the app can
  reach. An island scenario played inside its region sets that island's inputs directly (through its
  `bind`, renames followed), so it is a **what-if** — and where one of those keys is PRODUCED by another
  island, the value is forged. The dock tags the region `what-if`, lists the forged keys, and the Seams
  sheet marks each forged row ◇ with who owns it. A scenario prop the region does not bind refuses to
  play there: that scenario only exists for the island alone.
- **A scenario's `seed` is still what the island MOUNTS with.** In place, the player establishes the
  values and REMOUNTS the region's islands (its store stays), then delivers `afterMount`. Providing the
  seed to a live island would make it an arrival — Peps' sphère sheet would open on "a request already
  there at mount", the one state that scenario pins closed.
- **It survives navigation** for a region that stays mounted (a screen's sidebar), and the address
  follows: `state=` is rewritten from the active states after every change.
- An unresolvable `state=` REFUSES the view, like every other address.

### The URL scheme

| Address | Opens |
|---|---|
| `/?target=island:<tag>` | that island, ALONE, in the gallery's chrome |
| `/?target=island:<tag>&scenario=<name-or-slug>` | that island seeded with that scenario |
| `/?region=<id>` | that station, no state applied |
| `/?flow=<name>` | the region declaring that flow, replayed to its end |
| `/?region=<id>&flow=<name>&step=<n>` | that flow, stopped after `n` steps |
| `/?screen=<id>[&path=<p>]` | a SCREEN — the app's layout with each slot's region in place (experimental) |
| `&state=<region>.flow.<slug>[@n]` | on a screen or a region view: that region put into that flow (repeatable, one per region) |
| `&state=<region>.scenario.<tag>.<slug>[@n]` | that island's scenario played INSIDE its region — a what-if (below) |

Read at `packages/react/src/lagoon-states.ts:111-123` (`scenario`, `flow`, `step`, `region`) and
`:134-139` (`target`). Printed by `motu lagoon states`
(`packages/cli/src/commands/lagoon.mjs:755`, `:782`) and by `motu --help`
(`packages/cli/src/run.mjs:117-124`).

**Both forms are the GALLERY's** — the entry `serve` and `publish` build, and the one a person opens
(`.github/host-rules.md:109-116`). Both are also honoured by the focused entry, because an address
only one of them honours is one a person pastes and watches render something else
(`packages/react/src/lagoon-states.ts:17-19`).

> **This changed.** An island scenario used to be addressed as `/lagoon.html?target=…&scenario=…`.
> That path landed on the gallery — which `serve` and `publish` serve at every path — with a `target`
> the gallery ignored: the first region rendered, no banner, and the URL looked like it had worked
> (`packages/cli/src/commands/lagoon.mjs:751-754`). The gallery now reads an `island:` target
> (`packages/react/src/lagoon-gallery.ts:282-325`) and is given `scenarios` as well as `flows`
> (`packages/cli/src/lib/scaffold.mjs:412-415`). Write `/?target=…`.

An addressed island mounts **alone**, through the same synthesised one-slot archipelago config that
`motu island verify` drives, inside the gallery's chrome — so what a human looks at is what was
verified (`packages/react/src/lagoon-gallery.ts:284-290`, `:368-393`). Deliberately not "the region
that declares it, seeded": an island can be standalone, in no region at all, and for one that IS in a
region a scenario is authored against the island's own prop names while the region binds different
ones (`:284-289`). Nothing in the station list is lit, and the tide line's bar carries the address
instead (`:394-398`, `packages/react/src/tideline.ts:95-101`). Picking a station leaves island mode
and strips `target`/`scenario` from the URL, so nobody is handed a link that reopens the island they
navigated away from (`packages/react/src/lagoon-gallery.ts:449-458`).

### `step=<n>` semantics

`step` is **1-based**, and absent means "the whole flow". `step=0` is the seed alone — the state the
flow STARTS from, which is a state worth looking at and one no check ever renders on its own
(`packages/react/src/lagoon-states.ts:296-298`). A step that only asserts (`expectRender`) still
counts, because skipping it silently would make `step=3` mean different things in the URL and in the
check (`:340-341`). `step=<n>` beyond the flow's length is an error naming the real count (`:326-328`).

Replay drives the SAME seam `runRegionFlows` drives — no assertions, no mutants, no verdict — so it
reaches the state the check asserts on and cannot reach a state the check could not (`:289-295`). It
waits for the region to mount and then for it to stop moving first: a flow used to seed its state into
a region whose source had not answered yet, the answer landed a moment later and overwrote it, and the
panel reported "applied 1/1" over a different screen (`:309-316`).

### A name that resolves to nothing REFUSES to render

Not a fallback, not the default state. `reportState` sets `window.__motuLagoonState` **and** paints a
fixed red `role="alert"` banner listing what the target does declare, **and** logs to the console
(`packages/react/src/lagoon-states.ts:212-240`). Both, deliberately: the machine flag is what a check
reads, the banner is what survives into a screenshot (`:213-216`).

On the gallery, the refusal also **mounts nothing** — `root.replaceChildren()`
(`packages/react/src/lagoon-gallery.ts:510-514`). The banner alone is not the refusal: leaving the
first region on screen under it is the substitution being refused, and a screenshot of that looks like
a working lagoon (`:293-294`).

Read `window.__motuLagoonState` before believing a screenshot (`.github/host-rules.md:119`). Its shape
is `{ ok, target, kind: 'scenario'|'flow'|'none', name?, applied?, of?, error?, available? }`
(`packages/react/src/lagoon-states.ts:54-67`). The whole catalogue is on the page too, as
`window.__motuLagoonStates` (`:242-246`).

The four refusals:

| Request | Outcome |
|---|---|
| `target=island:<tag>` not in this lagoon | `no island "<tag>" in this lagoon`, `available` = every tag (`lagoon-gallery.ts:296-304`) |
| `scenario=` naming nothing the island declares | `no scenario "<x>" in <tag>'s evidence`, `available` = declared names (`lagoon-states.ts:152-172`) |
| `scenario=` with no `target=island:…` | `?scenario= addresses an ISLAND's state — name the island …` (`lagoon-gallery.ts:316-323`) |
| `flow=` declared by two regions | `"<x>" is declared by N regions (…) — add &region=<id> to say which` (`lagoon-states.ts:202-205`) |

A bare `?flow=` picks the station only when it CAN: exactly one region declaring that name. Two, and
it says so and applies nothing — the alternative is opening a region nobody asked for, with a screen
that looks like the state they wanted (`packages/react/src/lagoon-states.ts:180-186`).

### `motu lagoon states [island|region]`

Prints every state this project's lagoon can be opened in, as a URL, from the same source the browser
gets (`packages/cli/src/commands/lagoon.mjs:698-707`).

| Flag | Meaning |
|---|---|
| `[island\|region]` | filter to one target (`:715`, `:739`, `:763`) |
| `--base <url>` | absolute URLs against a running lagoon instead of paths (`:714`) |
| `--json` | `{ islands, regions }` (`:789-791`) |

Paths, not absolute URLs, unless `--base` says otherwise: the port belongs to whichever lagoon is
running, and printing a guess that resolves to nothing is worse than printing the part that is always
true (`:704-707`). Each state is addressed by its **slug** where that is unambiguous and by its exact
name where it is not — the page resolves both, and printing the slug is what makes these URLs quotable
in a commit message (`:727-733`; slug and resolution order — `#2` position, exact name, slug — at
`packages/react/src/lagoon-states.ts:79-108`). A region URL always writes `region=` out even when the
flow name is unique, because flow names DO collide and a printed URL is what somebody pastes six
months later into a lagoon that has grown another region since
(`packages/cli/src/commands/lagoon.mjs:775-780`).

`step=` is not printed — append it yourself.

---

## `serve` vs `publish`

| | `lagoon serve` | `lagoon publish` |
|---|---|---|
| Builds | chunks, held in memory (`--single`: one page) | one self-contained page; with `--remote`, chunks |
| Writes | nothing (unless `--no-build`, which reads) | `.motu/publish/lagoon-<slug>.html` (or `.manifest.json` with `--remote`) |
| Transport | forced `mock` | forced `mock` |
| Reload | `--watch` only (SSE) | never — a published artifact that dials home is a lie about what the artifact is |

Use **`serve --watch`** to iterate: it rebuilds on save and reloads every viewer, phones included, and
what it serves is the artifact `publish` uploads, so the loop and the check are one thing. Use
**`publish`** for a link that outlives your process.

There used to be a third, `lagoon dev`: a Vite dev server with HMR. It was faster per save and served
the SOURCE, not the artifact — so it never proved the inlining worked or that the page survives with no
`/assets/` and no backend behind it, and two servers for one loop meant two sets of flags to keep in
step. It is gone; `motu lagoon dev` refuses and names `serve --watch`. The Vite server itself lives on
inside `island verify` / `archipelago verify`, which boot it privately.

### `motu lagoon serve [island]`

| Flag | Meaning | Default |
|---|---|---|
| `--port <n>` | validated 1–65535 (`lagoon.mjs:410-414`) | 8817 |
| `--host` | also bind `0.0.0.0`, for a phone on the same wifi (`:416-417`) | loopback |
| `--no-build` | serve the last published artifact as-is (`:426-432`) | rebuilds |
| `--watch` | rebuild on save and live-reload open viewers; conflicts with `--no-build` (`:419-423`) | off |
| `--detach` / `--stop` | keep it running after the shell exits; stop it (see below) | |
| `--no-live` | do not announce it to the lagoon host | announces when a host is configured |
| `--single` | build one self-contained page instead of chunks | chunks |
| target flags, `--fit` | same as `publish` (`:399-408`) | |

It serves the page at **every path** and its chunks under `/__motu_assets/<manifest>/`; the page is
`cache-control: no-store`
(`packages/cli/src/commands/lagoon.mjs:449-474`) — which is why an address that only worked on
`lagoon.html` used to appear to work here. It restores the `<!doctype>`/`<html>`/`<head>` skeleton
that `publish` strips (`:297-308`); without it the page gets no viewport meta and renders
desktop-width on a phone, which is the one device this is for. Rebuilds are
debounced 250 ms and keep the last good bytes on failure (`:570-599`).

For a phone that is not on your wifi the command prints an ssh one-liner
(`ssh -R 80:localhost:<port> nokey@localhost.run`, `:492-496`) — it deliberately does not run it for
you: that URL is public while it lives. If you already run tailscale, prefer it:
the tunnel is a property of the PORT, so whichever lagoon is serving on 8817 is what is exposed, and
pointing it at another project is just running `serve` there. There is no
`motu lagoon funnel` command.

### `motu lagoon publish [island]`

| Flag | Meaning | Default |
|---|---|---|
| `--archipelago <id>` | publish one region instead of an island (`lagoon.mjs:39`, `:42-43`) | — |
| `--fit <native\|legacy>` | legacy-fit strategy for a single-island target (`:168`) | `''` |
| `--out <path>` | write somewhere else (`:174`) | `.motu/publish/lagoon-<slug>.html` |
| `--title <text>` | name in the host's listing, truncated to 200 chars (`:166-167`) | derived from the target |
| `--remote [url]` | upload as chunks instead; bare = `$MOTU_HOST_URL`, then `host.json` | off |
| `--single` | with `--remote`: upload one self-contained page (a host without chunks) | chunks |
| `--token <secret>` | upload token (`:255`) | `$MOTU_HOST_TOKEN`, then `host.json` |
| `--json` | machine-readable report (`:187-190`) | off |

The build is forced to a single chunk (`MOTU_SINGLEFILE`) because nothing serves `/assets/*.js` behind
a static page; `inlineToArtifact` inlines every script and stylesheet, drops the document skeleton, and
**throws** if any `/assets/` reference survives, because that would show up as a silently blank page
rather than an error (`packages/cli/src/commands/lagoon.mjs:108-136`). The output path is stable per
target on purpose: republishing the same path redeploys the same URL, so a link already open on your
phone keeps working (`:138-142`).

---

## Publishing to a host

`motu lagoon publish` writes one self-contained page and `motu lagoon serve` puts it on a port, but
both need your laptop awake. A **lagoon host** (`motu-host`) is that URL without the laptop.

```bash
motu-host --token $(openssl rand -hex 24)      # serve on 127.0.0.1:8818
motu lagoon publish --remote                   # any project, any agent, same host
```

### A lagoon goes to a host as CHUNKS

One self-contained file meant a one-line edit re-sent, and the host re-stored, the whole lagoon. So
`--remote` (and `serve --watch --live-push`, on every save) builds the lagoon as **stably named
chunks**, asks the host which of them it lacks, sends only those, then sends a **manifest**:

    { "motu": "lagoon-manifest/1", "html": "<the page>", "files": { "region-team.js": "<sha256>", … } }

Measured on Peps (3.1 MB, 23 regions): the first upload is ~1 MB gzipped. After that, an edit to a
region, an island or one of the app's components sends **one chunk of 3–5 kB**.

How the build is cut (`chunkOf` in `packages/cli/src/lib/lagoon-vite.mjs`):

- **Chunks are named, not hashed.** A hash in a chunk's name is written into every file that imports
  it, so one edit would change the whole chain of importers above it. The host hashes each file
  instead.
- **`vendor` and `motu` are foundations.** Each is one chunk, and changes only when the lockfile or
  motu does. If a dependency imports app code (Peps aliases `next/navigation` to a lagoon stub), that
  code is pulled into vendor.
- **The application is cut by EVALUATION ORDER**, named by directory: `region-<id>`,
  `island-<kebab>`, `host-<dir>`. A chunk ends where the directory changes, but never inside a module
  cycle, and runs under 4 kB fold into a neighbour. Every import therefore points at an earlier
  chunk, so chunks cannot import each other.
  - That matters because a cycle between chunks runs one before what it needs exists (`Cannot access
    'n' before initialization`).
  - Cutting whole directories failed on both test projects. In the demo, `src/` held both the UI the
    islands import and the screens that import the regions. In Peps, the pages import the regions and
    the regions import the pages' components, which made one 600 kB chunk.

How the host serves it:

- **The page does not know where its chunks live.** It names them `__MOTU_ASSETS__/<file>`, and
  whoever serves it fills that in. The host uses `/__motu_assets/<manifest hash>/`, which is cached for
  a year because the address is the content, so a `latest` page that moves on never mixes two builds.
- **`lagoon serve` serves the chunks itself.** When a host pulls it (`--live-url`), the host passes the
  member's prefix in `x-motu-base`, so the chunks are asked for through the host.
- **A sweep never deletes a chunk a record names.** A chunk no record names yet survives 6 hours from
  the last time a publisher asked about it. That covers a publish in progress and a draft that keeps
  saving.

The single file is still there. `publish` without `--remote` writes it for an Artifact or for opening
from disk, `serve --no-build` serves it, and `--single` uploads it to a host older than chunks.

### Where the host lives

Precedence is **flag → `$MOTU_HOST_URL` / `$MOTU_HOST_TOKEN` → `~/.config/motu/host.json`**
(`packages/cli/src/lib/remote.mjs:21`). The file is read from
`$MOTU_CONFIG_HOME || ~/.config/motu` and carries exactly two keys; anything missing or malformed
yields `{}` rather than an error (`packages/cli/src/lib/remote.mjs:23-33`):

```jsonc
{ "url": "http://127.0.0.1:8818", "token": "…" }   // mode 0600
```

That is the point of a long-running host: a fleet of agents across several repositories all publish
into one place without being configured.

The repository identity comes from the `origin` git remote parsed to `owner/name`, falling back to the
directory basename — the only name stable across machines and clones
(`packages/cli/src/lib/remote.mjs:50-68`).

### Two axes, because a link has two jobs

| URL | Meaning | Cached |
|---|---|---|
| `/<repo>/latest/<slug>` | the bookmark — follows every publish | `no-store` |
| `/<repo>/<branch>/<slug>` | the PR link | `no-store` |
| `/<repo>/<commit>/<slug>` | this build, immutable | one year |
| `/<repo>/<ref>/<slug>/__motu_frame` | the page's own bytes, for the shell to frame | as its ref |

**Every one of those serves a SHELL, and `__motu_frame` serves the artifact.** The shell is the rail,
the topbar and the dock — so the lens is on the URL a person bookmarks. It lists every lagoon this
viewer may see, with the one they opened selected, and each entry points at its own address rather
than an index into a list, so nothing has to agree with anything.

That replaced GROUPS. A group was a curated member list under `/g/<name>`, plus an immutable manifest
under `/m/<id>` to pin one — and it existed because the canonical lagoon URL served bare bytes, so
composing a group was the only way to get a rail, a dock or a lens at all. `b1719dd` had already
written down that "a group was never a thing to browse; it is a way of LOOKING at lagoons" and built
the half that mattered (an explicit per-lagoon `frameHref`), but never gave the canonical URL its
shell — so groups outlived the decision to remove them by months, listed on the host's own root index
while the motu-built index region had already dropped them. `/g/`, `/m/`, `/api/group`, `/api/groups`
and the manifest store are gone; every lagoon has the rail now, and an immutable address of its own
was always the honest way to pin one.

Templates at `packages/host/src/server.mjs:655-659`; cache headers at `:147-148`, decided by
`rec.mutable` which `resolveRef` sets true only for alias hits (`packages/host/src/store.mjs:188-202`).
Objects are content-addressed, so republishing an unchanged lagoon stores nothing new. A commit URL
from a **dirty tree** would be a lie — it would name a commit that does not contain what you are
looking at — so the CLI withholds the sha and the host falls back to the content hash, which is always
true (`packages/cli/src/lib/remote.mjs:70-78`,
`packages/host/src/store.mjs:165`). Ref lookups accept sha and content-hash prefixes, newest first
(`store.mjs:196-201`).

### Retention that cannot break a link

Two caps per repository, whichever binds first: `--max-records` (default **1000**,
`packages/host/src/store.mjs:30`) and `--max-bytes` (default **4 GB**, `:40`), also settable as
`MOTU_HOST_MAX_RECORDS` / `MOTU_HOST_MAX_BYTES` (`packages/host/src/cli.mjs:67`, `:72`). The byte cap
exists because records are not a proxy for size — a typical lagoon is ~430 kB, but Twenty's record page
inlines its whole front-end and publishes at 19.2 MB.

Eviction never touches a record a mutable alias points at (`packages/host/src/store.mjs:230-235`), and
orders by **last access** rather than publish date: a
six-week-old lagoon somebody bookmarked outranks ten builds from this morning (`:238`, `:210-215`).
Blobs are collected only once nothing references them, and two records sharing content are charged
once (`:258-260`, `:264-290`). A swept object answers **410**, not a blank page
(`packages/host/src/server.mjs:559`).

### Private repos

`motu-host access` writes a policy file (`access.json`, next to the store) read per request
(`packages/host/src/access.mjs:29`, `:50-59`). Unlisted repos are public
(`packages/host/src/access.mjs:74-76`); a repo marked `--private` is readable by the admin token, a
repo-scoped read secret, or the host-wide read secret, in that order (`:84-98`). Secrets are 32 random
bytes stored only as sha256 digests and compared in constant time (`packages/host/src/cli.mjs:134`,
`packages/host/src/access.mjs:32-47`); they are printed once (`cli.mjs:188`). `?k=<secret>` sets an
HttpOnly cookie and 302s the key out of the URL (`packages/host/src/server.mjs:228-237`).

A private repo answers **404, not 403**, with a body identical to a genuine miss
(`packages/host/src/server.mjs:524-533`). There is still no per-user account, so the read secret opens
every private repo, not just one.

Without a token the host accepts no uploads at all — every POST is `503`
(`packages/host/src/server.mjs:360`).

---

## Visual baselines

Two models. Pick one per project and do not mix them.

| | in-repo (`--update`) | on-host (`--remote`) |
|---|---|---|
| Baseline lives | `<islands>/<kebab>.snapshots/<scenario>@<viewport>.png` (`packages/cli/src/lib/snapshots.mjs:15-27`) | the host's store, as an accepted pointer per shot (`packages/host/src/store.mjs:314-318`) |
| Region baseline | `<archipelagos>/<id>.snapshots/…` (`packages/cli/src/commands/snapshot.mjs:301`) | island key `region-<id>` (`snapshot.mjs:316`, `:326`) |
| In git | the PNGs, committed (`snapshots.mjs:9-11`) | **nothing** (`packages/cli/src/lib/baselines.mjs:3-4`) |
| Failure artifacts | `.actual.png` / `.diff.png` beside the baseline (`snapshots.mjs:71-76`) | `.motu/snapshots/<island>/` — gitignored (`baselines.mjs:84-91`) |
| Blessing a change | `--update` overwrites | `--accept`, a separate command |

`<islands>` is the `islands` key of `motu.config.json`, default `src/islands`
(`packages/cli/src/lib/config.mjs:33`, `:327`). The scenario slug is lowercased with non-alphanumerics
collapsed to `-`, empty → `default`; the viewport is its NAME, not its width
(`packages/cli/src/lib/snapshots.mjs:20-27`; viewports default `{ mobile: 390, desktop: 1280 }`,
`packages/cli/src/lib/util.mjs:255-260`).

### Flags

`motu island snapshot <name|--all>` and `motu archipelago snapshot <id|--all>`
(`packages/cli/src/commands/snapshot.mjs:140`, `:354`; help at `packages/cli/src/run.mjs:150-159`):

| Flag | Meaning |
|---|---|
| `--update` | record baselines as FILES beside the evidence (the in-repo model) |
| `--remote [url]` | compare against the host's ACCEPTED baseline; nothing is written to git |
| `--accept [name]` | move the accepted pointer to what was last rendered |
| `--changed [base]` | only islands/regions this branch touched — widens back to everything, loudly, when a changed file belongs to no single one |
| `--all`, `--token <t>`, `--json` | (`snapshot.mjs:173`, `packages/cli/src/lib/baselines.mjs:22`) |

`--update` and `--remote` are mutually exclusive and say so:
`✗ --update writes files; --remote stores on the host. Use --remote then --accept.`
(`packages/cli/src/commands/snapshot.mjs:177-180`).

Comparison is `pixelmatch` over `pngjs` with a per-pixel threshold of `0.12` (absorbing antialiasing)
and an image-level fail line of **0.1 % of pixels**; a dimension change short-circuits to `resized`
because pixel comparison is meaningless across dimensions
(`packages/cli/src/lib/snapshots.mjs:45-59`, `:32-34`). Under `--remote` the host decides only the
STATUS — `new` / `match` / `changed` — from the content hash, and the CLI runs the same local
comparison against the fetched accepted bytes (`packages/host/src/store.mjs:340`;
`packages/cli/src/commands/snapshot.mjs:81-86`). `new` is not a failure; the verdict is `LOOK`, because
a new shot is a screen nobody has looked at (`snapshot.mjs:67-69`, `:235-244`).

### `--accept` is a deliberate separate act

> ACCEPT IS ITS OWN ACT. Not a flag on a checking run: "the UI should look like this now" is a
> decision, and running it as a side effect of a check is exactly what `--update` got wrong.
> — `packages/cli/src/commands/snapshot.mjs:149-150`

It moves the accepted pointer to the shot's last-seen hash and exits before rendering anything
(`packages/cli/src/commands/snapshot.mjs:151-171`; `packages/host/src/store.mjs:345-355`). With no
name it accepts everything the repo has pending (`packages/cli/src/lib/baselines.mjs:70-75`). Storing
and accepting are separate acts on the host side too — `--update` overwriting everything is why "the
baseline is stale" and "you broke something" are the same red (`packages/host/src/server.mjs:664-667`,
`packages/host/src/store.mjs:309-312`).

> **Never use `--update` on a project whose baselines are on the host — it starts a second, drifting
> copy.** — `.github/host-rules.md:104-107`

Nothing enforces that across runs. The CLI can only catch both flags in the same invocation
(`packages/cli/src/commands/snapshot.mjs:177-180`); a lone `--update` on a host-baselined project
succeeds silently.

### `motu archipelago snapshot` pictures the composed page

It screenshots the **region view**, full page, not the islands
(`packages/cli/src/playwright-lagoon.mjs:1055`; islands are element screenshots at `:898-902`).

> WHAT THIS CATCHES THAT AN ISLAND SHOT CANNOT: arrangement. The frame is not declared and therefore
> not checked, and this project has already shipped the consequence — two agents each extended the
> frame's slot lookup, the naive merge made one agent's widget render as the other's, and
> `archipelago verify --runtime` was BYTE-IDENTICAL between the correct and broken resolutions. Every
> island rendered correctly in isolation. Only the composition was wrong.
> — `packages/cli/src/playwright-lagoon.mjs:1005-1012`

Deliberately the region view, not mountpoints: the question is what a person sees
(`playwright-lagoon.mjs:1013-1016`). States come from the region's **flows' seeds**, deduped — a region
has no `scenarios` of its own, and one picture of one state would miss the case where the screen
changes SHAPE (`:1017-1021`; `packages/cli/src/commands/snapshot.mjs:264-295`).

Attribution is what makes a page-level diff usable rather than noise. Any island edit changes the
region picture, but the islands are separately baselined, so a region diff can be explained
(`packages/cli/src/commands/snapshot.mjs:345-353`). Three outcomes (`:429-444`):

- members that also changed → the region changed **because** they did;
- some members have no accepted baseline → `cannot attribute`, because an island nobody has ever
  compared can never report `changed` and claiming ARRANGEMENT on that would be the check reporting a
  conclusion it did not examine (`:396-399`);
- no member changed → **this is the ARRANGEMENT, which nothing else checks** (`:442`).

Attribution requires `--remote` and is best-effort — its absence must not fail the run (`:391`,
`:400-402`).

Motion is frozen at capture (`animation:none;transition:none;caret-color:transparent`) rather than
sampled and hoped for (`packages/cli/src/playwright-lagoon.mjs:882-884`, `:1035-1037`).

---

## The lens

**Ctrl/Cmd-K, then the `Seams` tab.** The lens is a tab of the DOCK, and the dock is drawn by whoever
HOSTS the lagoon (`@motu/chrome/dock`, mounted by `motu lagoon serve`, and by the motu
host in the shell it wraps every lagoon in). So it is on the gallery and on any hosted lagoon URL, and
it is NOT on the focused standalone entry `motu island verify` drives, nor on `/__motu_frame`, which is
the artifact by itself. Its own keycap says which chord: `⌘K` / `Ctrl K`
(`packages/chrome/src/dock.mjs:1090`).

**Ctrl/Cmd-Shift-G is the other one** — `mountDebugOverlay`, the standalone debug overlay, matched
against `KeyboardEvent.code`, default `KeyG`, overridable with `shortcutCode`
(`packages/debug-overlay/src/overlay.ts:74-75`, `:168`, `:197`). The gallery does not mount it, so the
chord does nothing there; reaching for it on a page that has the dock is the usual way to conclude the
lens is broken. Both surfaces read the same data (`currentSheet`, `currentSeams`) and both are
read-only: it observes the mount registry, the shared stores, the island definitions and the
transport call log, and never writes a store, fires a channel or forces a render
(`packages/debug-overlay/src/overlay.ts:13-14`).

**The lens is two halves, and only one of them is still a panel.** As of `b386e84` the floating panel
is retired: what it drew now lives in the lagoon's own sidebar, drawn by whoever hosts the lagoon
rather than bundled into the artifact (`packages/debug-overlay/src/overlay.ts:351-362`). What could
NOT move is the PAGE layer — outlines, wires, hit-testing, the crosshair — because it measures the
host's live DOM sixty times a second and only means anything over the running region.

So the lens now EXPOSES data and the dock renders it. The data is `sheet`, `seams`, `islands`,
`coupling`, `coverage`, `findings`, plus fixture recording
(`packages/react/src/lagoon-gallery.ts:821-835`) — and the dock shows it in **two tabs**:

- **States** — where the region is (the voyage, the atoll, flows, what-ifs).
- **Seams** — whether it is wired right: findings, the region sheet, and a **Production** section that
  appears only when the region has a coverage corpus (none: no section, rather than an empty tab).

The rest appears where it is needed. **The island card** — *About <island>* on the voyage while
anchored, or *about* on an island in the what-ifs — says what that island was given, in words and with where each
value came from ("Newcomers' welcome evening · chosen by event-list", "Dennis Shaw · set by the page",
the raw value a tap away), what its outputs do, and its what-ifs. **⋯** in the masthead holds the
view switch (only when the region offers more than one view), the page layers (coupling wires, call
cards), recording, and the artifact's own chips — what used to be the rig, a strip at the foot of every
tab.

The **region sheet — one row per key**: who owns it, who reads it, what it holds, whether it has moved
(`currentSheet()`, `packages/debug-overlay/src/findings-view.ts:298-340`). Columns are the key, its
owner (a slot, `source:<id>` for a key a declared source produces, or `host` — shown as "the page"), its readers, a value preview, and either `<slot> · <n>× · <ago>` or `seed`
— "the honest word for a key nothing has been seen to move: it holds what the page established, and no
declared write has fired" (`findings-view.ts:325-327`) — plus a flag where a declared write has never
fired or the host answered an island.

Read it before reading the archipelago; it is the same declaration, proved by the region that is
running (`.github/host-rules.md:120-123`). `MOTU_DEBUG=0` strips the lens entirely
(`packages/cli/src/lib/scaffold.mjs:458-459`).

### A call that landed says so, without being asked

Everything above is something you OPEN. The Network list answers "what did this screen send" perfectly
and answers it only to somebody who already suspected there was something to ask — which in a lagoon
is the hard half: the fake fetch replies without touching the network, so a screen that fired nine
requests and one that fired none look identical in every instrument a browser has.

So a call that LANDS says so — as a SIGNAL off the dock's bar (beside the rail on a wider screen),
in words rather than as a log line. There are three shapes, because there are three facts:

- **An answer that went fine** is not news. It never becomes a card. It counts on the wave
  (`3 answered`), and the count fades once the calls stop.
- **A failure a fixture declared** is the state working. The mock's `{ status: 500 }` in "a failing
  search reports its failure" is supposed to fail. It shows in sand, marked `as declared`, and leaves
  after a few seconds.
- **A failure nobody declared** is the alarm: a 404 no fixture answers, a throw, an abort. It shows
  in coral, with one line on what it means ("Nothing answers it — no fixture, no wire route…"), and it
  stays until you dismiss it. Even after you dismiss it, a coral pennant stays on the bar until you
  open Seams.

    ┌──────────────────────────────────────────────┐
    │ ⚑  Asked to search                [as declared] │
    │    MemberService · search — failed, 500       │
    └┬─────────────────────────────────────────────┘
     │   (the mast: it hangs off the bar it came from)

Pressing a signal opens the panel on `Seams`, at the section its door reports into: `Network` for a
wire call, `Asked for` for a contract call. The same call is waiting there with its payload.

The feed tells the two kinds of failure apart with `declared` on the call. `MockTransport` throws a
declared failure as a `MotuError` with `declared: true`, and the wire records the same thing beside
the response, never in it. The application takes the same code path either way. Only the dock reads
the difference.

Both doors that have an address record into one feed (`beginCall` in `@motu/core`). The lagoon
publishes that feed on its control surface (`calls()`, `onCall()`) for chrome drawn outside the
artifact. A TRACED HOST MODULE is deliberately absent: a stubbed export has no status, so it stays in
`Asked for`, which can describe it honestly.

Where a contract call's address comes from is the transport's business: `Transport.endpoint?()`, which
`HttpTransport` answers and an in-process transport does not.

Signals repeat by COUNTING (`×3`), never by stacking. A phone shows one signal at a time, a wider
screen two. A signal never shows while the panel is open, because the panel says all of it at
length.

`Signals` in the ⋯ menu has three settings: on, failures only, and off. It is also in the palette,
and the choice is remembered. `dockInset=off`, the flag the checks already set to take the dock's
strip back, suppresses signals, so no baseline moves with the timing of a fetch.

---

## An island that cannot be bundled does not take the lagoon with it

The lagoon builds every archipelago as ONE chunk. So an island whose import graph cannot be bundled
for a browser — a Next server action reaching `node:async_hooks` five hops down, say — used to kill
the whole build: rollup died thousands of modules deep, and NO state in the project was openable. A
cold-start adoption ended with a fully green `motu check --runtime` and not one URL to hand over,
which is the worst state for a tool whose promise is that every declared state has an address.

Such islands are now left OUT of the build and their slots render a placeholder naming the reason:

    ! 1 island(s) left out of this build — they cannot be bundled, and the rest of the lagoon still works:
        · sso-options — reaches modules/ee/sso/actions.ts, which is a 'use server' module …

The island's own verdict is unchanged: `motu island verify <name>` still fails, and its preview is
still broken. What changes is the blast radius — every other island stays previewable. Exclusion is
decided by the same `rsc-boundary` analysis the island's own check reports, so the two cannot disagree.

`MOTU_NO_EXCLUDE=1` restores the old all-or-nothing behaviour, for when you want the raw bundler
failure.

## `latest` follows the DEV SERVER when one is running

`<host>/<repo>/latest/<slug>` is not "the last publish" — it is *the current answer*. When a dev
server has announced itself, the host proxies that URL to it and a viewer sees what you are editing;
when none has, it falls back to the last published bytes. Immutable commit URLs are never live, on
purpose: a URL keyed by content must keep meaning what it meant.

`motu lagoon serve --watch` announces automatically:

    live at: http://<host>/<repo>/latest/<slug>
    the host will fetch it from: http://127.0.0.1:5173

`--no-live` opts out, for a dev server on a shared machine that should not become the address a team
is looking at. `motu lagoon serve --watch` also announces, and additionally offers `--live-url` (tell
the host a name it can reach, gated by `MOTU_LIVE_ALLOW` on the host) and `--live-push` (send bytes
instead of being fetched, for when the host cannot reach you at all).

A live member expires after 90 seconds and the CLI heartbeats every 30, so a dev server that dies
decays back to the last publish on its own rather than leaving a dead address. Stopping the server
deregisters immediately.

**Live is HOT.** The member's path is a PREFIX: `motu lagoon serve --watch` sets Vite's `base` to it, so every
URL the dev server emits already carries it, and the host forwards everything under that prefix —
the page, the module graph, and the HMR WebSocket upgrade at `…/__motu_hmr`. A viewer sees your edits
without refreshing.

Three things about this are easy to get backwards, and each cost a debugging round:

- **The prefix belongs to the dev server, not the proxy.** With `base` set, it serves
  `/<repo>/latest/<slug>/@vite/client` and knows nothing about `/@vite/client`, so the host forwards
  the path WHOLE. Stripping it is the reverse-proxy reflex and it is wrong here.
- **Vite concatenates `base` with `server.hmr.path`**, so the path must be relative (`__motu_hmr`).
  Giving the full path doubles the prefix; the page and every asset still work and only the socket
  fails, which is visible nowhere except inside the served `@vite/client` module.
- **The live registry is in memory.** A host restart forgets every live member until the next
  heartbeat (30s), so a 404 straight after restarting the host means "not re-registered yet".

### Outliving the shell that started it

    motu lagoon serve --watch --detach     # runs on, logs to .motu/cache/lagoon-serve.log
    motu lagoon serve --stop                # signals it and deregisters the member at once

An agent's lagoon dies with its session, which is exactly when someone wants to keep watching.
`--detach` reparents it; `--stop` signals it AND tells the host directly, because a signal handler
racing an async POST against process exit is not reliable — measured, the process died and the host
listed the member for another 54 seconds. A second `--detach` refuses while one is running, and a
crash needs no cleanup: the member expires on its own after 90 seconds.

## Known traps

**Absolute asset paths.** `/images/…` resolves on a local lagoon at the root of its own origin, and
404s the moment the page is hosted (`.github/host-rules.md:133-134`). Hosting is the
first place that difference is visible, so the host says it: an upload is **refused (422)** when the
fragment still references `/assets/` — that build's inlining did not happen — and anything else
absolute is a **warning**, printed by the CLI and returned in the JSON
(`packages/host/src/server.mjs:627-645`; `packages/cli/src/commands/lagoon.mjs:284`). The warning is a
finding.

**Invented data in a frame is a third copy nobody diffs.** Evidence lives in evidence files, and the
lagoon is not one (`.github/host-rules.md:86-93`). See
[10 — Evidence and testing](10-evidence-and-testing.md).

**Behaviour written inside a frame runs only in the region view** — where the flow checks are not. Make
it a `channel`, or answer it at the wire (`.github/host-rules.md`). Both are installed for every view;
a frame is not.

**`mount` must match the host application.** `"mount": "react"` in `lagoon.config.json`, and the same
value on both entries, or the lagoon shows a mount path the project does not ship
(`packages/cli/src/lib/scaffold.mjs:401-403`). Replaying a flow needs the React mount path and says so
(`packages/react/src/lagoon-states.ts:303-307`).

**`--no-build` serves what `publish` last wrote**, not your working tree
(`packages/cli/src/commands/lagoon.mjs:426-432`).

**The lagoon cannot reproduce host CSS collisions or auth expiry.** A small integration test alongside
it stays necessary.

---

## See also

[01 — Concepts](01-concepts.md) ·
[02 — Getting started](02-getting-started.md) ·
[03 — CLI reference](03-cli-reference.md) ·
[04 — Configuration](04-configuration.md) ·
[05 — Archipelagos and regions](05-archipelagos-and-regions.md) ·
[06 — Composition and adoption](06-composition-and-adoption.md) ·
[07 — Checks and verification](07-checks-and-verification.md) ·
[09 — Coverage](09-coverage.md) ·
[10 — Evidence and testing](10-evidence-and-testing.md) ·
[11 — Contract and backend](11-contract-and-backend.md) ·
[12 — Hosts and adapters](12-hosts-and-adapters.md) ·
[13 — Agents and skills](13-agents-and-skills.md).
