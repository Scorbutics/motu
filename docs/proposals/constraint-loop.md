# Proposal — motu as the verifier in a constraint loop

**Status:** proposed (2026-11-12); **items 1, 2a, 2b, 6, the skill half of 4, and the static half of 3 built**; what is left waits on the spike (4's multi-run, 5) or is noted per item. Ordered by value for
effort; items 1–2 close gaps the evidence bench measured, item 3 reframes the report, items 4–6 wait on
the `req-spike` experiment (`~/dev/req-spike`) showing the outer loop is worth having — except the
parts of 4 and 6 that are skill text, which do not need to wait.

## The frame

Agents are strong at GENERATING and weak at VALIDATING. The loop that makes generation safe is the one
program synthesis calls **CEGIS** — counterexample-guided inductive synthesis: a synthesizer proposes,
a verifier accepts or returns a counterexample, the synthesizer proposes again. The agent is the
synthesizer. motu is a verifier.

Read that way, there are two loops, with different oracles:

```
conversation ──(agent)──► declaration ──(agent)──► code
             intent ↔ spec             spec ↔ code
             the HUMAN is the oracle   the MACHINE is the oracle
```

The right-hand loop is what motu already does: an archipelago, its evidence and its contracts are the
spec, and `motu check` decides whether the code satisfies them. The left-hand loop — did the
declaration capture what the person wanted — is where the remaining risk lives, and motu has almost
nothing for it except the final perception look.

Three properties make a constraint useful to a synthesizer, and every item below serves one:

1. **Checkable** — the verdict is mechanical, with a counterexample an agent can act on. motu is
   mostly here already (`seen`, three exit codes, stable finding ids, messages naming the fix).
2. **Non-vacuous** — a constraint that every program satisfies is a gift to the synthesizer, which
   will find the degenerate solution. `flow-mutation` is this property for flows.
3. **Not written by the solver** — an agent that writes the code AND its evidence from one context
   grades its own exam. Evidence must come from somewhere the author did not control: captured data,
   a human-reviewed declaration, the previous version, a fresh reader.

## Why now — what bench/evidence measured

On 12 mistakes proposed blind (`bench/evidence/RESULTS.md`), motu refused 0 and flagged 2, Storybook
refused 1, and **8 were caught by nothing**, the app's own tests included. Since then:

- **fixed in motu** — B3 (a region's store outlived its page) and B9 (a flow can now declare
  `expectCalls`, and flows seed before they mount);
- **caught by item 1** — B7 (a weakened flow) now reads `weakens` under SPEC CHANGES in `motu diff`, and
  B9 is `locked` there even without `expectCalls`;
- **left, by layer** — B1, B4, B10 are logic inside a component (unit tests); B5 is visible only in the
  lagoon's calls strip (perception); B6 is a weakened STORY (Storybook's side); B12 needs `root`.

The remaining misses are behaviour that agreed with itself, and a handler the harness does not drive
(S1, S2, B2 — `emit` enters past the handler). What follows either closes a measured gap (1, 2), makes
the uncovered part visible instead of green (3), or moves motu into the left-hand loop (4–6).

**Where the solver grades its own exam.** The same agent writes the code, the archipelago, the evidence
and the `--explain` file — B10 edited the app's own test to agree with its bug, B7 weakened a flow until
it held. 2b and 3 strengthen the verifier; 1, 5 and 6 are what keep the synthesizer from editing it. motu
does not have to ENFORCE review to apply this: it has to make the spec diff small and legible (the
archipelago, the evidence, the explain file) and decide everything else mechanically. Requiring approval
on those paths is the host's CI or CODEOWNERS, not motu.

---

## 1. `motu diff`: a change either modifies the declaration or preserves behaviour — *built*

**As built** (`commands/diff.mjs`, `account()`; tests in `test/diff-compare.test.mjs`): in a region whose
archipelago and evidence did not change, `keys`/`render`/`calls`/`outcome` findings are `locked` and
`--explain` cannot waive them. The evidence is compared as spec — each flow step's assertions as
clauses (`expect` keys, `expectRender` text/notText per slot, `expectCalls`) — so an evidence edit is a
declaration change, which settles the open question below. And a declaration change that makes the
region check LESS is `weakens`: a clause removed, a text shortened to a part of itself, an
`expectCalls` list that allows more, a step or flow removed. Every declaration finding prints first,
under SPEC CHANGES, weakenings at the top. On shlink: B7 reads "weakens … notText: Main shlink → (not
asserted)"; B9 is locked (`GET /servers.json ×0 → ×4`). Not yet covered: island scenarios
(`src/islands/*.evidence.ts`) are not compared as spec, so B8's copy-pasted seed is not a declaration
finding.

**Rule.** For a region where the diff finds NO `declaration` finding, every behavioural finding
(`keys`, `render`, `calls`) is an error that `--explain` cannot waive. Where the declaration did
change, today's accounting stands.

