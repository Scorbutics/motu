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

 - The RUNTIME pass adds what only a browser can answer: the island mounts, its scenarios differ, it
   fits every declared viewport, axe finds nothing in it, every declared write reaches its key, and a
   region's flows end as declared. It costs SECONDS PER ISLAND and far more per region, so it is
   SCOPED to what you added or reshaped — `motu check --region <id>` / `--island <name>` — and the
   whole-project `motu check --runtime` is the scheduled CI's, never an agent's step. Not the dev
   loop either. While you work, iterate in the lagoon and lean on the static checks;
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

A DECLARED FLOW THAT DID NOT RUN HAS NOT PASSED — there is no fourth outcome where it is a warning
under PASS. A flow INVALID as declared is caught statically: `flow-provide` (exit 1, `motu check`)
refuses a step that `provide`s a key a declared source produces, because the lagoon refuses that write
and the step could never run. A step the page refuses at runtime fails ITS flow (`region-flow`, exit 1)
and the region's other flows still run. A lane that could not drive any flow is `inconclusive` (exit
2) when the environment gave out and an error (exit 1) otherwise; a declared flow with no verdict at all
is named as not run. `motu check --runtime` and the `--all` sweeps print INCONCLUSIVE and exit 2 when a
member could not run, exactly as a single verify does — and their `--json` `pass` is false for it.

## Three tiers, and which one you are in

    motu check                              STATIC       1.4s    every change — the gate you close on
    motu check --region <id>                ONE REGION   ~25s    you added or reshaped a region
    motu check --island <name>              ONE ISLAND   ~15s    you added or reshaped an island
    motu lagoon try <id> [step…]            EXPLORE      ~5s     before you know what to assert
    motu check --fast --region <id>         NO BROWSER   ~5s     while you work (islands only, happy-dom)
    motu check --runtime                    EVERYTHING   minutes the scheduled CI — NOT an agent's step
    motu check --audit                      IS IT USABLE         the scheduled CI, and before integrating
    motu island snapshot --all --remote      DID IT MOVE    89s    before handing work over
    motu archipelago snapshot --all --remote DID THE PAGE   18s    before handing work over

(the scoped and static rows measured on a 16-island, 2-region project; the snapshots on a 20-island,
3-region one. On Peps — 80 islands, 23 regions — static is ~45s, `--region <id>` adds its runtime on
top (~20s warm), and the whole-project `--runtime` is ~26 minutes cold)

THE WHOLE-PROJECT BROWSER PASS IS CI'S, NOT YOURS. `motu check --runtime` re-drives a browser for every
island and every region in the repository — every flow, every flow mutant, every flow replayed with
each asserted island nulled. It grows with slots × flows, not with what you changed, and on a project
of any size it is the run that makes an agent's session wait on motu. It runs on a schedule (nightly)
where its cost is nobody's critical path. Do not run it to close a task, and do not run it "once,
before handing over" — the static `motu check` plus `motu integrate check` is the gate you close on.

SCOPE THE BROWSER TO WHAT YOU BUILT. When you add or reshape UI — a new region, a new island, a new
part of a screen, a flow — the runtime check you run is THAT, named:

    motu check --region login              # the region + its member islands, in the browser
    motu check --island login-form         # one island (comma-separate several of either)

The static checks still cover the whole project in the same run, and the verdict line says what the
browser drove and what it did not (`runtime: 6 re-proved · 0 replayed · 98 static only`). A change that
moves no rendering (a rename, a declaration, a type) needs no browser at all. `motu archipelago verify
<id> --runtime` and `motu island verify <name> --runtime` are the same scoped checks, one target each.

THE CI RUN IS SPREAD OVER LANES. `--jobs <n|auto>` (default auto: half the cores, at most 4) runs the
browser pass on several worker processes, each with its own lagoon and browser, longest targets first;
the verdict is the same as on one lane. A lane that dies leaves its target INCONCLUSIVE (exit 2).

A REPLAYED VERDICT IS A VERDICT. Every runtime result is stored against a fingerprint of what it
depends on — the target's import graph (the app's own files it reaches, its islands, the regions it
docks with), the framework, the browser, the configs and the flags. When none of those moved since a
run that held, the verdict is replayed and SAID: `· runtime replayed — inputs unchanged since proved 3h
ago`. Only clean verdicts are kept: an error or an INCONCLUSIVE always re-runs. Something that reads the
clock is re-proved daily. `--no-cache` re-proves everything; `--max-age 7d` re-proves what is older.

`--changed` IS NOT THAT SCOPING. It narrows by git path, only while EVERY changed file maps to an island
or a region, and widens back to everything the moment one does not — loudly, which is the design: a
check that quietly examined less than you think is the worse failure. What does not map is most of a
real session: the page, an app-side source, `roots/lagoon/src/lagoon.tsx`, a shared evidence module.
Name the region instead.

`--changed` IS RIGHT FOR THE SNAPSHOTS, the last thing you do: scoped to one touched island they are
11s and 15s, because `--changed` maps a changed island to the regions that declare it. Unscoped they
cost about what the whole runtime pass costs. A scoped sweep that pictured nothing exits 2 with NOTHING
TO PICTURE rather than green.

`--fast` means NO BROWSER: islands mount under happy-dom in node. It used to be an island-only flag
whose REGIONS still booted chromium — 43s of an 87s run — because a region's flows, mutation and render
are browser-only. They are now skipped and said (`– region-runtime`), so the loop is genuinely
browser-free and the browser work happens once, scoped, at the end.

What the browser still owns, and why it cannot move: layout (`responsive`), accessibility (`a11y`), and
everything about a REGION — a flow only exists where islands are mounted together. For what you built,
that is `motu check --region <id>` before handover; for the project, it is CI.

`--runtime` answers whether the region does what it declares: islands mount, scenarios differ, declared
writes reach their key, flows end as promised, and every step could have failed. `--audit` adds
`responsive` and `a11y` — the two most expensive per-island checks, whose answer changes when the

RENDERING changes, not when a key moves. Running them on every edit buys nothing and costs half the
run; running them never is how a region ships unusable on a phone. So they are a gate — the scheduled
CI's, and `--audit --region <id>` for a region you built for a phone — not a loop, and a run without
them says so (`– audit  responsive + a11y not run`) rather than staying quiet.

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

A DOCKED island adds a third question — WHERE it rendered — and `dock-placement` (runtime, per region
that docks or opens a claimed dock) answers it: in each composed dock state the island must be inside
the dock element (`[data-motu-region-dock]`), exactly once, rendering something; in the region's own
view it must be at its fallback (or nowhere, `fallback: 'none'`). "Rendered" is not the claim — an
island stuck at its fallback beside an empty dock renders fine and passes every other check. The static
`dock` check (motu check) and `integrate check`'s `dock` rows cover the declarations and the page: B's
root must RENDER each dock prop it opens — read from the root component's own source, so a layout that
dropped `{aside}` is an error naming the dock and the file, before any browser; a page passing B's dock
prop itself is an error; a hand-rolled `createPortal` in a page or root that
composes a region is a warning that names the dock to declare instead.
