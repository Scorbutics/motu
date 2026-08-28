# Agents and skills

motu is two halves: the CLI is the **deterministic** half — it scaffolds, edits registries by AST, and
verifies — and the shipped skills are the **judgement** half, which decides what to build, where the
region's boundary is, and who owns each key. A repo that adopts motu needs both, so `motu skills
install` writes them in whatever format its coding agent reads, and installs the standing rules
(`.github/host-rules.md`) into the host's own instruction file at the same time — because the framework
was enforcing a shape nobody had told the agent about.

---

## The four skills

Shipped from one source per skill, discovered from `.github/agents/*.agent.md`
(`packages/cli/src/commands/skills.mjs:39-58`). `motu skills list` prints them with their descriptions
(`skills.mjs:132-142`).

| Skill | Reach for it when | It produces |
| --- | --- | --- |
| **island-locate** | before a page gets islands at all | a **report**, no files |
| **island-extract** | UI the app *already has* becomes an island | one island (+ a component, on an ocean host) |
| **island-create** | a **new** capability, designed fresh | a component, an island, evidence, an integration |
| **archipelago-build** | a whole screen, three or more islands, several agents at once | a declared region, a fan-out, a merge, flows |

### `island-locate` — the reading step

Reads **one page** and decides what motu should be told about it: which regions become islands, which
stay host, what the page's shared state actually is and who owns each key, and whether the page becomes
an archipelago. **Locating is read-only** — it creates no files and refactors nothing
(`.claude/skills/island-locate/SKILL.md:8-17`, `:156-158`). It is the step people skip, which is how a
page ends up with an archipelago drawn around a DOM subtree, a key nobody reads, or a "coupling" that
was only ever prop drilling (`SKILL.md:11-13`).

The order it works in: learn the project's shape from `motu.config.json` first — `host` above all,
because it decides whether a React component already exists (`SKILL.md:19-36`); enumerate what the page
*renders*, not what it defines (`:42-51`); classify each region as island or host by **what it does**,
never by where it sits in the DOM (`:53-67`); then the actual job — sort every value the page holds into
island-owned (`writes`), host-fed (a `bind`, and not a `writes`) or page-local (not region state at all)
(`:69-88`). Candidates are ranked by value ÷ cost with one override: **start with the island that
carries the coupling** (`:90-105`). The deliverable is a fixed-shape LOCATE REPORT ending on *the first
move* — one candidate, one verb, one command (`:124-153`).

### `island-extract` — WRAP or REWRITE

Turns UI the application already has into an island. The shape is read from `motu.config.json`'s
`host`, not judged (`.claude/skills/island-extract/SKILL.md:25-45`):

| `host` | shape | what you produce |
| --- | --- | --- |
| `next` / `vite` / `none` | **WRAP** | no component at all — the island points at the one the app owns |
| `angularjs` | **REWRITE** | a mode-agnostic React component under `ui/`, authored from legacy source |

Getting this wrong is the one mistake the skill can make that no check catches: a forked component
drifts silently, and a rewritten one is a second copy nobody diffs (`SKILL.md:13-15`). A wrapper that
exists only to install providers or draw chrome is motu-only code sitting in someone's repository —
exactly what adopting motu is supposed to avoid (`SKILL.md:36-40`). `isolation` is **not** this
discriminator, however it reads (`SKILL.md:44-46`).

### `island-create` — a new capability, closed in the lagoon

Builds a **new** island designed fresh, closes the loop in the lagoon against fixtures, and only
integrates into the real page once it passes (`.claude/skills/island-create/SKILL.md:8-12`). Seven
steps: pick or create the archipelago **first**, because an island exists to sit on a page and the
archipelago *is* that page (`:32-37`); build in the lagoon; verify and **write down what the lagoon
cannot cover** — inputs still on defaults, host coupling only stubbed, fixtures that are functional
stubs, CSS collisions and session expiry (`:112-119`); integrate; run the host's own suite, because the
lagoon de-risked the island and the host's suite de-risks the integration (`:131-136`); picture it; and
**wait for human validation** (`:161-165`).

Two rules from it are worth lifting out. Defaults belong in the *component*, and a default that could
not be honest in production is evidence, not a default (`:62-66`). And evidence is written only when
there is something real to put there — an empty fixtures file looks like coverage and invites a
hand-written response shape (`:66-73`).

### `archipelago-build` — the fan-out

Builds one **screen** with several agents at the same time. It writes no islands; it writes the
contract they build against, then integrates what comes back
(`.claude/skills/archipelago-build/SKILL.md:8-10`). **Do not fan out below three islands** — two agents
cost more coordination than they save, and a region whose islands are really one component should stay
one island (`SKILL.md:15-16`). It is neither of the other two: `island-locate` is the reading step,
`island-create` is the single-island loop, and this is the fan-out between them (`SKILL.md:12-13`).

It also carries the **staged adoption model** — see below.

---

## `motu skills install`

```
motu skills install [dir]        install into a repo (Copilot + Claude Code)
motu skills list                 list what this checkout ships
```

(`packages/cli/src/run.mjs:88-89`, dispatch at `run.mjs:263-267`.) Flags
(`run.mjs:172-176`, parsed at `packages/cli/src/commands/skills.mjs:80-93`):

| Flag | |
| --- | --- |
| `--only both\|claude\|copilot` | which format(s) to write; default `both`. Anything else exits **2** (`skills.mjs:82-86`) |
| `--force` | overwrite files that already exist with different contents |
| `--json` | machine-readable report (`skills.mjs:104-107`) |

### What it writes, where

Target root is the positional argument or the cwd (`skills.mjs:81`). Per skill
(`skills.mjs:94-102`):

| Path | Format | How |
| --- | --- | --- |
| `.github/agents/<name>.agent.md` | GitHub Copilot custom agent | verbatim copy of the source |
| `.github/prompts/<name>.prompt.md` | Copilot slash-prompt | verbatim copy, **only if one exists** (`skills.mjs:49-54`, `:97`) |
| `.claude/skills/<name>/SKILL.md` | Claude Code skill | the same body under the frontmatter keys Claude reads (`skills.mjs:61-64`) |

Plus, unconditionally, the **host rules block** — see the next section
(`skills.mjs:115-120`).

The verb is **deliberately config-free**: it installs into a repo that may not be a motu project yet, so
it never reads `motu.config.json` and never touches the island layout (`skills.mjs:12-13`). Writes are
conservative: an identical file is reported `=`, a *differing* file is left untouched and reported `!`,
and the command exits **1** so a wrapper notices (`skills.mjs:66-78`, `:124-127`). `--force`
overwrites. The closing line names the skills that were actually installed rather than a hardcoded pair,
because a hardcoded pair goes stale the day a skill is added (`skills.mjs:128-129`).

`motu init` runs the same rules application for a fresh project
(`packages/cli/src/commands/init.mjs:341`).

---

## Two formats, one source, and NO sync script

The header of `skills.mjs` is explicit about the intent
(`packages/cli/src/commands/skills.mjs:5-10`):

> One source, two emitted formats — so they can never drift.
> `.github/agents/<name>.agent.md` (source of truth: frontmatter name/description + body)

That holds **for an installing repo**, where both files are written in one command from one source. It
does **not** hold inside the motu checkout itself, and this is a real trap:

- `motu skills install` reads `.github/agents` from the motu checkout and writes into the *target*
  root (`skills.mjs:22-24`, `:81`). Running it with no argument at the checkout root would regenerate
  motu's own `.claude/skills/`, but nothing does that automatically.
- There is **no sync script and no check**. `package.json` has `release`, `build:packages`,
  `typecheck` and the dev servers; there is no skills task. `scripts/` holds only
  `build-packages.mjs` and `release.mjs`. Nothing in CI compares the two trees.

So: **editing `.claude/skills/<name>/SKILL.md` without editing `.github/agents/<name>.agent.md` (or the
reverse) silently drifts.** Nothing fails. The Copilot agent and the Claude skill then describe
different workflows, and the next `motu skills install --force` in an adopting repo ships whichever one
lives under `.github/agents/` — the *other* file's edits are simply lost.

At the time of writing all four pairs are byte-identical (`diff .claude/skills/<n>/SKILL.md
.github/agents/<n>.agent.md` is empty for all four), which is what the design intends and what a hand
edit has to keep true.

A **third** artifact exists and is not a mirror: `.github/prompts/<name>.prompt.md` is a shorter Copilot
slash-prompt that restates the workflow in outline and links back to the agent file
(`.github/prompts/island-locate.prompt.md:8-10`). All four differ from their agent by design — and they
are the third place a workflow change has to land.

When you change a skill: edit `.github/agents/<name>.agent.md`, regenerate or hand-mirror
`.claude/skills/<name>/SKILL.md`, and check whether the prompt still describes what the agent does.

---

## `.github/host-rules.md` — the standing rules

The rules a host's coding agent has to follow for motu to keep its guarantees. They used to live
nowhere: every adopting repo re-typed them into its own `CLAUDE.md` from memory, or (more often) did
not, and the framework enforced a shape nobody had told the agent about
(`packages/cli/src/lib/host-rules.mjs:1-6`).

### How it gets into a project

`applyHostRules(dir)` (`packages/cli/src/lib/host-rules.mjs:36-52`), called by both
`motu skills install` (`skills.mjs:120`) and `motu init`
(`packages/cli/src/commands/init.mjs:341`).

- The text is read from the motu checkout's `.github/host-rules.md`; a checkout without one returns
  nothing rather than failing (`host-rules.mjs:26-28`, `:38`).
- It is written **between markers** — `<!-- motu:rules -->` … `<!-- /motu:rules -->` — and rewritten in
  place, so re-running updates the block instead of appending a second copy, and anything the project
  added around it survives (`host-rules.mjs:8-9`, `:19-20`, `:45-47`). Upgrading motu upgrades the
  rules.
- Targets are every instruction file the repo already has, in order: `CLAUDE.md`, `AGENTS.md`,
  `.github/copilot-instructions.md`; a repo with none gets `CLAUDE.md`
  (`host-rules.mjs:23`, `:40-42`).
- It lands in the **host application's** root, not beside the motu project — which is often a
  subfolder, where a second `CLAUDE.md` would be read by nothing
  (`skills.mjs:117-119`, `skills.mjs:120` passing `HOST_ROOT`).

### What the block contains

The full rule set (`.github/host-rules.md`, 535 lines) covers island-vs-host classification, evidence,
ownership, the lagoon, the three check tiers and the three exit codes. Four sections matter most to an
agent working under it, and each exists because of a specific failure:

- **One producer per key, checked in the fast loop** (`host-rules.md:221-231`) — two islands declaring
  `writes` on one key is a *static* error, grouped by element rather than by slot so one island placed
  in two slots stays legal. This is what makes parallel agents safe with no new mechanism: the
  archipelago **is** the claim registry.
- **Surveyed but not built: `planned: true`** (`host-rules.md:282-295`) — ownership counts a planned
  island exactly as if it were built, while "does it exist, does it mount, is it placed" skip it. The
  flag **removes itself**: once the island is registered, `planned: true` becomes an error, because a
  survey that quietly turns into a list of things nobody built is worse than no survey.
- **Three outcomes, three exit codes** (`host-rules.md:297-313`) — `0` the declarations hold, `1`
  something contradicted them (repair), `2` a check could not run (retry, do **not** repair). This
  exists for unattended loops: an agent reads `✗` and repairs a bug that does not exist, and several
  agents produce several confident wrong repairs.
- **An island ships with evidence that asserts its OWN render** (`host-rules.md:250-280`) — adding an
  island means adding a flow step asserting what *that* island renders, not reusing the region's
  existing steps.

---

## Building one region with several agents

The protocol lives in `archipelago-build`; the binding rules live in host-rules, and they bind an agent
**whether or not someone launched it as part of a fan-out** (`.github/host-rules.md:315-317`).

### 1 — Survey, and write the answer down

Run `island-locate`, then write two files **before any island exists**
(`.claude/skills/archipelago-build/SKILL.md:18-34`):

- `src/shared/<region>-region.ts` — the region's state as a type, produced keys named, `HostRegion<…>`
  for the page's half.
- `src/archipelagos/<id>/<id>.archipelago.ts` — **every** slot, with `bind`, with `writes` on the
  owner, and `planned: true` on all of them.

Typecheck, run `motu archipelago verify <id>`, and expect a PASS with a `planned` warning. **That green
is the point**: ownership is enforced for islands nobody has written, so a second claim on a key fails
in the claimant's own branch rather than at merge. Commit it — every agent branches from it.

A contract is good when **a flow can end on an island no step drives** (`SKILL.md:36-38`). Prefer a
shape with a consumer — a summary, a total, a preview — that reads what the others write; if every
island only writes its own key, the region's flows can only assert echoes.

### 2 — Split, one slot per agent

One agent per island, each in its own git worktree, each given the same brief verbatim with only the
slot changed. Do not tell an agent about the others' internals — the archipelago is what they share
(`SKILL.md:40-60`). The brief's binding clauses match host-rules
(`.github/host-rules.md:317-331`):

- **You own ONE slot.** Do not edit another island's files, another island's archipelago entry, or the
  region's shared type. If you believe the shared type is wrong, **say so and stop** — changing it is a
  decision about everyone's work, made by someone who can see all of it.
- **Remove `planned: true` from your own entry only.** It is how the region learns your island exists.
- **Ship a coverage step for your slot**: `expectRender` naming text your island alone produces.
  Without it, a slot wired to a neighbour's data passes every check.
- **Do not repair shared infrastructure.** A failing install, a missing browser, a path resolving
  outside the project is exit 2 — report it. This happened: one agent stopped and reported, another
  improvised and produced a false runtime failure.
- **Say what got in your way.** Framework friction is the most valuable thing an agent returns and is
  invisible to whoever reads only the diff.

Fan-out agents iterate on `motu check` and `motu check --runtime --fast`; the browser is paid once, by
the coordinator, at steps 4 and 5 (`SKILL.md:88-96`). `--changed` reads like the scoping answer and is
not — it widens back to everything whenever a changed file belongs to no island or region, which a page,
a source or a shared evidence module always does (`SKILL.md:98-102`).

### 3 — Merge: the hazards recorded from real runs

Expect every shared file to conflict. Resolve **by kind, not by hand**
(`SKILL.md:62-72`, `.github/host-rules.md:333-337`):

| File | Resolution |
| --- | --- |
| `islands/registry.ts`, `islands/contracts.generated.ts` | **regenerate** with `motu island sync` — never hand-merge a generated file |
| the shared stylesheet | append-only, keep both sides |
| the archipelago | one entry each, so a line-level merge is usually right — then check that exactly the built islands lost `planned` |
| a lagoon frame | if two agents extended a slot→data lookup, take **both** |

The frame case is the one that actually shipped a bug, and it is worth stating in full
(`.github/host-rules.md:250-263`). Two agents each extended the frame's `rowFor` **ternary**, whose
fallback was the notes row. Taking either side of that conflict alone makes the other agent's widget
render **as Notes** — wrong, and rendering. `archipelago verify` was byte-identical between the correct
and the naive resolution, because the frame is *arrangement*, it is not declared, and nothing checks it.
The only thing that would have distinguished them is a flow asserting on the new island's own rendered
content, which neither agent wrote because nothing required it. Hence two standing rules: **prefer an
append-only LOOKUP over a ternary chain** in any frame two people may extend, and **every island ships a
flow step asserting its own render**.

One more, from the same run (`host-rules.md:278-280`): if you use git worktrees, **do not symlink
`node_modules` into them** — `git add -A` commits the symlink, the merge replaces the real directory
with it, and the next build dies on `ELOOP`.

### 4 — Write the region's flows

The islands cannot do this: a flow is about the region, and no island can see across the seam
(`SKILL.md:74-86`). In `<id>.evidence.ts`, write the journey — several steps building on each other,
**each ending on the island that READS rather than the one you drove**. A region's flows need a browser
(`--fast` skips them and says so), so `motu archipelago verify <id> --runtime` must pass `region-flow`,
`flow-mutation` and `render-coverage`. See
[10 — Evidence and testing](10-evidence-and-testing.md).

### 5 — Look at it, then hand over

Open the lagoon and **drive** it: a region can pass every check while nobody has ever used it
(`SKILL.md:104-108`). Then picture it — `motu archipelago snapshot <id> --remote` is the region's only
check on **arrangement**, and if the diff names no changed member island, the arrangement is what moved
(`SKILL.md:110-119`).

**The final look is a FRESH agent's** (`SKILL.md:121-135`). You built this region, so you are the one
reader who cannot see an invention in it — a fixture's vocabulary, a state the app never enters, a label
nobody uses. It is in your context as a premise. Spawn a subagent and hand it **three things and nothing
else**: the state URLs (`motu lagoon states --json`), where the application's own vocabulary lives, and
the question — *does this screen belong to THIS application? Does anything render a word, a state or a
shape the app never uses?* Do **not** pass the diff, the plan, the transcript or your reasoning; that
contamination is the entire thing you are spending a subagent to avoid. Every check before this one
compares the region to what the region declares; this is the only one that compares it to the app.

Hand back the screen, the flows, and **the list of what the agents reported as friction** — the most
valuable output of a fan-out and the easiest to drop (`SKILL.md:137-138`).

### What `archipelago-build` does not do

It does not integrate into a host page — that is `motu integrate check` and the page's own work — and it
does not review island code line by line: the gate is the checks plus the driven lagoon, and if that is
not enough, **the missing check is the finding** (`SKILL.md:140-144`).

---

## Adoption is staged, and a frame is where you start

`archipelago-build` carries the arc, because the fan-out is where the choice gets made for a whole
screen at once (`.claude/skills/archipelago-build/SKILL.md:146-211`). A region's arrangement lives in
one of two places and both are supported on purpose: **`root` on the archipelago** — the application's
own layout component with `slots` mapping its props, so there is no second description and the two
cannot differ — or **a hand-written lagoon frame**, a second description that is checked but not
eliminated (`SKILL.md:148-157`).

Three stages, and **a project is expected to sit in the middle one for a long time**
(`SKILL.md:159-171`):

1. **Frame.** Adopt as a thin overlay: islands, `<X.Island>` in the page's existing JSX, a frame holding
   only the app's own components. `region-root` says `ok` and names `root` without failing on it. The
   page is untouched, so nothing can regress in it.
2. **Migrate opportunistically.** Move ONE region to `root` when you already have a reason to open its
   page. **Never as its own sweep** — that is a large diff whose risky parts are invisible.
3. **Close it.** When the last region has a `root`, set `"regionRoot": "required"` in
   `motu.config.json` and a frame becomes an error from then on. That is the switch that makes the arc
   finish instead of stalling half-done (`packages/cli/src/lib/config.mjs:121-135`).

An **extraction uses the frame, and that is correct rather than a concession**: moving a page to `root`
is a region-level refactor of the host's own code, and doing it in the same step as pulling out one
island couples two changes and hides the risky one (`SKILL.md:173-177`). A frame that genuinely must
draw its own markup says why, **once**, with `inventedArrangement('why', <…/>)` — it downgrades the
error to a warning, and it is a HOLD, not an answer (`SKILL.md:179-184`;
`packages/react/src/index.ts:17`).

`motu archipelago create` is the opposite case and scaffolds `root` first: a new region has no page to
restructure, so the safe shape is free there. `motu archipelago adopt-root <id>` does the derivable half
of stage 2 and **refuses rather than guessing** when the frame nests two host components
(`SKILL.md:186-189`; `packages/cli/src/commands/adopt-root.mjs`).

### The two hazards of a migration, neither of which `motu check` sees

(`SKILL.md:195-209`.) Moving a page to `root` is not "the JSX moved" — that part is checkable. These are
not:

- **Exclusivity gets demoted.** A ternary whose branches are mutually exclusive by construction becomes
  two independent props, and nothing enforces that at most one is non-null. When `slots` cannot express
  an either/or, **keep the ternary in the page and pass one node** — not two props and a promise.
- **The server/client boundary moves.** The root renders inside `<X.Region>`, which is a client
  component, so a layout the page used to render as a server component crosses into the client bundle.
  Same pixels, different tree. Check what the extracted layout imports before you move it.

[06 — Composition and adoption](06-composition-and-adoption.md) owns this material in full.

---

## See also

- [03 — CLI reference](03-cli-reference.md) — `motu skills install`, `motu init`, and every verb the
  skills drive.
- [06 — Composition and adoption](06-composition-and-adoption.md) — the two shapes and the staged path.
- [07 — Checks and verification](07-checks-and-verification.md) — the three tiers, the three exit codes,
  and every check id a skill names.
- [10 — Evidence and testing](10-evidence-and-testing.md) — scenarios, flows, `expectRender`,
  `flow-mutation`, `render-coverage`.
- [12 — Hosts and adapters](12-hosts-and-adapters.md) — `host`, which is the first thing every skill
  reads.
