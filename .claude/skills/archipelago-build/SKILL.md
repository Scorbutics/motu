---
name: archipelago-build
description: Build a WHOLE screen as a motu region with several agents at once. Surveys the page, declares every slot and owner up front (`planned: true`), fans out one agent per island, then merges, writes the region's flows and drives the result in the lagoon. Use when a new screen has three or more islands; for a single island use island-create. Invoke by asking to "build the <page> screen with several agents", or `copilot --agent=archipelago-build`.
---

# archipelago-build — Custom Agent

You build one SCREEN with several agents working at the same time. You do not write islands; you write
the CONTRACT they build against, then you integrate what comes back. The `motu` CLI owns everything
deterministic; you own the survey, the split, and the merge.

Read `README.md` and the project's own `CLAUDE.md` first. `island-locate` is the reading step and
`island-create` is the single-island loop — this agent is neither, it is the fan-out between them.

**Do not fan out below three islands.** Two agents cost more coordination than they save, and a region
whose islands are really one component should stay one island.

## 1 — Survey, and write the answer down

Run `island-locate` (or do its work) and produce the region: which slots exist, what each SHOWS or
ACTS ON, and — the part that matters here — **who owns each shared key**.

Then write two files before any island exists:

- `src/shared/<region>-region.ts` — the region's state as a type, with the produced keys named
  (`ProducedXKeys`) and `HostRegion<…>` for the page's half.
- `src/archipelagos/<id>/<id>.archipelago.ts` — EVERY slot, with `bind`, with `writes` on the owner,
  and **`planned: true` on all of them**.

Typecheck it and run `motu archipelago verify <id>`. It should PASS with a `planned` warning. That
green is the point: ownership is now enforced for islands nobody has written, so a second claim on a
key fails in the claimant's own branch rather than at merge.

Commit this. Every agent branches from it.

**A contract is good when a flow can end on an island no step drives.** Prefer a shape with a
consumer — a summary, a total, a preview — that reads what the others write. If every island only
writes its own key and nothing reads across, the region's flows can only assert echoes.

## 2 — Split, one slot per agent

One agent per island, each in its own git worktree. Give each agent the brief below verbatim, changing
only the slot. Do not tell an agent about the others' internals; the archipelago is what they share.

> Build ONE island in a motu project. Work ONLY inside `<worktree>`.
> Read `CLAUDE.md` first — it is binding. Then read the region type and the archipelago.
> Your island is `<slot>`, already declared as `<the entry>`.
> Build: the component in `src/ui/<name>/` (every prop optional, it must render from defaults alone),
> the island in `src/islands/<name>.island.ts`, and `src/islands/<name>.evidence.ts` with at least
> three scenarios that render visibly differently.
> Add a coverage step to the region's evidence asserting text YOUR island alone produces.
> Remove `planned: true` from your entry only.
> Run `motu island sync`, then `motu island verify <name> --fast` while you iterate (happy-dom, no
> browser), then `motu island verify <name> --runtime` ONCE when it looks right, then the project's
> typecheck.
> Exit codes: 0 pass · 1 a real finding, fix it · 2 could not run, retry or report — never "fix" code
> for a 2.
> Touch nothing belonging to another slot, and do not edit the shared region type — if you think it is
> wrong, say so in your report and stop.
> Report: files changed, the verify output verbatim, and anything about motu that got in your way.

## 3 — Merge

Expect every shared file to conflict. Resolve by kind, not by hand:

- `islands/registry.ts`, `islands/contracts.generated.ts` — **regenerate** (`motu island sync`). Never
  hand-merge a generated file.
- the shared stylesheet — append-only, keep both sides.
- the archipelago — one entry each, so a line-level merge is usually right. Afterwards check that
  exactly the built islands lost their `planned` flag; a stale flag is an error and the check says so.
- a lagoon frame — if two agents extended a slot→data lookup, take BOTH. A ternary chain with a
  fallback silently renders one island's data in another's slot; convert it to an append-only map.

## 4 — Write the region's flows

The islands cannot do this: a flow is about the region, and no island can see across the seam.

In `src/archipelagos/<id>/<id>.evidence.ts`, write the journey — several steps that build on each
other, each ending on the island that READS rather than the one you drove. The seed establishes the
starting state once; steps accumulate.

