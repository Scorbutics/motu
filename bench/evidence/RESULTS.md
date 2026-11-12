# Does motu refuse fake evidence? — results

Target: **shlink-web-client**, "Manage servers" page, split into a search and a list sharing
`searchTerm`, plus the app's remote `servers.json` load. Branch `bench-evidence`: baseline evidence
`417c885` (motu) and `938fa45` (Storybook), both written by an agent that had not seen any cheat;
strict Storybook switch `c9b5449` + `c1e7894`. motu at `1ec1a94`. Every run measured the clean tree
twice and scored no tool whose two baselines differed (none did).

Run it: `node bench/evidence/run.mjs [--only E1,B3] [--dry]`.

## The headline

**On mistakes chosen blind — by an agent told nothing about either tool — both harnesses refused
1 of 12, and 8 of 12 were caught by nothing at all**, including the app's own test suite.

| | refused (the run fails) | flagged (a warning, the run passes) | caught by nothing |
|---|---|---|---|
| **blind set** (12, chosen by neither side) | motu 0 · Storybook 1 (B2) | motu 2 (B8, B11) | 8 (+ B10, see below) |
| **E set** (8, author-chosen, tilted toward motu) | motu 2 (E5, E7) · SB strict 1 (E5) · SB default 0 | motu 2 (E2, E8) | E1, E4, E10 |
| **S set** (2, author-chosen, tilted toward Storybook) | Storybook 2 (S1, S2) · motu 0 | — | — |

The two tools are **different instruments**, and neither is a safety net against the mistakes an agent
actually makes. That is the finding, and it is smaller than any pitch.

## What each one sees that the other does not

