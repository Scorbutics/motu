# Hard-testing motu against Twenty

**2026-08-20 → 2026-08-21.** Twenty (`github.com/twentyhq/twenty`, ~2k files in `twenty-front`) was
picked as an adversarial host: Vite + React 19 + Jotai + Apollo + a strict Nx monorepo tsconfig, and
a record page whose island list is **a database row**. Nothing was contributed upstream — the
integration lives on a local `motu-robustness-test` branch and exists only to break motu.

Before starting, five conditions were named that would each count as a real failure. Naming them
first is the point: a test you can't lose is a demo.

| # | Failure condition | Outcome |
|---|---|---|
| 1 | `island-locate` can't produce a coherent region | survived |
| 2 | ownership needs the state library rewritten | **hit**, then closed (`ownedWrite`) |
| 3 | `removal-check` can't stay green | **hit**, then closed (two fixes) |
| 4 | the lagoon can only render by reproducing the app | **hit**, then closed (transport seam + catalogue) |
| 5 | integration touches too much of the page | survived — 3 files, +27/−10 |

Nine framework bugs came out of it. **Every one was motu assuming the only host is the one it grew
up in** (`peps_ta_boite`, a Next app). None would have surfaced from a second Next project.

---

## The headline result

motu integrates into Twenty's record page adding **zero type errors** (10,202 before, 10,202 after,
diffed line by line), `removal-check` passes, and the region renders and is driven in the lagoon.

The host-side footprint is **2 imports, 2 wrapped switch cases, 1 provider** — 27 lines across 3
files, of which one is `tsconfig.json`:

```tsx
case WidgetType.FIELDS:
  return (
    <RecordPage.Island slot="w-fields">
      <FieldsWidget widget={widget} />      // Twenty's component, Twenty's props
    </RecordPage.Island>
  );
```

The island **wraps** rather than replaces. That is what makes removal exact: unwrapping restores the
app's own call site character for character.

---

## Finding 1 — A UI that lives in the database is *more* checkable, not less

Twenty's record page renders widgets from a row; the React tree is a dispatch table over a
server-side `WidgetType` enum. The pessimistic reading is that the lagoon must reproduce enough of
the data layer to make the page render — the drift-by-tomorrow trap motu exists to avoid.

