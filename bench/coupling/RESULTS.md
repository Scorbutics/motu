# Does motu catch what it claims?

One question, asked of six **coupling** defects — the class that lives in the seam between components,
where every part is individually correct and the composition is wrong. Not logic inside a component
(a filter that stops matching, `some` for `every`, an off-by-one): motu says those are a unit test's
job, and measuring it against them measures the wrong thing.

Run it yourself:

    node bench/coupling/run.mjs --project /path/to/app --region <id> [--only C2,C3]

## The result

Target: **shlink** (React 19 + Vite + npm), region `manage-servers`, two islands sharing `searchTerm`.

```
           tsc  motu-types   lint   tests    motu  motu-rt   defect
  C1         ✓       ✓         ✓       ✓       ✓       ·   the two islands are placed in each other's slots
  C2         ·       ✓         ·       ·       ✓       ✓   a second island claims a key another already produces
  C3         ·       ✓         ·       ✓       ✓       ✓   a slot name typo in the page
  C4         ·       ·         ·       ✓       ·       ✓   the reader stops binding the key it reads
  C5         ·       ✓         ·       ✓       ·       ✓   the declared write is wired to an event the island does not emit
  C6         ·       ·         ·       ✓       ✓       ·   the region is composed but never wrapped
```

**motu caught 6 of 6. The app's own tooling caught 5 of 6. Only one defect — C2 — was caught by motu
alone.**

That is the honest headline, and it is smaller than the pitch. On this application motu is mostly a
*second* opinion, not the only one.

## What the columns mean, and why two of them are not what they look like

`motu-types` is separated from `tsc` on purpose, and separating it changed the answer twice.

The typed archipelago encodes motu's rules **as types**, so they fail in the host's own compiler:

    Type 'boolean' is not assignable to type
      ["written by more than one island — a key has ONE producer:", "searchTerm"]

and a slot typo fails because `createRegion` types the prop from the region:

    Type '"manage-servers-serch-list"' is not assignable to type
      '"manage-servers-list" | "manage-servers-search"'

Both are motu speaking through `tsc`. Strip motu out and the compiler is silent on each. Crediting
them to "the app's own typecheck" would report motu's mechanism as tooling the project already had —
so the harness attributes any type error whose violated type is motu's to `motu-types`, and the `tsc`
column is what the compiler would have said **without** motu installed.

Before that split the matrix read *"motu caught 6, the app's tooling caught 6, only-motu: none"*. It
was wrong in motu's disfavour, twice, for two different reasons.

## Why the app's tooling does so well here — and where that generalises

shlink has `test/servers/ManageServers.test.tsx`, a test that renders the **whole page**. That single
file is why `tests` catches five of six: a page-level integration test sees composition, because
composition is what it renders.

So the honest framing is not "motu catches what tests miss". It is:

> A page-level integration test catches most coupling defects. motu is that test, declared instead of
> written — plus one class the test cannot see.

An application without such a test would score very differently, and most do not have one for every
screen. That is a claim this run does **not** measure, and the next one should.

## The one motu caught alone

**C2 — a second island claims a key another already produces.** Two agents, two branches, one key.
Nothing renders differently; the store simply has two writers and no owner. The page-level test does
not fail, `tsc` (without motu) is silent, the linter is silent. It is caught statically, in about a
second, because ownership is *declared*.

That is the shape of what motu adds: not "finds more bugs" but "makes a class of coupling
un-representable, and says so before the app runs".

## What nobody caught

Nothing — every defect was caught by something. That is worth stating plainly: on this application,
with this test suite, five of six coupling defects were already covered.

## Method notes, because the first three runs were wrong

- **A defect counts as caught when an instrument's failure SIGNATURE changes**, not when it is red.
  This tree starts with a failing test and a failing lint rule; scoring exit codes would have counted
  those as catches for every defect.
- **The suite was checked for flakiness first** — two runs on the clean tree, identical failures — or
  the `tests` column would be noise.
- **Every edit must match exactly once**, verified in a preflight before a byte moves, and the restore
  is checked byte-for-byte afterwards. The first run silently skipped three defects because state
  leaked between them and still printed a matrix that looked complete.
- **A defect must compile.** The first C6 replaced an opening tag and left an unmatched closer, so
  `tsc` "caught" a syntax error rather than the composition defect.

## What this replaces

The cold-start bench (`bench/agent-cold-start/`) measured how many CLI invocations an adoption takes.
That is a real question about the on-ramp and it is not this one; it says nothing about whether the
framework catches anything. Its numbers moved barely at all between runs while its journals found four
genuine defects — so it is kept as a **first-run fuzzer**, and its metrics table is not evidence for
what motu is for.