**Why.** The review model this enables is the whole point of the frame: a human reviews declaration
diffs; machines decide everything else. A change that moved what a region renders without moving
what it declares is either a refactor that is not one, or a behaviour change nobody declared — and
today an agent can make it disappear with one line in an `--explain` file it wrote itself. That is
the solver grading its own exam, at the exact point the human was supposed to look.

**Cost.** Small. `diff.mjs` already separates `kind: 'declaration'` findings from the rest
(`declarations()`, ~line 43; findings ~165–197) and does the accounting at ~414. The change is a
partition before the `explained` lookup, plus a message naming the two honest options: change the
declaration (and get it reviewed), or fix the behaviour.

**Open.** Whether evidence-only changes (a new flow, a new step) count as "declaration changed" for
the region — they should, since evidence is spec; `declarations()` already lists flows and steps.

## 2. Vacuity: the evidence must constrain every island

**2a — crashed mutant is not a kill.** *Built* (`a62f9ae`): every step records the page errors it
raised; when the crude mutant crashes, a mutant of the same type decides, and holding on it is an
ERROR — the same verdict as holding under the crude one. E1 is now refused.

**2b — null-island mutant.** *Built* (`null-island`, in every region runtime run; `buildNullIslands` /
`reportNullIslands` in `region-flows.mjs`, `setNullIsland` in `react-island.tsx`, tests in
`test/null-island.test.mjs`). Two refinements over the sketch: the `defaults` mode runs only for an
island that READS region state — a pure producer (shlink's search box binds nothing) renders from its
defaults always, so that mutant could never differ and accused every producer; and only asserted
slots are nulled, since an unasserted one is `render-coverage`'s finding. On shlink both slots are
constrained; keeping only the flows that never move `searchTerm` makes the list fail it ("holds
rendering from its DEFAULTS"). An error, at the user's call that the stricter rule is the better one.

The original sketch: For each slot, replace its island with one that renders its defaults
(and, separately, nothing), replay the region's flows, and require at least one assertion to fail.
If none does, the region's evidence does not constrain that island at all: an implementation that
ignores every input satisfies it.

**Why.** `flow-mutation` asks "does this step depend on its stimulus?". It does not ask "does the
evidence depend on this island?" — and `render-coverage` only asks whether a flow LOOKS at a slot,
not whether looking distinguishes anything. A slot whose only assertion is a label the default render
also shows is covered and unconstrained. This is the spec-vacuity check verification-aware languages
need (a trivial implementation must FAIL the spec), in motu's terms. It targets E1 — the search box's
placeholder renders from defaults, so no assertion constrains that island. It does NOT target B7, as
first written here: B7's weakened step still asserts a row a default list does not render, so a null
island fails it. B7 is weaker-than-before, which only a comparison with the previous version sees —
item 1's `weakens`.

**Cost.** Medium. The mount path already re-aims one lagoon page per island; a mutant is another
component for a slot. Runtime-tier only (it needs flows), so it belongs to `--runtime`, not the loop.

## 3. An assurance level per declaration — *built, static half*

**As built** (`motu assurance [id] [--json]`, `lib/assurance.mjs`, `test/assurance.test.mjs`): one row
per slot, write, shared key and flow's calls, levels `unchecked < static < runtime·emit < runtime <
runtime·user`, each with its evidence and what is missing. Derived from the declarations and flows, so
it says what the evidence CLAIMS. On shlink it shows the S1/S2/B2 residual as it should — the search's
write is `runtime·emit`, "the component's own handler is never driven". Not yet: `snapshot` and `prod`
levels; confirming a level from the last runtime run rather than from the evidence; tying a `click` to
the write it produced (needs the runtime trace — no region in demo-app or host-app reaches
`runtime·user` today, because their one click flow asserts render, not a key).

**Change.** Invert the report's axis. Today it is one row per CHECK (ok / warn / skip). Add a view
with one row per DECLARED THING — each write, each slot, each flow step — showing the strongest
evidence that proved it:

```
login · writes.session        runtime   flow "sign in" step 2 fired it
login · slot form             runtime   expectRender, survived null-island
login · slot banner           static    placed, rendered; no flow distinguishes it
search · input → term          UNCHECKED emit bypasses the handler (see 07)
billing · writes.plan         prod      coverage corpus, 1.2k events
```

Levels: `unchecked` < `static` < `runtime·emit` < `runtime·user` < `snapshot` < `prod` (the coverage
corpus). `runtime·emit` vs `runtime·user` is the S1/S2/B2 line: a write proven only through `emit`
entered past the handler; one proven through a `click` step was produced by the component itself.
`expectCalls` adds a claim per state: what it asks the backend for.

**Why.** "Green" today means "nothing contradicted what was checked", and the reader cannot see how
much was checked. The S1/S2/B2 class (a handler that ignores its input) is only partly reachable in
motu's model — a `click` step drives the real handler, typing does not exist (doc 10: "there is
deliberately no `fill`") — and today it is invisible: the region is green. Shown as
`UNCHECKED`, it becomes a known residual a person can decide about (write a unit test, accept it).
This is `seen: n` lifted from a check to a claim. It is also the review surface the left-hand loop
needs: the human approves a declaration together with how much of it is actually held.

**Cost.** Medium; mostly aggregation of what checks already know. `--json` first, then the lens.

## 4. Provenance in the survey — *skill half built*

**As built**: `island-locate`'s report carries a `provenance` column (stated / inferred / default) and a
"Decisions for the human" section repeating every inferred and default row as a question, with the
rule never to upgrade a guess to `stated`. Multi-run disagreement waits on the spike.

**Change.** `island-locate`'s report marks every key, owner, slot and flow as **stated** (quoting the
user or the code), **inferred**, or **default** (nobody decided). Run the survey more than once — or by
independent agents — and every point where the runs disagree becomes a question to the user before
anything is built, not a choice made silently.

**Why.** The survey IS the intent → spec translation. Models fill ambiguity with something plausible;
that is the invention class (the fixture vocabulary, the stylesheet nobody applied) moved upstream,
where everything after it is then proved AGAINST the invented assumption. Provenance tells the
reviewer where to read: stated clauses get a skim, inferred and default ones are the review.
Disagreement between independent survey runs is a cheap, strong detector of real ambiguity.

**Cost.** Skill-text only for provenance; a small driver for multi-run disagreement.

## 5. Distinguishing examples for declaration changes

**Change.** When `motu diff` reports a flow step whose render or keys moved, also emit the two
addresses — the state at base and at head (`/?region=…&flow=…&step=n`, the head one from the
working tree's lagoon, the base one from the worktree's) — and phrase the finding as a question:
*which of these two screens is right?*

**Why.** Humans validate concrete cases far better than abstract rules. This is the outer CEGIS loop
with the human as oracle: the tool finds the input where two specs disagree, the person judges the
two outputs, and the answer becomes the regression. motu already has every part — stable finding ids,
per-step replay, states as addresses — it only has to put the two addresses side by side.

**Cost.** Small for the URLs; serving the base side's lagoon is the real work (it lives in a
temporary worktree today).

## 6. A fresh read-back of the archipelago — *built*

**As built**: `archipelago-build` step 1 ("Read it back — FRESH — before anyone builds on it"),
`island-create` when an island changes ownership, and the host rules. Tried once on shlink with only the
three permitted inputs: in under a minute it found the page seeding `searchTerm` (a key only the search
island may produce), a search box that never shows the term (so any seeded term renders an unreachable
state), the term used as a regular expression (the bug behind blind mistake B1), and a host control —
the Export button — reading `searchTerm` with nothing in the declaration saying so. None of these is
reported by any check.

**Change.** The final perception look already asks a context-free agent whether a SCREEN belongs to
the application. Add the same for the DECLARATION: a fresh agent, given only the archipelago and the
application's types, paraphrases what the region promises and lists what it permits that a
reasonable person might not expect ("any island may clear `session`", "`plan` has no producer").

**Why.** Same reason as the look: an invention sits in its author's context as a premise. Ownership
that was invented (a producer nobody asked for, a key nobody owns) is as invisible to its author as
invented vocabulary, and as visible to a reader who did not choose it.

**Cost.** Skill-text; no code. Same three-things discipline as the look: the archipelago, where the
app's vocabulary lives, the question. Never the diff or the transcript.

---

## What this does NOT change

motu still checks COMPOSITION. None of this makes a green region evidence that a component's logic
is right, and item 3 exists precisely so that the report SAYS which parts were not held, rather than
the reader assuming. Logic belongs to unit tests in the host's runner and, longer term, to the
requirement layer the `req-spike` is testing — where clauses carry the same assurance levels and the
same provenance, discharged by a prover where one can reach.

## Two additions

- **Say which property each check serves** (checkable / non-vacuous / not written by the solver) in
  `docs/15-design-and-limits.md`, so a future check is judged against this frame rather than added ad
  hoc.
- **Measure against a FRESH blind set** at each milestone, not only B1–B12: every fix is tuned against
  the same twelve mistakes, and a list that is fixed against becomes a list that is overfit to.

## Order

1 (*built*) and 6 → 3 → 2b → (spike result) → 4, 5. The skill-text half of 4 (stated / inferred /
default) can go with 6. Measure each against the bench's blind set: the point of
1 and 2b is to move named rows (B7, E1) out of "caught by nothing"; the point of 3 is that the rows
that remain are SHOWN as unchecked instead of passing green.
