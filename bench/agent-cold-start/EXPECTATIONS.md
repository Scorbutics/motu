# Pre-registered expectations

Written before the arms were launched. The point is that a run which contradicts these is *more*
informative than one that confirms them, and that neither can be re-described afterwards as what we
expected all along.

## H1 — the on-ramp is short and does not need the docs

`motu init` → a lagoon state opened in a browser, in **fewer than 10 motu invocations, with zero doc
dives**. If this fails, `motu --help` and `init`'s own output are not carrying the framework, and
that is the first thing a Show HN reader will hit.

Expected failure modes if it fails: host alias inheritance (`@/*`), Tailwind detection, two copies of
React, and — because both target apps are pnpm monorepos and motu's reference adopters are not — the
`node_modules/@motu/*` symlinks landing in the wrong `node_modules`.

## H2 — the friction concentrates where the CLI stops speaking

Most FRICTION entries will fall in **evidence files** (`*.evidence.ts`) and the **lagoon override
map** (`layout`, `seed`, `channels`, `wire`, `providers`). These are the parts with no scaffold —
deliberately, per `create.mjs`: a stub full of TODOs was judged worse than no file — so they are also
the parts a stranger has to learn from prose. This is the prediction most likely to identify a
concrete thing to fix before release.

Arm B is expected to hit `providers` specifically, because its page cannot render without two React
contexts, and the failure mode documented in CLAUDE.md is that getting this wrong is *invisible in
the region view and fatal in the mountpoints view*.

## H3 — the last mile is uneventful for motu and eventful for the host

`motu integrate check` should pass with ≤2 files touched after the region is green. The surprises,
if any, should come from the **host's own typecheck** — the seam motu explicitly does not cover
(the adapter on the far side of a port, a server component boundary, a `useState` the page kept).

If `integrate check` itself produces surprises, the claim that the lagoon predicts the page is
weaker than advertised.

## H4 — the control never looks

The control agent will land a type-correct change **without ever rendering the screen**, and its
shared state will end up somewhere a second writer could reach (a `useState` lifted into the page,
or a context with no declared owner). This is the comparison worth publishing: not that motu is
faster, but that the default path produces unlooked-at UI and undeclared ownership.

If the control *does* render it and *does* put the state somewhere defensible, motu's pitch needs to
be narrower than "screens go unlooked-at".

## H5 — the perception check finds something, or costs nothing

The fresh-eyes look is the most expensive check in the set per unit of coverage. Either it catches an
invention that every mechanical check passed — which is the claim CLAUDE.md makes on the strength of
two prior catches — or this run is evidence that the claim needs a bigger denominator before it goes
in a README.

## What would change the plan

- If an arm exits 2 repeatedly for environmental reasons, that is a **finding about the classifier**,
  not a reason to repair the environment mid-run.
- If an arm cannot boot a lagoon at all, stop that arm and report the wall. A blocked on-ramp is the
  single most important result this bench could produce.