A region's flows need a browser — `--fast` skips them and says so — so this step is where the browser
work belongs. `motu archipelago verify <id> --runtime` must pass with:
- `region-flow` — the journey ends as declared,
- `flow-mutation` — every step dies when its stimulus is mutated,
- `render-coverage` — every slot is asserted by some flow.

### Which level, when

    motu check                              STATIC       every change
    motu check --runtime --fast             NO BROWSER   the loop (~6s scoped, 44s whole)
    motu archipelago verify <id> --runtime  ONE REGION   the region you are building (~25s)
    motu check --runtime                    EVERYTHING   once, before handing over (~104s)
    motu check --audit                      layout + a11y — before integrating, and in CI

Fan-out agents iterate on the first two. The browser is paid once, by you, at steps 4 and 5.

THE REGION YOU ARE BUILDING IS THE ONE YOU CHECK. `motu archipelago verify <id> --runtime` drives that
region's flows, mutation and render; `motu check --runtime` drives every island in the repository to
tell you the same thing. `--changed` reads like the answer and is not: it widens back to everything
whenever a changed file belongs to no island or region, which a page, a source or a shared evidence
module always does.

## 5 — Look at it, then hand over

Open the lagoon (`motu lagoon dev --archipelago <id>`) and DRIVE it: click, type, toggle, and check
that a change in one island moves what a different island renders. A region can pass every check while
nobody has ever used it.

Then picture it, which is the one thing driving it by hand cannot leave behind:

```bash
motu archipelago snapshot <id> --remote      # the composed page, per flow state × viewport
```

This is the region's only check on ARRANGEMENT. The frame is not declared, so `archipelago verify`
is byte-identical between a correct composition and one where two slots swapped — which has happened
here, on a merge, and shipped one agent's widget rendering as another's. If the diff names no changed
member island, the arrangement is what moved.

### The final look is a FRESH agent's

You built this region, so you are the one reader who cannot see an invention in it — a fixture's
vocabulary, a state the app never enters, a label nobody uses. It is in your context as a premise.
Spawn a subagent and hand it THREE things and nothing else:

- the state URLs (`motu lagoon states --json`),
- where the application's own vocabulary lives — the region's types, the modules it names,
- the question: *does this screen belong to THIS application? Does anything render a word, a state
  or a shape the app never uses?*

Do NOT pass the diff, the plan, the transcript or your reasoning. That contamination is the entire
thing you are spending a subagent to avoid. Its answer is a finding, not a formality: every check
before this one compares the region to what the region declares, and this is the only one that
compares it to the app.

Hand back: the screen, the flows, and a list of what the agents reported as friction. That last list is
the most valuable output of a fan-out and the easiest to drop.

## What this agent does NOT do

- It does not integrate into a host page — that is `motu integrate check` and the page's own work.
- It does not review island code line by line. The gate is the checks plus the driven lagoon; if that
  is not enough, the missing check is the finding.

## Adoption is staged, and a frame is where you start

A region's arrangement lives in ONE of two places, and both are supported on purpose:

- **`root` on the archipelago** — the application's own layout component, with `slots` mapping its
  props to this region's islands. The page renders `<X.Root results={…} />` using its own prop names
  and never writes a slot; the lagoon renders the SAME component from the SAME map. There is no second
  description, so the two cannot differ. Safe by construction.
- **A hand-written lagoon frame** (`layout` in the overrides) — a second description of the page,
  checked but not eliminated: `island-composition` compares WHICH islands the region is made of
  against what the page places, and `region-root` refuses arrangement the frame invented. Nothing
  compares the ARRANGEMENT itself.

THE ARC IS THREE STAGES, and a project is expected to sit in the middle one for a long time:

1. **Frame.** Adopt motu as a thin overlay: islands, `<X.Island>` in the page's existing JSX, a frame
   that holds only the application's own components. `region-root` says `ok` and names `root` without
   failing on it. The page is untouched, so nothing can regress in it.
2. **Migrate opportunistically.** Move ONE region to `root` when you already have a reason to open its
   page — you are reading it and testing it anyway, and the extraction is nearly free at that moment.
   Never as its own sweep across every region: that is a large diff whose risky parts are invisible
   (see the two hazards below), and it is how a refactor that "changed no behaviour" ships a
   regression.
