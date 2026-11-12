---
name: motu-regions
description: The motu rules for DECLARING a region, in full: island vs host, the page survey, declaring only decisions, region state and ownership (writes, bind, reads, one producer per key), useRegion/seed, foreign stores (StoreAdapter), catalogue regions, an island that IS the app's component and its providers, `planned: true`, several agents on one region, staged adoption (root, slots, exclusive), sources and ports and the adapter, unit tests for sources, removal-check, and what motu does not check. Load before creating or changing an archipelago, an island's place in a region, a source, or a page that composes a region.
---

# motu-regions — Declaring a region

The rules for declaring a region — the detail behind the short `motu:rules` block in the project's instructions. Read the part you need; each section stands alone.

## The rules

motu is an ARCHITECTURE framework: you build a page's regions one at a time, and what keeps them
coherent is DECLARED — who owns each piece of region state, which island fills which slot, what the
region asks of a backend. The lagoon (every declared state at its own URL) is what those declarations
make possible; it is not a component gallery and it is not the product. When a rule below asks you to
declare something, the declaration IS the work — the preview is how you check it.

 - What the region SHOWS or ACTS ON is an island; what merely ARRANGES it is not. A pure layout and an
   overlay anchored to a DOM id anywhere on the page stay host components. A control that owns region
   state is an island EVEN IF other islands sit inside it — DOM nesting says nothing about ownership,
   and `slots` (prop -> slot, in the archipelago) declares which island fills which of its props, so
   the region composes the same way in the page and in the lagoon.

 - Before a PAGE gets islands, SURVEY it (`/island-locate`) and write the answer down: which regions
   become islands, which stay host, who owns each shared key, and whether the page becomes an
   archipelago. The scope of a region is the PAGE, never a DOM subtree — an archipelago drawn around
   the div that happens to contain the islands cuts through the coupling it exists to declare.

 - Declare only what you DECIDED. An island file is `island('x-tag', Component)` — its props, its
   callback-events and the host modules it reaches are read from the component into
   `islands/contracts.generated.ts` by `motu sync`, and a stale one is a build error. What stays
   hand-written is the decision: an event whose region name differs from the callback's
   (`{ events: { onProgress: 'week-progress' } }`), and in the archipelago the `writes`, the `slots`
   and any renamed `bind`.

 - Region state is DECLARED, not emergent. A key an island updates is declared in that island's
   `writes` (event → key); every other bound key is host-fed, DERIVED — do not list it. `bind` is the
   region's keys (`bind: ['compactMode', { stats: 'networkStats' }]`), the map form only for renames.
   The page cannot assign a produced key — the host-side region type omits them, so it is a compile
   error. If you find yourself computing a value in the page from what one island did and passing it to
   another, that is the laundering the ownership rules exist to stop: declare the output instead.

 - The page reads region state with the binding's `useRegion()` and establishes it with `seed(...)`,
   both typed from the archipelago (`createRegion`). Never reach for a store directly.

 - A host that ALREADY has a state architecture (Jotai, Zustand, a Redux slice) does not have to move
   its state into motu's store, and should not be asked to. Declare the region over the keys it
   already has, then install a `StoreAdapter` — `get(key)` and `subscribe(keys, onChange)`, about ten
   lines — and `observeForeignStore(archipelago, adapter)`. motu then AUDITS what it cannot enforce:
   a key an island declares it owns, moving with no declared output to account for it, shows in the
   lens as "wrote outside the declaration". It reports the key and the declared owner, never the
   culprit — naming that would mean being in the write path, which is the rewrite this avoids. Know
   the boundary: motu ENFORCES its own store and only AUDITS someone else's, and no CLI check sees a
   foreign store at all, because every runtime check drives the lagoon.

 - `docs/05-archipelagos-and-regions.md` in the motu repo is the reference for how a region declares
   ownership, and `docs/07-checks-and-verification.md` for the checks that enforce it; read them
   before changing how a region declares anything.

## A UI that lives in the database, not the repository

