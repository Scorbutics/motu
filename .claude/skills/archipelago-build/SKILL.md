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
> Run `motu island sync`, then `motu island verify <name> --runtime`, then the project's typecheck.
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

`motu archipelago verify <id> --runtime` must pass with:
- `region-flow` — the journey ends as declared,
- `flow-mutation` — every step dies when its stimulus is mutated,
- `render-coverage` — every slot is asserted by some flow.

## 5 — Look at it, then hand over

Open the lagoon (`motu lagoon dev --archipelago <id>`) and DRIVE it: click, type, toggle, and check
that a change in one island moves what a different island renders. A region can pass every check while
nobody has ever used it.

Hand back: the screen, the flows, and a list of what the agents reported as friction. That last list is
the most valuable output of a fan-out and the easiest to drop.

## What this agent does NOT do

- It does not integrate into a host page — that is `motu integrate check` and the page's own work.
- It does not review island code line by line. The gate is the checks plus the driven lagoon; if that
  is not enough, the missing check is the finding.