The reading is wrong, and wrong in motu's favour. **An app whose UI is data already had to solve
this**, because its own tests and stories can't run without the metadata either. Twenty carries
`scripts/mock-data/generate-*.ts` (queries a live instance's `/metadata` with a token) and 2.3 MB of
`__typename`-carrying fixtures under `testing/mock-data/generated/`, served offline by
`testing/graphqlMocks.ts`. The acquisition step is a script the app already runs.

So `membership: 'catalogue'` stopped meaning "nothing is claimed" and became four verdicts:

| verdict | meaning | only possible because |
|---|---|---|
| **UNREACHABLE** | declared member absent from the schema's enum | the universe of types is codegen'd — *read*, not guessed |
| **UNCOVERED** | capture contains a type nobody declares | the member list is in the data |
| **SPECULATIVE** | declared, never seen in any capture | |
| **COVERED** | declared and present | |

Against Twenty's real artifacts this immediately caught a `GALLERY` view type that **doesn't exist in
`ViewType`**, and an undeclared `FIELDS_WIDGET` present in **5 of 41 captured views** — the region
was rendering less than the page does.

It also corrected the model: the first version reported Twenty's **side panel** as a hallucinated
widget type. It isn't a widget — it's chrome that *hosts* widget settings. A catalogue region is
**mixed**: islands with `member:` are data-summoned, islands without keep their placement check.

**Watch for the empty answer.** Twenty's own transport serves `FindAllRecordPageLayouts` with `[]`.
That is an *answer*, not a gap: it renders as an empty page and looks like a working one.
`unservedOperations()` catches the missing handler; coverage 0% catches the empty one.

## Finding 2 — Green checks that had never looked

Three checks passed while proving nothing. This is the failure mode the whole exercise keeps
producing, and it is worth stating as a rule: **a check that reports success from an empty search is
worse than no check.**

- `removal-check` printed `✓ no motu references in the host application` **over a fully integrated
  app**. It walked `app/`, `components/`, `lib/` — Next's layout. Twenty keeps everything under
  `src/`, so it found nothing and called that "removable".
- `coupling` reported *"no shared state between islands — a page whose islands are independent"* for
  a region whose two islands both bind `editingWidgetId`. `shared` is island-written ∩ island-read,
  so a key the **host** drives counted as nothing. Driving the lagoon showed one island flipping to
  "editing" while the other stayed idle. That is a coupling.
- `region-flow` could only express `emit` steps, so a region whose islands only **read** could have
  no declared flow at all — and reported "no declared flows" as if that were the region's fault.

## Finding 3 — `removal-check` demanded a clean host

It required a zero-error typecheck. Twenty reports ~12,875 lines at a clean checkout in this
environment (a workspace package's generated file needs a build step that won't run here). Any real
adoption would therefore read as *"motu is load-bearing"* when nothing had changed.

It now baselines on the restored tree and judges only **new** errors — paying for that second
typecheck only when something failed.

## Finding 4 — motu can't ship raw TypeScript to a strict host

Twenty's base config sets `rootDir: "."` and `importHelpers: true`. Consuming `@motu/core` as raw TS
(`main: src/index.ts`) meant the **host compiles the framework with the host's settings**: sources
outside `rootDir`, and a `tslib` dependency Twenty never asked for. Pointing at built `.d.ts` fixes
both — declarations are exempt from each — so motu needs a real build step.

## Finding 5 — React 19 collapsed the island contract

`PropsOf<C> = C extends ComponentType<infer P> ? P : never` inferred `Props | undefined` against
React 19's `FunctionComponent`, because **motu's own scaffold** writes an optional props parameter
(`({ title = 'x' }: Props = {})`). `keyof (Props | undefined)` is `never`, so every declared
`contract.input` became a type error naming no valid alternative. peps' React 18 types infer
differently.

## Finding 6 — The lagoon only ran for hosts with an adapter

`@motu/*` aliases came **only** from the host adapter's Vite contribution, and both existing adapters
open by spreading `noInstallAliases`. With `host: "none"` the lagoon booted with an empty alias list
and died on `@motu/react could not be resolved`. The "no install step" promise held for exactly the
two frameworks that ship an adapter.

Worse, the scaffold generated a lagoon that **could not work**: the focus *entry* was
`src/lagoon.tsx` and the overrides stub `src/lagoon.ts`, and writing `index.html` made the project
"own" its lagoon, disabling materialization — so those two files became what Vite serves. A region's
`layout` override returns JSX, so overrides must be the `.tsx`, which is the entry's name. Following
the scaffold produced a lagoon serving its own overrides as an entry and rendering an empty `<div>`.

Two smaller ones in the same area: `render` was single-pass, so `envShim`'s value left a literal
`{{envImport}}` in generated entries; and behind a tunnel Vite 5.4's host check answered **403** to
the one audience the server was exposed for, with nothing in the CLI to say so (`hosts` in
`lagoon.config.json` now names expected hostnames).

---

## What the region looks like now

```
motu archipelago verify — record-page

  ✓ coupling           coupled through the host: editingWidgetId — read by more than one island,
                       written by none of them, so the application is what couples them
  ✓ ownership          3/3 bound key(s) owned — 3 host, 0 island
  ✓ region-flow        3 declared flow step(s) end as declared
  ✓ lagoon-render      region + all 2 island(s) mounted in the lagoon
  ✓ no-console-errors  no console errors / unhandled rejections (region)
  ! catalogue          2 member type(s) declared and no capture to check them against
```

The flow is host-driven and ends on **render**, not on the store — because asserting
`editingWidgetId` after providing `editingWidgetId` is a tautology that cannot fail unless the lagoon
is broken:

```ts
{ provide: { editingWidgetId: FIELDS_WIDGET.id },
  expectRender: { 'w-fields': 'editing', 'w-notes': { text: 'idle', notText: 'editing' } } },
{ provide: { editingWidgetId: NOTES_WIDGET.id },   // not "the first island always wins"
  expectRender: { 'w-fields': { text: 'idle', notText: 'editing' }, 'w-notes': 'editing' } },
```

Negating one clause fails it with the rendered text, so it is a gate and not decoration. **Every
green claim here was checked by negating it**; the ones that couldn't fail were fixed first.

The remaining `catalogue` warning is deliberate. Twenty's own capture answers this region's query
with `[]`, so pointing the check at the lagoon seed would be checking declarations against a fixture
written to satisfy them. It correctly refuses to claim.

## The lagoon renders the REAL components, not stand-ins

The first version of this region rendered hand-written stand-ins — a heading and the word "idle" —
and everything was green. Replacing them with Twenty's own `FieldsWidget` and `NoteWidget` needed no
new motu concept, only one adapter: `host: 'vite'` **loads the host's own `vite.config.ts`** and
borrows its plugins (linaria, lingui, svgr) and aliases, rather than motu restating what a Vite app
might need. A Vite application IS its config; any list motu wrote would drift the day the app adds a
plugin.

What the island file then contains is the app's own recipe, taken from
`FieldsWidget.stories.tsx`: an app that can render a component in Storybook can render it in the
lagoon, because both need the same thing and the app already owns it. Getting there was a converging
loop — each error named exactly one missing context (`useTargetRecord` → `ApolloCoreClient` →
`Router` → `I18nProvider` → `FileUploadProvider`), which is a good failure mode: the app tells you
what it needs.

Two more framework fixes fell out. A monorepo hoists the host's dependencies ABOVE the host, so
`twenty-ui/style.css` and the `@fontsource` files resolved outside every root in Vite's `fs.allow`
and were refused — surfacing as the app's components rendered with none of the app's theme. And the
host's global stylesheets are named in its entry file, so the lagoon's overrides load the same ones
in the same order.

Two more things the real components taught, both invisible with stand-ins:

- **The GALLERY was blank while the focused view worked.** The notes island rendered only because the
  fields island's module had already run `initialI18nActivate()` at import time; in the gallery the
  load order differs and the tree died on "attempted to call a translation function without setting a
  locale". A side effect in one island quietly making another island work is not a setup, it is a
  coincidence — so the activation, the store seeding and the providers moved into one shared frame
  both islands import. **Check both views**: the focused lagoon is what `verify` drives, and it is not
  the one a human opens first.
- **The page's card chrome cannot be the app's own `WidgetCardShell`.** That component renders
  `WidgetContentRenderer`, which now contains `<RecordPage.Island>` — an island rendering the shell
  would summon itself forever. Composing the card's own parts (`WidgetCard` / `WidgetCardHeader` /
  `WidgetCardContent`) gives the same chrome without the cycle. Worth knowing as the cost of "wrap,
  don't replace" when the thing being wrapped is a dispatch table.

