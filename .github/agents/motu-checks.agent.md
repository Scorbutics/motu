---
name: motu-checks
description: The motu rules for RUNNING and READING checks, in full: which check when and what it costs (motu check, --runtime, --fast, --changed, --audit, snapshots), the three exit codes (0 holds · 1 contradicted · 2 could not run — retry, do not repair), a check that looked at nothing, `motu integrate check` as the last mile, placed vs rendered, what motu does not check, and the lagoon as part of the handover. Load before running checks to decide one is done, when reading a verdict you do not understand, and before handing work over.
---

# motu-checks — Running and reading checks

The rules for running and reading motu's checks — the detail behind the short `motu:rules` block in the project's instructions. Read the part you need; each section stands alone.

## The rules

WHAT MOTU DOES NOT CHECK: unit tests and `tsc` are deliberately outside every motu check. motu is
integration-shaped — regions, coupling, what renders from a declared seed. Logic inside a source or a
helper needs the host's OWN test runner, and motu will never tell you it is missing. Run the host's
typecheck and tests yourself; a green `motu check` says nothing about either.

THE LAGOON IS PART OF THE HANDOVER, not an optional step. Before you say UI work is done, a person
must be able to OPEN it:

    motu lagoon serve --watch --detach      # survives your session; stop it with --stop

It announces itself to the shared host and appears in the gallery under a slug scoped to your branch,
so several agents working the same repository do not overwrite each other's preview. Every `motu
check` verdict prints either the live URL or how to start one. **End your report with that URL and
the specific state you want looked at** (`motu lagoon states`) — a summary of a passing check is not
a handover, because the thing the work is for is a rendered region and nobody has seen it.

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

## Three tiers, and which one you are in

    motu check                        STATIC        1.4s    every change
    motu island verify <n> --runtime  ONE ISLAND    ~15s    while you work
    motu archipelago verify <id> --runtime  ONE REGION ~25s  while you work
    motu lagoon try <id> [step…]      EXPLORE       ~5s    before you know what to assert
    motu check --runtime --fast       NO BROWSER   44.0s    while you work (5.9s with --changed)
    motu check --runtime              DOES IT WORK 103.5s    before handing work over
    motu check --audit                IS IT USABLE          before integrating, and in CI
    motu island snapshot --all --remote      DID IT MOVE    89s    before handing work over
    motu archipelago snapshot --all --remote DID THE PAGE   18s    before handing work over

(measured on a 16-island, 2-region project; the snapshots on a 20-island, 3-region one)

NAME WHAT YOU TOUCHED. While you are working on a region, the runtime check you run is that region and
its islands — `motu archipelago verify login --runtime`, `motu island verify login-form --runtime` —
not the whole project. The full `motu check --runtime` re-drives a browser for every island in the
repo to tell you about the one you changed; run it ONCE, before handing work over, and after that only
if you changed something shared.

`--changed` IS NOT THAT SCOPING, and reaching for it instead will cost you the run. It narrows only
while EVERY changed file maps to an island or a region, and widens back to everything the moment one
does not — loudly, which is the design: a check that quietly examined less than you think is the worse
failure. What does not map is most of a real session: the page, the screen that installs a source, the
app-side region type, `roots/lagoon/src/lagoon.tsx`, a shared evidence module, the generated barrels.

Measured on this project, mid-session: 16 changed files unattributable, so a full run. Files that
provably cannot reach a render (`.claude/`, `.vscode/`, `.idea/`, `.github/`, `*.md`) no longer widen
it and the lagoon's per-region module now maps to its region — that took it to 14 unattributable, and
it STILL ran everything, because `app/dashboard/profile/page.tsx` and four app-side files remained.

So: `--changed` is worth passing, and it is not a plan. The plan is naming the region.

THE LAST THING YOU DO, both of them, with `--changed`. Scoped to one touched island that is 11s and
15s — cheaper than the `--fast` loop — because `--changed` maps a changed island to the regions that
declare it, and a region's picture is its members composed. Unscoped they cost about what
`check --runtime` costs, which is why they belong in the same slot: the punctual gate, not the loop,
and not a nightly job — drift detected a day later has a dozen changes behind it and can no longer be
attributed to any of them.

`--changed` widens back to everything, loudly, when a changed file belongs to no single island; and a
scoped sweep that pictured nothing exits 2 with NOTHING TO PICTURE rather than green.

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
right, and what is not right is not knowing. acme's actions page places eight islands inside
`{weeksLoaded ? (availableWeeks.length > 0 …)}`, which is the same branch that hid a crash on the empty
list for months.

The lagoon renders every declared slot unconditionally, so it cannot catch this either. Between the two
of them: the lagoon proves the island works, `integrate check` proves the page names it, and NOTHING
proves the page reaches it. That gap is the honest boundary of static integration checking — closing it
needs the page rendered, which is the host's own test runner, not motu's.