A metadata-driven app (Twenty: widgets and views are rows, dispatched on a codegen'd enum) has no
`islands: [...]` in source. Declare the region `membership: 'catalogue'` and give every data-summoned
island a `member:` — the app's own discriminator, not the motu slot. Islands WITHOUT `member` are
chrome and are still checked for placement; a catalogue region is mixed, and treating it as pure
reports the chrome as a hallucinated widget type.

Do NOT hand-write fixtures to make the lagoon render. The app already had to solve this: its tests
and stories need the metadata too, so it carries a capture in-repo plus a script that refreshes it
from a live instance (Twenty: `scripts/mock-data/generate-*.ts` → 2.3 MB under
`testing/mock-data/generated/`). Point `capture` in `<id>.evidence.ts` at THAT, with `universe` read
from the schema enum. Both sides are then the app's artifacts and motu only compares.

What the comparison buys, and why data-driven UI is an advantage rather than an obstacle: a declared
member absent from the schema enum is UNREACHABLE (it can never render — a typo or a hallucination),
a captured type nobody declares is UNCOVERED (the region renders less than the page does). Neither is
answerable when membership lives in JSX. Watch for the empty answer: Twenty's own transport serves
`FindAllRecordPageLayouts` with `[]`, which renders as an empty page and looks like a working one —
`unservedOperations()` catches the missing handler, coverage 0% catches the empty one.

## An island can BE the application's component

If the host already owns the component, the island declares it directly — `component: FieldsWidget` —
and no wrapper is written. A wrapper that only installs providers or draws chrome is motu-only code
in the app's repository, which is what adopting motu is supposed to avoid.

Where the pieces go: what an island CANNOT RENDER WITHOUT is `providers` in the lagoon overrides
(installed in EVERY view, per island, like a channel); the ARRANGEMENT is `layout` (region view
only); the widget row or props are `seed` DATA. Getting this wrong is invisible in the region view
and fatal in the mountpoints view — which is the one the flow checks drive, so it reads as "the
region rendered nothing" rather than "no providers".

Providers must be IDEMPOTENT. The frame installs them for its own chrome and each island installs
them for itself, so they nest — fine for context providers, fatal for a `<Router>` (React Router
throws, and both cards rendered as "Invalid Configuration"). Gate the ones that cannot nest
(`useInRouterContext()`).

Evidence must not import the frame. `<id>.evidence.ts` is read by plain node where the app's `@/…`
alias does not resolve, so keep the rows in a module with no application imports and let both sides
import THAT. The failure is a silent "flows could not be read", not an error at the import.

## An island that reads the host's store has to say so

`bind` is the prop path, and it is the only reader motu sees by itself. An app with its own state has
readers with no prop at all — Twenty's side panel subscribes to a Jotai atom and renders the settings
for whichever widget it names. Declare those with `reads: ['key']` on the island, or the key is
written by an island, read by nobody motu knows about, and `coupling` reports a real coupling as one
that escapes the archipelago. It is a CLAIM, not a wire: motu cannot enforce a store it does not own,
but the claim can be contradicted by the lens and by a flow.

**One producer per key, and a catalogue can break that.** Any widget card in Twenty writes
`pageLayoutEditingWidgetId`, so declaring `writes` on two members made the ownership guard fire — and
it was right: "either of these writes it" is not a producer. The writer is the CARD, chrome shared by
every member. When that happens the honest model is motu's own rule — a control that owns region
state is an island even when others sit inside it — so the card becomes an island containing the
widget, via nested `slots`. Until then the key is host-written, and say so.

## One producer per key, checked in the fast loop

Two islands declaring `writes` for the same key is an error, statically — not a runtime store-guard
complaint you reach after the work is done. Grouped by ELEMENT, not by slot: one island placed in two
slots (acme's filter panel, desktop + mobile drawer) is one producer and must stay legal.

This is what makes parallel agents safe without any new mechanism. Declare the WHOLE region in the
survey — every slot, every owner — before any island is implemented. Each agent then branches from an
archipelago that already contains the other agents' ownership, so a second claim on a key fails in
that agent's own branch, on their first `motu check`. The archipelago IS the claim registry; a
separate ledger would only restate it.

## Surveyed but not built: `planned: true`

Declaring a whole region up front is what makes parallel work safe — an agent branches from an
archipelago that already carries everyone else's ownership. Measured on a two-agent run, the cost was
a region RED in every branch until the last island landed, and a permanently red region teaches
everyone to ignore it.

`planned: true` on an island entry splits the two questions. Ownership still counts it — a second
claim on its keys fails exactly as if it were built — while the checks that ask "does it exist, does
it mount, is it placed" skip it, and a `planned` warning keeps it visible.

The flag REMOVES ITSELF: once the island is registered, `planned: true` becomes an error. A survey
that quietly turns into a list of things nobody built is worse than no survey, so the state cannot
persist past the moment it stops being true.

## When several agents build one region at once

These bind you whether or not someone launched you as part of a fan-out.

- **You own ONE slot.** Do not edit another island's files, another island's entry in the archipelago,
  or the region's shared type. If you believe the shared type is wrong, SAY SO in your report and stop
  — changing it is a decision about everyone's work, made by someone who can see all of it.
- **Remove `planned: true` from your own entry only.** It is how the region learns your island exists.
- **Ship a coverage step for your slot** in the region's `<id>.evidence.ts`: `expectRender` naming text
  your island alone produces. Without it, a slot wired to a neighbour's data passes every check.
- **Do not repair shared infrastructure.** A failing install, a missing browser, a path that resolves
  outside the project — that is exit 2, "could not run". Report it. An agent that symlinks its way past
  a broken environment inherits a problem it then has to explain, and does it in everyone's tree. This
  happened: one agent stopped and reported, another improvised and produced a false runtime failure.
- **Say what got in your way.** Framework friction is the most valuable thing you can return, and it
  is invisible to whoever reads only your diff.

The files several agents WILL collide in: `islands/registry.ts` and `islands/contracts.generated.ts`
(generated — regenerate with `motu sync`, never hand-merge), the shared stylesheet (append-only,
keep both sides), and the archipelago (one entry each, so a line-level merge is usually right). In a
lagoon frame, prefer an append-only LOOKUP over a ternary chain: two people extending one chain cannot
both win, and the loser's island renders someone else's data.

## "motu is load-bearing" names a file, and the cause is above the line it points at

`removal-check` deletes every file that is 100% motu, unwraps its tags everywhere else, and asks
whether the host still typechecks. When it fails, read it in this order — the report now prints all
three, so nothing here needs digging:

- **"could not rewrite these files"** — the surgery threw and that file was left ALONE, so it proved
  nothing and every error naming it is a consequence, not a finding. It means the rewriter met a JSX
  shape it cannot express. Report the shape: that is motu's bug before it is yours.
- **"compose a region but are NOT deletable"** — the one that costs an afternoon if it is not said.
  A composition root is deleted WHOLE only when EVERY import it makes is motu's; one application
  import and it is stripped instead, leaving `createRegion(...)` with its imports gone and errors on
  lines that look fine. The report names the offending imports. Whatever needs the application — a
  source's PORT, a service, a browser API — belongs in an app file that renders the real components
  inside `<R.Island slot="…">`, not in the composition root.
- **a dangling import of a deleted module** — never the line it points at. It is the first case,
  one file earlier.

The shape that satisfies all of this is the one the annuaire page already uses: the region binding and
its wrapper in `components/motu/`, importing nothing but motu; the port, the source and the real
components in app files that wrap them in `<R.Island>`. The lagoon installs the same source through
`channelFrom`, because there is no page there to do it.

## A source is REAL in the lagoon; its PORT is the stand-in — and the adapter is yours to prove

Worth being exact about, because it decides how much a green region actually claims.

When a flow runs, the source is the APPLICATION'S OWN OBJECT. Its timeout, its precedence rules, its
generation guard, its error mapping, its intent dispatch — all of that executes. What is swapped is
the PORT: production hands it Supabase and the services, the lagoon hands it fixtures. So a region
flow proves more than "the wiring type-checks"; it proves the page's own logic behaves, against
answers a human chose.

What it CANNOT prove is the seam on the other side of the port: that the real adapter
(`currentUser()` returning `{ email, user_metadata }`, `fetchCurrentMember()` returning
`primarySectorId`) matches what the backend actually sends. Get that shape wrong and every motu check
stays green while production breaks. The lagoon replaces the host module so completely that nothing
shows a fetch happened — that is the point of it, and it is the boundary.

## WHAT MOTU DOES NOT CHECK, and is your job

motu checks COMPOSITION: that a region's islands are placed, that a declared coupling carries, that
every declared state renders. It runs no typecheck and no test runner, and it never will — a green
`motu check` says nothing whatever about whether your components are correct inside.

Two classes are yours, and no amount of motu makes them motu's:

- **Logic inside a component.** A filter that stops matching on one field, `some` where `every` was
  meant, an off-by-one on a count. These render fine, compose fine, and pass every check here.
- **The path from a user's action to a declared output.** A flow EMITS an island's declared event —
  `emit: { slot: 'search', event: 'term', detail: 'staging' }` — which enters the region *past* the
  component's own handler. A handler that ignores its argument, so typing changes nothing, passes
  every flow you can write. This is not a gap to be closed with more flows; it is where the model
  ends and a unit test begins.

Measured, on a real screen: eight regressions injected into a motu region and into the same feature
built with plain props. The project's own unit tests caught five; motu's flows caught one — and that
one was a RENDER assertion, the class the tests missed. They are different instruments. Write both,
and do not read a green `motu check` as coverage.

So a source that carries logic gets UNIT TESTS, in the host's own runner, over a hand-made port. Not
because motu asks for a second suite, but because that is the only place the branches no rendered
state distinguishes can be reached: a lookup that THREW versus one that answered null, a deadline, the
precedence in a prefill, the slower of two submits not overwriting the faster. `lib/tests/unit/
actions-week-source.test.ts` is the shape. A flow drives a source through the screen; a unit test
drives it directly, and you want both for the same reason you want `expectRender` as well as `expect`.

THERE IS NO CHECK FOR THIS, deliberately. A `sources-tested` warning used to fire when no test file
imported a declared source, and it was removed: whether the application's own code has unit tests is
not motu's judgement to make. Nothing else in the framework opines on a host's test suite, and it
could only fire once a source already existed — so it encouraged TESTING an extraction, never the
extraction itself. What produces the pattern is structural: the lagoon renders a region WITHOUT the
page, so orchestration left in page effects cannot be previewed at all.

And the adapter itself — the few lines that turn the backend's shape into the port's — belongs to
whatever proves this app against a real backend. Where the call goes through one of the app's own
backend operations, that is ASSAY's ledger: it records the shape of every outbound payload (never the
values) and fails when it differs from `.assay/operations.json`. That is precisely the other half of
the port's assumption — the port says what the source expects, the ledger says what the operation
sends.

Know the gap that leaves, and do not repeat the mistake this paragraph used to make. A client that
talks to the database or the auth service DIRECTLY — `supabase.auth.getUser()`, a PostgREST read or
an `rpc` in a repository — is not an operation, so it has no declaration and neither tool pins its
shape. This text called that "a few lines by construction, which is the mitigation". It was wrong:
counted on the project it was written for, the direct-from-browser path was ~40 modules naming 89
Postgres functions — the app's DOMINANT data path, not an adapter. Nobody had counted it, and the
guess became a rule.

So: measure the gap in YOUR host before deciding it is small, and never read a green assay run as
covering it. What guards that path is RLS alone, which makes the review surface the POLICY rather
than a declaration. Routing the read through a backend operation is the fix where the read deserves
one; where it does not, say plainly that the path is unpinned rather than describing it as narrow.

## Adoption is staged, and stage 1 does not touch the page

A region's arrangement lives in the archipelago's `root` — the application's own layout component,
with `slots` mapping its props to the region's islands, rendered by the page AND by the lagoon from
the same map — or in a hand-written lagoon frame, which is a second description of the page. Both are
supported, and which one you are in is a STAGE, not a verdict.

Adopt as a THIN OVERLAY first: islands, `<X.Island>` inside the page's existing JSX, a frame that
holds only the application's own components. `region-root` reports that shape as `ok` and names `root`
without failing on it, because moving a page is a real refactor of the host's own code and no project
can do ten of them before its first green run. Then migrate ONE region at a time, when you already
have a reason to open its page. Then, when the last one is done, set `"regionRoot": "required"` in
`motu.config.json` — the switch that makes the arc finish rather than stall half-done.

A MIGRATION SWEEP ACROSS EVERY REGION IS THE WRONG SHAPE, and the reason is not diff size. Two things
change in a move to `root` that no check sees:

 - EXCLUSIVITY GETS DEMOTED. A ternary whose branches cannot both render becomes two independent
   props, and nothing enforces that at most one is non-null — acme's actions page traded
   `weeksLoaded ? <WeekNavigator/> : <Skeleton/>` for a `weekNav` prop and a `weekNavPlaceholder` prop
   rendered adjacently, with a comment standing where the guarantee used to be. DECLARE the pair —
   `exclusive: [['weekNav', 'weekNavPlaceholder']]` on the archipelago — and `<X.Root>` will not
   compile with both: the page writes one condition, `{...(ready ? { weekNav } : { weekNavPlaceholder })}`.
   Undeclared, nothing sees it.

 - THE SERVER/CLIENT BOUNDARY MOVES. The root renders inside `<X.Region>`, a client component. A
   layout the page rendered on the server crosses into the client bundle when it becomes the root, and
   the nesting inverts: acme's `/forgot-password` went from `page → AuthLayout → Screen` to
   `page → Screen → Region → AuthLayout`. Same pixels, different tree, different bundle. Read what the
   extracted layout imports before moving it.

What the migration BUYS is one thing, and it is worth being exact about it: the lagoon previews the
page instead of a drawing of it. Islands, contracts, ownership, coverage and `removal-check` work the
same in either shape — `removal-check` rewrites `<X.Root>` back to the layout component and unwraps
`<X.Island>`, so both shapes survive deleting motu. What it COSTS is that the extraction is not
reversible by the tool: removal leaves the extracted layout files behind, where stage 1 returns the
page to exactly the JSX it had. So the trade is lagoon fidelity against a page you can still hand back
unchanged, and a region earns the move when someone is already editing it.

A frame that genuinely must draw its own markup says why once — `inventedArrangement('why', <…/>)`
downgrades the error to a warning, and warnings do not fail `motu check`. It is a HOLD, not an answer.
`motu archipelago adopt-root <id>` does the derivable half of a migration and refuses rather than
guessing when the frame nests two host components.
