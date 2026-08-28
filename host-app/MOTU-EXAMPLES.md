# The two composition shapes, side by side

This host carries one region in each of motu's two adoption stages, on the same framework, with the
same binding. Read them together — the only thing that differs is **who owns the arrangement**.

Full explanation: [`docs/06-composition-and-adoption.md`](../docs/06-composition-and-adoption.md).

|  | `corpus` — stage 1 | `signin` — stage 2 |
|---|---|---|
| composes with | `<Corpus.Island slot="…">` in the page's own JSX | `<Signin.Root form={…} />` |
| archipelago declares | no `root`, no `slots` | `root: SigninLayout` + `slots` |
| arrangement lives in | the page (`app/corpus/corpus-screen.tsx`) | a component (`app/signin/signin-layout.tsx`) |
| the lagoon is told by | a frame — fragment + `island(slot)` | nothing; it renders `SigninLayout` |
| `region-root` grades it | `ok`, with a line naming `root` | `ok` |
| the lagoon shows | the islands, not the page | the page |
| `removal-check` leaves | the page's original JSX | `<SigninLayout …/>`, not the JSX |

## Stage 1 — `corpus`, the thin overlay

The shape to copy when adopting motu into pages that already exist.

```
motu/src/archipelagos/corpus/corpus.archipelago.ts   no `root`; two islands, one produced key
motu/src/archipelagos/corpus/corpus.evidence.ts      the flow that drives the coupling
app/corpus/corpus-region.ts                          the region's vocabulary (no motu import)
app/corpus/corpus-screen.tsx                         ← THE EXAMPLE: islands wrapped where they sat
app/corpus/page.tsx                                  server component; reads the host's own corpus
components/corpus/*.tsx                              the app's own components, wrapped not copied
components/motu/corpus-region.tsx                    the composition root (100% motu)
motu/roots/lagoon/src/regions/corpus.tsx             ← THE FRAME, and what it costs
```

The page keeps its heading, its summary line and its two `<section>`s. Each island is wrapped exactly
where its component already was. Nothing was extracted.

What it costs is visible in the frame: everything on the page that is not an island exists only in the
page, so the lagoon previews two islands rather than the screen.

## Stage 2 — `signin`, composed from the archipelago

```
motu/src/archipelagos/signin/signin.archipelago.ts   `root: SigninLayout` + `slots`
app/signin/signin-layout.tsx                         the arrangement, rendered by page AND lagoon
app/signin/signin-screen.tsx                         ← passes named props to <Signin.Root>
motu/roots/lagoon/src/regions/signin.tsx             data only — no arrangement to drift
```

## What the two share

Both bind their environment identically (`components/motu/*-region.tsx`), both declare their
vocabulary as an app-owned type with no motu import, and both keep their evidence in
`motu/src/shared/*-evidence.ts` behind relative specifiers. **The stage is a property of the
composition, not of the region.**

## Moving `corpus` to stage 2

When somebody next has a reason to edit `corpus-screen.tsx`: extract the `<main>` into a
`CorpusPageLayout` component, name it as the archipelago's `root`, map `filter`/`states` props in
`slots`, and delete the frame. `motu archipelago adopt-root corpus` does the derivable half.

Two things to check by hand, because no check sees them — see the hazards section in
[`docs/06-composition-and-adoption.md`](../docs/06-composition-and-adoption.md).