**And it invalidated a passing check, which is the point.** The declared flow asserted that providing
`editingWidgetId` flipped one island's text to "editing" and left the other "idle". It passed —
against components that said those words because I wrote them. Against the real widgets every step
failed: Twenty surfaces that affordance in `WidgetCardShell`, which this region does not mount. The
coupling is real (both islands bind the key) and simply is not observable in these widgets' text, so
the flow now asserts what the application actually renders — a field label out of the object
metadata, and `NoteWidget`'s own empty state. A promise about a stand-in is a promise about nothing.

## No motu-only components in the app's repository

The islands started as `RecordFields` / `RecordNotes` wrappers, and that was the wrong shape: they
existed only to install providers and draw chrome, which is motu-only code living in the host repo.
An island can BE the app's component — `component: FieldsWidget`, contract input `widget` — and both
wrappers were deleted. What they were doing splits three ways: providers → the lagoon's `providers`
override (every view, per island), chrome → the region frame (arrangement), the widget row → `seed`.

Making that split work took four fixes, and each was a case of the same thing — the region view
(what a human opens) and the mountpoints view (what the flow checks drive) are not the same tree:

- `providers` had to be a first-class override rather than part of `layout`, or the checks render
  islands with no environment and report "the region rendered nothing".
- It had to apply PER ISLAND, because some of it is per-island (a widget instance id).
- The focused mount had to forward it too — a single-slot mount needs the environment as much as the
  region does.
- The frame needed the providers for its OWN chrome: `WidgetCardHeader` reads a page-layout instance
  id and throws without it.

And the resulting nesting disproved a claim I had written into a comment ("free, they are context
providers"): React Router throws on a nested `<Router>`, and both cards rendered as "Invalid
Configuration". Providers that cannot nest must gate themselves.

## The coupling, and the limit it found

The two widgets were genuinely independent, so the region proved placement and removability but never
coupling. Adding the third island — Twenty's own `WidgetSettingsManageSection` — fixed that: clicking
a widget card calls the app's `useOpenWidgetSettingsInSidePanel`, which sets
`pageLayoutEditingWidgetId`, and the panel renders that widget's settings. Empty → populated, driven
in a browser, through the app's own click path rather than a `set` I wrote.

Making motu SEE it needed a new declaration. `bind` is the prop path and the panel has no prop for
this — it subscribes to a Jotai atom — so a real coupling read as "no shared state between islands".
`reads: ['editingWidgetId']` declares a consumer motu cannot otherwise find. It is a claim, not a
wire, and that is the honest half of auditing a store you do not own.

Then the ownership guard fired, and it was right. Declaring `writes` on BOTH widget members
(any card can open settings) is not one producer, and motu allows exactly one. **A catalogue can have
no single producer for a key its members share** — the writer is the CARD, chrome shared by every
member rather than any member. The correct model is motu's own rule (a control that owns region state
is an island even when others sit inside it): the card becomes an island CONTAINING the widget, via
nested slots. Until that exists here, the key is declared host-written, which is what it is.

