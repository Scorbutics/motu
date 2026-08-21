UI work goes through motu (islands, archipelagos, the lagoon):
 - What the region SHOWS or ACTS ON is an island; what merely ARRANGES it is not. A pure layout and an
   overlay anchored to a DOM id anywhere on the page stay host components. A control that owns region
   state is an island EVEN IF other islands sit inside it — DOM nesting says nothing about ownership,
   and `slots` (prop -> slot, in the archipelago) declares which island fills which of its props, so
   the region composes the same way in the page and in the lagoon.
 - Before a PAGE gets islands, SURVEY it (`/island-locate`) and write the answer down: which regions
   become islands, which stay host, who owns each shared key, and whether the page becomes an
   archipelago. The scope of a region is the PAGE, never a DOM subtree — an archipelago drawn around
   the div that happens to contain the islands cuts through the coupling it exists to declare.
 - NEW UI content starts as an island with at least one scenario in its `*.evidence.ts`, and is looked
   at in the lagoon (`motu lagoon serve --watch`, or `motu island verify <name>`) BEFORE it is placed
   on a page. An island must render from defaults alone — every input optional, with a default.
 - CHANGED UI starts with the scenario that shows the state you are about to change. Then change it,
   look at it, and keep the scenario as the regression. A scenario set whose members render identically
   fails `data-flow` — that check exists because fake evidence is worse than none.
 - Declare only what you DECIDED. An island file is `island('x-tag', Component)` — its props, its
   callback-events and the host modules it reaches are read from the component into
   `islands/contracts.generated.ts` by `motu island sync`, and a stale one is a build error. What stays
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
 - `motu integrate check` is the LAST MILE, and the lagoon cannot answer it: does the HOST compose the
   region (`createRegion`), place every declared slot, read it back (`useRegion`), and — the one that
   bites — has the page stopped keeping its own `useState` of a key an island produces? A region can
   pass every other check while no browser has ever rendered it, because every other check looks at
   motu's files. Run it before saying an integration is done.
 - Before saying UI work is done: `motu check` (island + archipelago verify over everything, plus
   removal-check), on top of the host's own build. It takes `--json`. Warnings are findings, not noise —
   `props-match` and `ownership` exist because each caught real coupling. It is STATIC and fast: verify
   answers "has this drifted from what it declares?", which is a question about source.
 - `motu check --runtime` (or `motu island verify <name> --runtime`) adds what only a browser can
   answer: the island mounts, its scenarios differ, it fits every declared viewport, axe finds nothing
   in it, and every declared write reaches its key. It costs SECONDS PER ISLAND — a browser pass per
   scenario × viewport — so it is a PUNCTUAL gate: before handing work over, in CI, or nightly across
   the project. Not the dev loop. While you work, iterate in the lagoon and lean on the static checks;
   `--verbose` names each runtime step with what it cost. The lane opens ONE lagoon page for the whole
   run and re-aims it per island (data in, declared outputs fired), so the cost is the first boot, not
   a boot per island — do not add checks that navigate or restart it. Viewports and the a11y severity policy are
   declared once in `lagoon.config.json`.
 - A region declares its FLOWS in `<id>.evidence.ts` beside the archipelago: a seed, an island's
   declared `emit`, and the keys the region must hold afterwards. That is where a coupling becomes
   something that runs — `motu archipelago verify --runtime` fails when a flow no longer ends as
   declared. A flow may only fire a declared output; if you reach for a selector, you have left the
   harness and written a browser test.
 - EVIDENCE lives in evidence files, and the lagoon is not one. An island's scenarios go in
   `<name>.evidence.ts`, a region's flows in `<id>.evidence.ts`, and anything BOTH need goes in one
   module they import with a RELATIVE specifier — `@/` does not resolve in the loaders that read
   these files, and the failure is silent (the island keeps its scenarios in one check and loses them
   in another). Type that module against the APP's own types with `import type`: it erases at
   runtime, so the loaders are unaffected, and a renamed field then fails the build there instead of
   quietly previewing last month's shape. Invented data in a lagoon frame is a third copy nobody
   diffs.
 - The lagoon override file is a MAP, not a page. `layout` points at the APPLICATION's own layout
   component — never a second JSX copy of the arrangement, which drifts for the same reason a second
   copy of the region's vocabulary does. `seed` is data. Anything that REACTS — the stand-in for the
   page's fetch, answering an island's intent — is a `channel`: it is installed in every view, so the
   checks that drive the region see the same answers a human does, and the lens can show it fired.
   Behaviour written inside the frame runs only in the region view, where those checks are not.
 - `motu island snapshot --all` checks the visual baselines (one per scenario × viewport, committed
   beside the evidence). A difference writes `.actual.png` and `.diff.png` next to the baseline — LOOK
   at them; re-record with `--update` only when the change is what you intended.
 - The lens (Ctrl/Cmd-Shift-G in the lagoon) opens on the REGION SHEET: one row per key — who owns it,
   who reads it, what it holds, whether it has moved, and a flag where a declared write has never fired
   or the host answered an island. Read it before reading the archipelago; it is the same declaration,
   proved by the region that is running.
 - `docs/plan-key-ownership.md` in the motu repo is the design record for ownership, eject and the
   verify checks; read it before changing how a region declares anything.

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

## A flow the host drives, asserted on what renders

A region whose islands only READ has no `emit` to declare — and it still has a promise. Use a
`provide` step (the app moving its own state) and end on `expectRender`, not on `expect`.

`expect` names region keys, so a step whose `expect` names the key its own `provide`/`emit` targets
cannot fail unless the lagoon itself is broken. The assertion worth writing is what ANOTHER island
shows: Twenty's record page proves `editingWidgetId` moves exactly one of two widgets, in both
directions, and back to neither. Negate one clause and re-run before believing a green flow — a step
that cannot fail is not a check.

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

## A check that looked at nothing has not passed

`report.ok(check, msg, seen)` takes what it examined, and `seen: 0` becomes a `skip` automatically —
so a check cannot report success from an empty search whether or not its author thought about
emptiness. Pass a count (or the array) at every `ok` where the input set can be empty, and the report
prints it: `✓ islands-registered  all 3 island tag(s) are registered · 3 declared tag(s)`.

This exists because `removal-check` printed "no motu references in the host application" over a fully
integrated app — it scanned Next's directories, found none of the host's, and called the emptiness a
pass. It now exits 1 with "scanned 0 files … nothing was examined, so nothing is proved".

When you add an escape hatch, TEST THE HATCH. `hostSources` was added for exactly that bug, with a
message telling users to set it, and did nothing for a day: `loadMotuConfig` returns a hand-built
whitelist and silently drops any key not in it. Add the key there, then reproduce the original bug and
watch the fix refuse it.