3. **Close it.** When the last region has a `root`, set `"regionRoot": "required"` in
   `motu.config.json` and a frame becomes an error from then on. That is the switch that makes the
   arc finish instead of stalling half-done.

**An extraction uses the frame, and that is correct rather than a concession.** You are working on a
page that already exists and already expresses its own arrangement in JSX. Moving it to `root` is a
region-level refactor of the host's own code; doing it in the same step as pulling out one island
couples two changes and hides the risky one. Extract the island, look at it in the lagoon, then decide
about the region.

**A frame that must draw its own markup says why, once.** `region-root` errors on a frame that holds
intrinsic elements or literal text, because that is a drawing of the page rather than the page. When
the arrangement genuinely cannot be expressed by the app's own components yet, wrap it:
`inventedArrangement('why', <…/>)`. It downgrades the error to a warning, and warnings do not fail
`motu check`. It is a HOLD, not an answer — the reason string is what a later reader uses to decide
whether it is still true.

`motu archipelago create` is the opposite case and scaffolds `root` first: a NEW region has no page to
restructure, so the safe shape is free there. `motu archipelago adopt-root <id>` does the derivable
half of stage 2 — frame's host component to `root`, each `island('x')` and the prop it sits in to
`slots` — and REFUSES rather than guessing when the frame nests two host components.

**If the region ALREADY declares a `root`**, `motu island integrate` adds the slot to `slots` for you
and prints the two things it cannot derive — the prop to add to the root component, and the line the
page must pass. Do both, or the island is declared and never placed.

### The two hazards of a migration, neither of which `motu check` sees

Moving a page to `root` is not "the JSX moved" — that part is checkable. These two are not:

- **EXCLUSIVITY GETS DEMOTED.** A ternary whose branches are mutually exclusive by construction
  becomes two independent props, and nothing enforces that at most one is non-null. acme's actions page
  went from `weeksLoaded ? <WeekNavigator/> : <Skeleton/>` to a `weekNav` prop and a
  `weekNavPlaceholder` prop rendered adjacently, with a comment where the guarantee used to be. When
  `slots` cannot express an either/or, KEEP the ternary in the page and pass one node — not two props
  and a promise.
- **THE SERVER/CLIENT BOUNDARY MOVES.** The root is rendered from inside `<X.Region>`, which is a
  client component. A layout the page used to render as a server component crosses into the client
  bundle when it becomes the root — acme's `AuthLayout` did, and the nesting inverted from
  `page → AuthLayout → Screen` to `page → Screen → Region → AuthLayout`. Same pixels, different tree.
  Check what the extracted layout imports before you move it.

`region-root` reports which shape a region is in on every run, and does not fail on stage 1.

## Before you hand it over: motu did not test your logic

`motu check` is green when the region COMPOSES — islands placed, declared couplings carrying, every
state rendering. It runs no typecheck and no test runner. Two things are yours:

- **logic inside the component** (a filter that stops matching a field, `some` for `every`, an
  off-by-one) — renders fine, composes fine, passes everything here;
- **the path from a user's action to a declared output** — a flow that EMITS the island's declared
  event enters the region past the component's own handler, so a handler that drops its argument
  passes it. Write `{ click: '<accessible name>' }` instead when the control has one: the component
  fires its own output, by the path a person takes. Accessible name only — no selectors, no `fill`,
  no waits. Anything beyond one click is Playwright's job, not motu's.

Measured on a real screen: of eight injected regressions, the project's unit tests caught five and
motu's flows caught one — and that one was a render assertion the tests missed. Different
instruments. If the component you just wrote or wrapped carries logic, say in your handover that it
needs unit tests in the host's own runner, and do not present a green `motu check` as coverage.


## Before you hand this over

A person has to be able to OPEN what you built. Start (or confirm) the detached lagoon, which
announces itself to the shared host under a slug scoped to your branch:

    motu lagoon dev --detach
    motu lagoon states          # the address of each declared state

**End your report with the live URL and the one or two states you want looked at.** A passing check
describes files; the work is a rendered region, and until someone opens it nobody has seen it. Every
`motu check` verdict now prints the live URL, or how to start one if there is none.

And say plainly what motu did not check: the host's typecheck and its test runner, both of which are
yours to run.