**Storybook drives real user events.** A play function types into the input, so a search box whose
handler ignores what was typed (S1), or never reports an emptied term (S2, and independently the blind
B2), fails a story. motu's `emit` enters the region *past* the component's handler, so every flow
passes. CLAUDE.md already says this ("a handler that ignores its argument passes every flow you can
write"); the bench measures it.

**motu compares the evidence to the page.** The page dropping the list out of the region (E7) is an
error in `motu check` in 3 seconds; replacing it with an empty-state branch (B11) is a warning. Storybook
renders its own composition of the components and never looks at the page. Two identical states under
two names (E2, and the blind B8's copy-pasted failure scenario) are flagged by `data-flow`; a slot no
flow looks at (E8) by `render-coverage`. Storybook has no notion of either.

**Both see an undeclared call — only when configured for it.** A failure state produced by a request
nothing answered, swallowed by the app (E5), is an error in motu's `flow-calls` by default. Storybook
catches it only with MSW set to `onUnhandledRequest: 'error'`, a story that fails on `console.error`,
**and** a settle delay after the play function (see "corrections" below).

**The app's own `tsc` sees invented fields** (E3) — through either harness's fixtures, because both were
typed against the app's types. That is a practice, not a tool, and it is credited to neither.

## Caught by nothing — the honest gap

| | the mistake | why nothing saw it |
|---|---|---|
| B1 | search stops matching the URL | every term in every harness also appears in a server's name |
| B3 | a stale search term survives navigation | no harness navigates away and back; the app's tests did not either |
| B4 | the auto-connect column follows the filtered rows | no evidence filters out the auto-connect server |
| B5 | the lagoon's "failure" answer becomes an empty list | renders exactly like the failure (same as E10) |
| B6 | a story checks the callback was called, not with what | Storybook does not judge its own assertions |
| B7 | a flow drops its `notText` and asserts a row present either way | see "a motu bug", below — this one *should* have been refused |
| B9 | remote servers fetched on every load | every harness default-answers `/servers.json`, so a new request goes unseen |
| B12 | the page moves the search; the lagoon's layout does not | the lagoon frame is a hand-written arrangement, not the page (`root` would have prevented it) |
| E4, E10 | values the type allows; a "failure" that is not one | perception, not assertion — no mechanical check can |

**B10** (case-sensitive search, with the app test edited to agree) was refused by motu, but **for an
unrelated reason**: `flow-mutation` reported "a term that matches nothing" as asserting a constant. It
is scored as a miss. It is also the clearest symptom of the bug below.

## A motu bug the bench found — fixed

**`flow-mutation` counted a crashed mutant as a kill.** The mutant replaced an emitted term with `null`;
`filterServers` called `null.toLowerCase()`, the region crashed, the slot went empty, and the assertion
"failed" — so a constant assertion (E1) passed the check. motu already ruled that "a mutant that broke
the region proves nothing", but recognised a break only as an error with **no** mismatch.

Fixed: every flow step now records the page errors it raised, and a step that crashed is broken
whatever its assertions saw. When the crude mutant crashes, a second mutant of the same TYPE (another
string, number or boolean) decides: failing on it proves the step; holding on it is an **error**, the
same verdict as holding under the crude mutant — one rule, whether or not the app happens to crash on
`null`. Decided strict on purpose: "no-such-server" and a mutant string both match nothing, and a step
that cannot tell them apart is asserting something its own input does not move.

On shlink: E1 moves from missed to **refused**; B10 is refused by the same rule as before. The clean
tree now FAILS on "a term that matches nothing" — the baseline evidence itself has a step that cannot
discriminate, which the crash had been hiding. That flow has to assert something only its term
produces.

**B7 is not a mutation problem**, contrary to the first write-up. Dropping `notText` weakens the step,
but what is left still depends on its input — a different term removes the staging row — so it fails
under mutation as it should. Mutation proves an assertion depends on its input; it cannot prove the
assertion is as strong as it used to be.

## Would looking at the lagoon have found the rest?

Measured, not guessed: every declared state (island scenarios and region flows, 12 on this region)
rendered on the clean tree and with each uncaught mistake applied, comparing what a person sees —
the frame's text, the calls strip, and the state verdict.

| | mistake | a declared state differs? | layer it belongs to | who should catch it |
|---|---|---|---|---|
| B1 | search stops matching the URL | no — every evidence term is also in a name | component logic | a unit test of `filterServers`; or a scenario that searches by URL. Typing "localhost" in the live lagoon shows it at once — if you think to |
| B4 | auto-connect column follows the filter | no — no state filters that server out | component logic | a unit test or a story; a scenario filtering the auto-connect server out would show it |
| B10 | case-sensitive search, app test edited to agree | no — all evidence is lowercase | component logic, and test drift | a unit test — which the agent rewrote; exploring with an uppercase term shows it |
| B3 | a stale term survives navigation | no — no state leaves and comes back | **composition** (region lifetime) | **motu** — the mistake only exists because a region's store outlives the page, a motu defect; fix that and the line B3 deletes is unnecessary. A screen flow that navigates away and back could assert it today |
| B9 | remote servers fetched on every load | **yes** — six states show "1 answered" where they asked for nothing | **data loading** | **motu has the data and asserts nothing about it**: the call ledger records every ask, but no flow can declare "this state makes no call". `motu diff` shows the agent that made the change; a declared `expectCalls` would make it an error |
| B5, E10 | the "failure" fixture answers an empty list | **yes** — only in the calls strip: "1 answered" instead of "failed, 500 as declared"; the page is identical | evidence lie | **perception** — a fresh look that reads the calls strip. No check can know the state was meant to fail |
| E4 | a value the app never produces | yes — the URL text | evidence invention | perception, and only if the reader knows the app |
| B12 | the page moves the search; the lagoon frame does not | no — the frame is a second copy of the arrangement | **arrangement** | **motu, once the region declares `root`** — page and lagoon then render one arrangement and the drift cannot exist. A hand-written frame is a documented HOLD, and this is what it costs |
| B7 | a flow drops its `notText` | no | evidence weakening | review of the evidence diff — no mechanical check |
| B6 | a story stops checking the callback's value | n/a (Storybook-only) | evidence weakening | review of the evidence diff |

So the eight blind misses split four ways: **three belong to unit tests** (B1, B4, B10 — logic inside a
component, which CLAUDE.md already says motu does not check); **three are motu's own territory and
fixable** (B3 by fixing store lifetime, B9 by letting flows declare calls, B12 by adopting `root`);
**two are visible in the lagoon and need a look** (B5, E10 via the calls strip); **two are evidence
weakening** only a reviewer of the diff can see (B6, B7).

## Other friction, from the agent that adopted motu on shlink

Reported, not measured here — each is a motu defect to fix before publishing:
- ~~the gallery renders every island alone blank while `__motuLagoonState` says `ok: true`~~ — **fixed**:
  `mountIsland` now reads the owning region's overrides (`providers`, `channels`, and the `wire`
  `regionOverrides` installs), and an island that throws while rendering refuses its state (`ok: false`,
  the banner) instead of standing as a blank frame;
- a region's store outlives the page — leaving and returning showed a filtered list under an empty box
  (shlink's own test caught it); the page now re-seeds by hand (blind mistake B3 removes that line);
- a flow can show a state the app cannot reach — the list filtered under an empty search box, because
  `emit` bypasses the input;
- `removal-check` produced code that does not compile; `motu init` broke shlink's `tsc`, lint and
  formatter, and wrote `src/index.ts` beside the app's `src/index.tsx` despite "scaffolds into a subfolder";
- a running `motu lagoon serve --watch` made `archipelago verify --runtime` fail falsely.

## Corrections made during the bench, and why

Each one was found by suspecting a result, not by liking or disliking it:
1. **Run 1 is void.** motu was rebuilt mid-run (13:04) and four cheats ran against a CLI with no
   packages; their exit code was scored as a catch. The runner now voids a run whose motu commit or
   built packages change, and treats motu's exit 2 as "could not run".
2. **motu's warnings were invisible.** `motu check` summarises warnings it has seen before instead of
   listing them, so E2 and E8 read as misses. motu is now read from `--json`, and a new warning is
   scored **flagged**, not refused — a warning does not fail the run.
3. **Strict Storybook raced itself.** A story whose assertion is already true at first render ended
   before MSW refused the unhandled request, so E5 read as a miss. Strict now lets requests settle
   (500 ms) before checking `console.error`.
4. **The app's `tsc` was credited to both tools** (E3). It now has its own column.
5. **The E set was tilted toward motu** — each cheat was an incident a motu check exists for. The S set
   tilts the other way on purpose, and the **blind set** is the headline because neither side chose it.
   The blind agent's list is committed verbatim (`blind.mjs`).

## Pre-registered expectations that did not hold (E set)

| | expected | got |
|---|---|---|
| E1 | motu refuses | missed — the `flow-mutation` bug |
| E2 | motu refuses | flagged (warning) |
| E3 | Storybook default misses, strict refuses, motu refuses | the app's `tsc` refuses through either harness; neither tool |
| E8 | motu refuses | flagged (warning) |

## What it means for how motu is described

"Catches more than Storybook" is not supported. What is supported: **motu holds the evidence to the
page** (placement, drift, undeclared calls, duplicate states), and **Storybook holds the component to a
real user's events**. A project that wants both questions answered runs both — and still needs unit
tests and a look, because most realistic mistakes here were caught by neither.
