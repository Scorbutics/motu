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
 - SHOW YOUR WORK on the shared lagoon host, don't stand up another server. `motu lagoon publish
   --remote` (no argument — the URL and token live in `~/.config/motu/host.json`) uploads the
   self-contained page and prints two URLs: `latest`, which follows every publish, and an immutable
   one keyed by the commit. That is how a human looks at what you built without your process staying
   alive. `motu lagoon group <name> --all` composes every published project into one gallery. The rule
   is ONE long-running host plus occasional spawns: `motu lagoon dev` / `lagoon serve --watch` while
   you iterate, killed when you stop. A second permanent preview server is what the host replaces.
   Absolute asset paths (`/images/…`) work under `lagoon dev` and 404 once hosted — the publish output
   warns about them, and the warning is a finding.

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

## One producer per key, checked in the fast loop

Two islands declaring `writes` for the same key is an error, statically — not a runtime store-guard
complaint you reach after the work is done. Grouped by ELEMENT, not by slot: one island placed in two
slots (peps' filter panel, desktop + mobile drawer) is one producer and must stay legal.

This is what makes parallel agents safe without any new mechanism. Declare the WHOLE region in the
survey — every slot, every owner — before any island is implemented. Each agent then branches from an
archipelago that already contains the other agents' ownership, so a second claim on a key fails in
that agent's own branch, on their first `motu check`. The archipelago IS the claim registry; a
separate ledger would only restate it.

## A flow step must be able to fail

`flow-mutation` runs with the region's flows and asks whether they could have failed. Two rules:

- **By construction** — a step whose `expect` names only keys that same step `provide`d asserts that
  the lagoon stored what it was handed. Decidable without a browser, and always an error.
- **By mutation** — each assertion-bearing step is re-run with its stimulus changed (a value the
  region cannot mistake for the real one). If the assertion still holds, it does not depend on the
  input and is asserting a constant.

Write flows that survive both: end on a key another island produces, or on `expectRender` of an
island that is NOT the one being driven.

Know the limit. A stand-in's invented vocabulary passes both rules — an assertion on text you wrote
into a stub is perfectly sensitive to its stimulus. Only rendering the application's own component
makes that visible, which is why an island on a host that owns the component IS that component.

## An island ships with evidence that asserts its OWN render

Two agents added an island to one region in parallel. Both wrote correct islands; the merge is where
it went wrong, and no check caught it.

Both had extended the lagoon frame's `rowFor` ternary — whose fallback was the NOTES row — so taking
either side of that conflict alone makes the other agent's widget render as Notes. Wrong, and
rendering. `archipelago verify` was byte-identical between the correct and the naive resolution: the
frame is ARRANGEMENT, it is not declared, and nothing checks it. The only thing that would have
distinguished them is a flow asserting on the new island's own rendered content — which neither agent
wrote, because nothing required it.

So: adding an island means adding a step to `<id>.evidence.ts` that asserts what THAT island renders.
Not the region's existing steps — its own. `render-coverage` names the slots no flow looks at.

`expectRender` asserts what a person can PERCEIVE in that slot, not one DOM property: rendered text,
a control's accessible name (`aria-label`/`alt`/`title`), a field's current value, and a checkbox's
`checked`/`unchecked` state. `innerText` alone could not see a passenger's name in an input or a
seat's identity in an aria-label, which left an island made of form controls with almost nothing
assertable. Widening the haystack does not weaken the check — a wrong value and another island's text
both still fail — and the failure message prints the whole surface, so what WAS there is visible.

A step may assert with NO stimulus. Some islands take no input — Twenty's tasks and timeline widgets
ignore the row they are bound to and render from the record context — so `provide`ing something just
to have a stimulus produces a constant, and `flow-mutation` will (correctly) reject it. Write
`{ expectRender: { '<slot>': '<text>' } }` alone: the claim is "this slot renders THIS island", which
is not a data flow and is still worth making.

Two smaller ones from the same run. Prefer an append-only LOOKUP over a ternary chain in a frame two
people may extend. And if you use git worktrees, do not symlink `node_modules` into them: `git add -A`
commits the symlink, the merge replaces the real directory with it, and the next build dies on ELOOP.

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

## Three outcomes, three exit codes

A check that did not RUN is not a check that failed. `report.inconclusive` is for the environment
giving out — a port that never opened, Chromium missing, a dev server losing a race — and the verdict
line says INCONCLUSIVE rather than PASS or FAIL.

    0  the declarations hold
    1  something contradicted them        -> repair
    2  a check could not run              -> retry, do NOT repair

This exists for unattended loops. A human shrugs at a port timeout and re-runs; an agent reads `✗` and
repairs a bug that does not exist, and several agents produce several confident wrong repairs.

The classifier requires BOTH a known environmental signature AND the absence of any application cause
in the output — because a port that never opened *because the project does not build* is a finding,
whatever the headline says. Verified in both directions: a missing browser gives exit 2, a missing
import in the region's frame still gives exit 1.

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
(generated — regenerate with `motu island sync`, never hand-merge), the shared stylesheet (append-only,
keep both sides), and the archipelago (one entry each, so a line-level merge is usually right). In a
lagoon frame, prefer an append-only LOOKUP over a ternary chain: two people extending one chain cannot
both win, and the loser's island renders someone else's data.

## Three tiers, and which one you are in

    motu check                        STATIC        1.4s    every change
    motu check --runtime --fast       NO BROWSER   44.0s    while you work (5.9s with --changed)
    motu check --runtime              DOES IT WORK 103.5s    before handing work over
    motu check --audit                IS IT USABLE          before integrating, and in CI

(measured on a 16-island, 2-region project)

`--fast` means NO BROWSER: islands mount under happy-dom in node. It used to be an island-only flag
whose REGIONS still booted chromium — 43s of an 87s run — because a region's flows, mutation and render
are browser-only. They are now skipped and said (`– region-runtime`), so the loop is genuinely
browser-free and the browser work happens once, at the end.

What the browser still owns, and why it cannot move: layout (`responsive`), accessibility (`a11y`), and
everything about a REGION — a flow only exists where islands are mounted together. Those are the last
step before handover, not the loop.

`--runtime` answers whether the region does what it declares: islands mount, scenarios differ, declared
writes reach their key, flows end as promised, and every step could have failed. `--audit` adds
`responsive` and `a11y` — the two most expensive per-island checks, whose answer changes when the
RENDERING changes, not when a key moves. Running them on every edit buys nothing and costs half the
run; running them never is how a region ships unusable on a phone. So they are a gate, not a loop, and
a run without them says so (`– audit  responsive + a11y not run`) rather than staying quiet.

`--audit` implies `--runtime`: asking whether a UI is usable at every viewport only means something
against something that rendered.

## Placed is not the same as rendered

`integrate check` reads the host's SOURCE: it can see `<X.Island slot="y">` and cannot see whether the
branch containing it ever runs. A slot inside `{isOpen && …}`, a ternary or a `.map()` callback now
reports as conditionally placed — a WARNING, because a drawer or a permission gate is often exactly
right, and what is not right is not knowing. peps' actions page places eight islands inside
`{weeksLoaded ? (availableWeeks.length > 0 …)}`, which is the same branch that hid a crash on the empty
list for months.

The lagoon renders every declared slot unconditionally, so it cannot catch this either. Between the two
of them: the lagoon proves the island works, `integrate check` proves the page names it, and NOTHING
proves the page reaches it. That gap is the honest boundary of static integration checking — closing it
needs the page rendered, which is the host's own test runner, not motu's.

## Where an island's input came from

The lagoon replaces a host module so completely that nothing shows a fetch happened: no request, no
network row, and the lens shows the KEYS that resulted, never the question that produced them. Looking
at a region and seeing no HTTP at all is accurate and tells you nothing.

Wrap a stub's exports in `traced(module, fn, impl)` and the region reports what the islands actually
asked for:

    ✓ provenance  islands fetched: fetchClubCounters() ×4, fetchClubFeed(11) ×4  · 8 host call(s)

`ambient` says which host modules an island IMPORTS; this says which it CALLED, with what arguments,
and how often. Two things become visible that nothing else catches: an island that renders content
while calling NOTHING (its data came from somewhere it never declared), and a module it imports but
never reaches (a stale `ambient`, or a stub standing in for something unused).

It is also the integration list. The calls recorded here are exactly what the real page has to answer,
which is the closest thing motu has to confronting the lagoon with the page it targets.