## Closing the class, not the instances

Nine bugs were fixed one at a time, and every one was found the same way: a check went green, a human
opened a browser, the thing was broken. That does not scale, so two of the sub-classes are now closed
mechanically.

**An empty search is not a pass.** `report.ok` takes what was examined and converts `seen: 0` into a
`skip`, so the invariant holds at every call site rather than where its author remembered it.
`removal-check` — the command that started this — now exits 1 with "scanned 0 files … nothing was
examined, so nothing is proved". Reproducing the original bug (pointing `hostSources` at Next's
directories against a `src/`-shaped app) makes it refuse.

**Every check states its N.** `✓ islands-registered  all 3 island tag(s) are registered · 3 declared
tag(s)`. A wall of green no longer hides a check that examined nothing, for a human skimming or an
agent parsing `--json`.

Verifying that fix found one more of the same: `hostSources`, the escape hatch added FOR the scan bug,
was silently dropped by `loadMotuConfig`'s hand-built whitelist and had never worked. The lesson is
the discipline, not the line: reproduce the original failure against the fix, or the fix is a claim.

**A flow step must be able to fail.** `flow-mutation` closes the third sub-class. Each
assertion-bearing step is re-run with its stimulus changed; an assertion that still holds does not
depend on the input and is reported as asserting a constant. A cheaper static rule sits beside it: a
step whose `expect` names only the keys it just `provide`d is a tautology by construction. Both were
verified by planting one of each — the static rule caught the first, mutation the second — and peps'
seven real `emit` steps kill their mutants without a false positive.

Writing it produced one more instance of the very failure it targets: a mutant replays its untouched
prefix steps, those pass correctly, and counting them as survivors made every mutant look like a
tautology. A check about checks that cannot fail, which could not fail.

The limit is worth stating: an assertion on a stand-in's invented vocabulary passes both rules. Text
written into a stub is perfectly sensitive to its stimulus. Only rendering the app's own component
makes that visible — which is the rule, not a check.

## The parallel-agent conflict was not actually caught

Two islands declaring `writes` for one key — the canonical conflict when agents work in parallel —
passed every static check. `ownership` reported "4/4 bound key(s) owned" for a key with two owners,
because `declaredWritten` is a Set and the duplicates collapsed into one entry. Only the runtime
store guard caught it, during a `--runtime` pass, after both islands existed and both agents were
done.

It is now an error in the fast loop, grouped by ELEMENT rather than slot — peps rejected the first
version of the rule as a false positive, correctly: its filter panel is ONE island placed in two
slots, both writing `filters`, which is what "two slots, one island" has to mean.

That closes the question of whether parallel agents need a claim ledger. They do not: declare the
whole region in the survey, and every agent branches from an archipelago that already holds the other
agents' ownership, so a second claim fails in their own branch on their first check.

## What is still unproven

The integration is verified at typecheck level and in the lagoon. **Twenty has never been run in a
browser with motu inside it** — that needs its dev server, backend and a workspace. So "the widgets
still work in the app" is not a claim this test makes, and given how many green-over-dead-code
failures are listed above, it should not be assumed.

## Reproducing

```
~/dev/oss-twenty                              # sparse clone, branch motu-robustness-test
  packages/twenty-front/motu/                 # the motu project (100% removable)
  packages/twenty-front/src/modules/motu/     # the composition root (deleted by removal-check)
```

```sh
cd ~/dev/oss-twenty/packages/twenty-front/motu
node ~/dev/motu/packages/cli/src/cli.mjs archipelago verify record-page --runtime
node ~/dev/motu/packages/cli/src/cli.mjs removal-check
node ~/dev/motu/packages/cli/src/cli.mjs lagoon dev --archipelago record-page --port 8820 --host
```

Commits: `cf38549` (catalogue membership), `d358bfb` (adoption fixes), `9add012` (lagoon fixes),
`600d2f9` (host-driven flows).
