# Implementation plan — motu in a modern host (`host: "next"`)

Status: proposed. Target adopter: `~/dev/peps_ta_boite` (Next 15 + Supabase + shadcn).
Reference ocean (`host: "angularjs"`, `~/dev/ocean`) must keep working unchanged throughout.

## The problem, measured

peps' committed integration is **56 files / ~1,260 lines** (excluding a 2,638-line lockfile):

| Bucket | Files | Lines | Verdict |
|---|---:|---:|---|
| per-island (`element.ts` + `index.ts` + `fixtures.mock.ts`) | 24 | 318 | 41 lines of code, 108 of comment; 8 files are 1-line re-exports |
| registries (`islands/registry.ts`, `archipelagos/registry.ts`) | 2 | ~30 | hand-maintained, one row per island |
| archipelago configs | 2 | 84 | **the real artifact** |
| `roots/lagoon/` harness | 12 | ~350 | ~zero project decisions in it |
| `roots/lagoon/src/host-stubs/` | 6 | 201 | reimplemented shapes that will drift |
| seeds + the one authored island | 2 | 146 | real content |

Two measurements drive the plan:

1. **Only 2 of 8 islands have a single HTTP-shaped fixture.** Six export `fixtures: []`. What actually
   drives them is `scenarios[].seed` — store keys. `fixtures.mock.ts` is, six times out of eight, a
   scenario file with an empty mock array on top.
2. **Seeds exist twice** — per-island in `scenarios[].seed`, and again in
   `roots/lagoon/src/lagoon.ts` under `seed.actions.*`. Same keys, hand-kept in sync.

And: **7 of 8 islands wrap a component the app already ships**. Only `SectorPicker` was authored as an
island, so `src/ui/` — the "survivor that lifts out to the mainland" — has one occupant and a
`.gitkeep`.

## The diagnosis

`host: "next"` **already exists** in `packages/cli/src/lib/config.mjs`, and verify already reports
`no legacy fit required (host: next)` (`verify.mjs:247`). The posture is declared and half-honoured.
What remains are *residues* — obligations the ocean needs that a modern host still pays:

- `DefineOptions.legacy` is **non-optional in TypeScript** (`packages/react/src/defineReactElement.ts:47`),
  so peps declares `legacy: 'fill'` 8 times while the CLI skips the check. A blank field, not a
  skipped rule.
- `adapter-next` already offers `mount: 'react' | 'element'` and peps runs `'react'` — islands render
  in the page's own React tree, no custom element in the mount path. But `defineElements`
  (`packages/adapters/next/src/archipelago.tsx`) still calls `defineMotuApp` → `registerElements` →
  `defineReactElement` for **every tag anyway**, because the registry is `ElementSpec[]` keyed by tag.
  **The posture axis exists at mount time and does not reach declaration time.** That is the gap.
- `element.ts` exists because the custom element exists. `index.ts` exists because `element.ts` sits
  in a folder. Both are ocean shapes.

## Design decisions (settled)

**D1 — The island stays the unit; a *file* appears only when there is something to say.** The island
is the addressable unit of the loop (`motu island verify <name>`, `MOTU_TARGET=island:<tag>`,
`motu fixtures record <island>`, per-island CSS) — but addressability comes from the name the
archipelago already declares, not from a file existing. A file appears when the island owns
**evidence** (contract fixtures), **ambient** requirements, or a boundary the snapshot cannot derive.
Six of peps' eight islands own none of those. See D7.

**D2 — Contract ≠ coupling.**
- The **archipelago** owns coupling: `bind`, `on`, `layout`, the store. Region-level, stays region-level.
- The **island** owns its boundary and its evidence: input / output / ambient, scenarios, recorded fixtures.

**D3 — The custom element is not deleted, it is switched off.** It is the framework-agnostic mount —
the thing that outlives React. Mainland is not a terminal state, it is **the trough between two
oceans**: today peps is the mainland; the day React is the legacy stack, peps *is* the ocean and
next-stack islands mount into its pages by tag, same repo, posture flipped, **no island file edited**.

**D4 — Posture is per project, never per island.** The moment one island can opt into `legacy` in a
`next` project, the modes fork and every rule gains an "unless…" clause.

**D5 — Every ocean concept must be a rule verify can *skip*, not a field islands leave blank.**
A skipped rule leaves no residue in the repo. `legacy: 'fill'` × 8 is what a blank field looks like
after a year.

**D6 — The lagoon stays offline and static.** Not live-local Supabase. A seeded DB reintroduces
exactly the ambiguity the lagoon exists to remove ("component wrong" vs "seed drifted"), the static
publish is a real differentiator that already works, and — decisively — **the ocean case cannot have
a live-local backend**, so making live-local the default forks the two modes. Instead: **record, don't
write.**

**D7 — Inline what is honest; delete what is derivable; keep only evidence separate.** Measured over
peps' 14 declared `default:` entries, **13 are honest component defaults** (`isLoading: false`,
`missions: []`, `overallProgress: 0`, …) — putting them in the app's component is an *improvement to
the app*, not pollution. Exactly one is a lagoon fiction (`phone: '+33617866318'`, in a component
imported by the production `directory-member-fiche.tsx`). That one is the tell:

> **If a default cannot be honest in production, it is not a default — it is missing evidence.**
> It becomes a scenario seed, not a declared default.

Applied to the three parts of an island declaration:

| Part | Under `host: "next"` |
|---|---|
| input defaults | **move into the app's component**; `PropEntry.default` filling becomes dead code |
| output / event mapping | **evaporates** — a CustomEvent exists because a JSP template cannot take a callback; under `mount: 'react'` a callback is a callback |
| evidence (fixtures, scenarios) | **stays out of the app** — test data must not enter a production module graph. The only part with no honest reading in the app |

What remains for a wrapped island is the tag (derivable from filename) and the component reference
(which the archipelago already needs to place it in a slot). For a prop-fed island with no contract
fixtures — six of peps' eight — that is an empty file, so there is no file.

This does **not** reopen folding into the archipelago (rejected for granularity). Nothing moves into
the archipelago; it already declares slot, element and `bind`. What is deleted is a file that says
nothing. The coupling display reads the archipelago's `bind`/`on` plus mount-time attribution in
`core/archipelago.ts` — neither is touched.

**The cost, accepted explicitly.** Moving defaults into app components means motu's "renders from
defaults alone" gate starts driving edits to app code. Constraint 4 is therefore restated precisely:

> motu's **imports and types** must never appear in the app's components. motu's **pressure toward
> better defaults** may — as a verify *warning that proposes the edit*, never as a silent requirement.

**D8 — The region's key vocabulary is a type EXTRACTED FROM THE APP, and motu accepts nothing else.**

Model B (Phase 4) makes the page pass its own props while the archipelago also declares `bind`/`on` —
two statements of one coupling, which drift. Evidence that this is not hypothetical: the page already
calls it `loadingReceived` (`page.tsx:96`) while the archipelago's store key is `receivedLoading`.
Different names for the same thing, with nothing linking them.

The fix, in order:

1. **Delete before extracting.** Under Model B, `bind` for a page→island-only prop and `on` for a
   callback the page already wires are both dead — the page passes the value and the JSX says so. Only
   genuinely *shared* vocabulary survives. You cannot drift on a declaration that is not there.
2. **Extract what remains as a TYPE, from the app, containing no motu.** Not a hook, not a module of
   values — a type. Three consequences: it **erases at runtime** (zero footprint, not merely a no-op on
   removal); enforcement is **`tsc`, not a CLI check** (rename a key in the app and the archipelago
   fails to compile); and it requires **no refactor of the page's runtime code** (declare the type,
   annotate what is already there).
3. **motu accepts nothing else:** `ArchipelagoConfig<TRegion>` with **no default** under `host: next`,
   `bind` keys typed `keyof TRegion`. An archipelago cannot compile without naming a region type. That
   is the whole enforcement mechanism — one design decision, no new tooling. The archipelago imports it
   **type-only**, so nothing is added to the runtime graph in that direction either.

**The gap this leaves, and how it closes.** The type binds *motu → app*. Nothing yet binds *app →
type*: if the page keeps bare locals and never annotates them against the region type, the type is a
fiction motu is checked against and the app is not. So the page must consume it structurally — region
state declared as one object typed by it, or `satisfies` on what it passes into slots. Without that,
the drift has moved rather than died.

**Ocean posture.** Under `host: angularjs` the type parameter stays defaulted, because there is no
app-side type to extract: region state lives in `$scope` and motu declares it. Same mechanism,
different provenance of `T`. Which generalises to:

> **Duplication exists only where a host page already does the work.** In an ocean, the archipelago
> *is* the region state. In a modern host, the page is — so motu must reference it, never restate it.

**D10 — An archipelago is a declared grouping of islands scattered across ONE PAGE. motu derives the
coupling; it does not dictate the membership.**

*This decision was revised. The first version said "membership is earned by a key, never by proximity"
— the right evidence, the wrong conclusion.* The `actions` archipelago had zero island-to-island
coupling and wrote `newReceivedCount` for a reader nobody in it could see. But that reader —
`ReceivedSummaryButton` — is **on the same page**, up in the week navigator. The boundary was not wrong
for being proximity-based; it was wrong for following a **DOM subtree** (the two-column div) instead of
the page. Widen it to the page and the coupling is internal.

> **You declare the grouping a human can see (the page's islands, scattered, referenced by slot, never
> contained). motu derives the thing a human cannot: who is coupled to whom.**

Same division as the contract — declare the boundary, derive the graph.

**A page is a MIX, and that is normal.** peps' actions page: two islands share `newReceivedCount`; five
are prop-fed or read the backend themselves and couple with nothing. An archipelago is not required to
be coupled, and an uncoupled member is not a smell.

**Rules, after revision**
- **Orphan key** (kept — it is the one that found the real bug): a key written inside and read by no
  member means *the coupling escapes this archipelago*. Either its reader is an island on this page not
  yet a member, or it is cross-page — which the lagoon does not verify (D11) and the store does not
  survive.
- **Dropped:** "no island-to-island coupling" and "inert island". In a mixed page archipelago both are
  normal, and a permanent unactionable warning is one people learn to ignore.
- Coupling is always reported, including "no shared state — a page whose islands are independent": a
  check that says nothing is indistinguishable from one that did not run.

*Analysed over CODE, not text.* The first version reported peps' `directory` as sharing
`someStoreKey` — a scaffolded TODO **comment**. Same trap as the commented-out `service:` fixtures:
two for two, so any new static rule strips comments first.

**peps now:** two page archipelagos — `actions` (7 islands, sharing `newReceivedCount`) and `directory`
(2 islands, independent). Layout in the app (D9), region vocabularies in the app (D8).

**D11 — The lagoon has no backend, ever. motu is a boundary instrument, not a test runner.**

The cross-page question (island A on one page changes what island B shows on another) has one honest
mechanism: the backend. Following it leads to simulating that backend — a stateful fake, or the real
schema in pglite. Both were investigated and both are **declined**.

*Why.* peps' reads go through Supabase RPCs whose bodies are not in the repo (`supabase-schema.sql`
holds one `CREATE TABLE` and zero functions), and one call site passes the function name dynamically.
So a fake would REIMPLEMENT business logic that cannot be diffed against the original — the thing motu
refuses to do with authorization, for the same reason. And the moment the lagoon has a backend it
loses determinism, one-cause failures, speed, and the artifact that opens on a phone with nothing
behind it. What is left is a worse local environment.

**The scope line:**

| | proves | how |
|---|---|---|
| **lagoon** | a component and its declared boundary | one island or one feature, no backend, fixtures, deterministic, headless, exit-coded, publishable |
| **local app + Playwright** | the system | cross-page, real backend, real auth |

motu does not compete with the second. It makes the second unnecessary for the FIRST class of bug.
Cross-page coupling is verified by integration tests; each page's islands are verified against their
own fixtures.

**What motu is for in a healthy project.** Measured over this work, five things landed. Four are
design-time, one is testing:

1. An invisible coupling became visible, then falsifiable — `newReceivedCount` was produced in one
   corner of a page and consumed in another through page state plus a `document.getElementById()`
   reach. Nothing named it; motu forced it to be named, then PROVED the grouping around it was wrong.
2. A drift became a compile error (`loadingReceived` vs `receivedLoading`, already diverged).
3. Defaults got honest — 13 of 14 belonged in the app's components; one was a fiction that would have
   rendered a stranger's phone number on a production screen.
4. A DOM reach-out became an intent, because an island cannot reach across the page.
5. A deterministic headless loop with an exit code, plus a phone-openable artifact.

> **A component's inputs, outputs, ambient needs and couplings are declared and mechanically checked.
> The lagoon is not the product — it is the PROOF OBLIGATION that keeps the declarations honest.**

That last clause is the load-bearing one: declarations without a forcing function rot. This repo's own
`fixtures.mock.ts` files sat empty with TODOs, and `legacy: 'fill'` was declared eight times while
nothing read it. A component that cannot render alone against fixtures has a wrong boundary — the
lagoon is how you find out, not what you ship.

**Honest limit:** motu's value scales with accumulated implicit coupling. Small, prop-driven components
with no coupling pain get little from it beyond the contract seam.

**D12 — One concept. No kinds, no boards.**

Two drafts were rejected on the way here, and both were concept proliferation:

1. a second noun (*board*) for preview groupings;
2. `kind: 'feature' | 'structural'` — an archipelago with a store versus one without.

The second broke on the same fact that produced D10's revision: **a page is a mix.** peps' actions page
has one coupled pair and five uncoupled islands, so it is neither purely structural nor purely feature,
and a binary forces a false choice — lose the coupling declaration, or lose the screen.

There is one archipelago. It has a store. Some members bind to it; most do not. What would have been
"structural" is simply an archipelago whose derived coupling graph is empty — nothing to declare and
nothing special about it.

**The gallery iterates archipelagos**, and rendering follows what the page has: the app's layout
component when one is supplied (D9), the mountpoints view otherwise.

## Two standing constraints

These govern every phase below. A change that violates either is wrong regardless of how much it deletes.

### C1 — Every change is an *optimisation*; the verbose architecture stays reachable

peps is the **best case**: no ocean, friendly host, the app's own components. It is not the template.
When the ocean is hostile, the verbose form must still be available — and available as an *escape
hatch*, not as a rewrite.

The mechanical form of that promise:

> **The lean form must be a projection of the verbose form, not a different model.**

Which means, for every derivation this plan introduces:

- **Anything derived has an explicit override of the same shape.** A derived tag can be declared; a
  component default can be overridden by a declared one; a generated snapshot entry can be
  hand-written. Deriving is a *default*, never a law.
- **`motu island explode <name>`** is the mechanical inverse of the Phase 3 collapse: it writes out
  everything the framework was deriving, producing today's verbose form.
- **Round-trip gate (CI):** for every island in both projects, `explode` then re-verify must produce
  an **identical verify report and identical mount behaviour**. This is what makes "we can always go
  verbose" a tested property rather than an intention. Without it, the escape hatch rots in a
  release or two.

**Scope note (tension with D4).** Hostility varies *per region* — one legacy page has aggressive CSS,
the next does not. Resolution: **posture (`host`) stays per project (D4); verbosity and isolation are
per island and additive.** `options.isolation` is already per element and stays that way. What must
never become per-island is the *host posture*, because that is what forks the rule set.

### C2 — Removing motu from the app must be a **no-op**, not a breakage

motu references are allowed in the host app. What is not allowed is motu being load-bearing: delete
the framework and the app must still compile and render.

The checkable form — motu may appear in app code only as one of:

1. **A file that is 100% motu**, deletable whole (composition roots, dev pages), or
2. **A wrapper whose deletion leaves valid JSX** — strip the motu import and unwrap the element, and
   the page still renders its own components with the props it already computes.

**Audit of peps today.** It passes, by accident. The entire surface is two wholly-motu files
(`components/motu/directory-archipelago.tsx`, `app/dev/motu/page.tsx`) — form (1). But the six
`actions` islands are **not yet mounted on `app/dashboard/actions/page.tsx`**, and that is where form
(2) will be needed. Designing for it now is the point of stating the constraint.

**What C2 implies for the store.** Form (2) only works if the page's own JSX is complete without
motu — i.e. the page passes its props as it always did. So under `host: "next"`:

> The page **seeds**; the store **augments**. `bind` means "this prop may *also* be driven by the
> region store" (for cross-island coupling), not "this prop *comes from* the store."

This is not a fork of the model — it is the same store and the same `bind`, with posture-dependent
provenance: a React page seeds the store from its own props; an ocean seeds it through channels,
because there is no page to do it. And it matches the measurement: **six of eight peps islands are
already prop-fed by the page**, so for them the store is duplicating what the page does.

**Two things C2 strengthens rather than threatens.** D7's default migration survives motu removal —
those defaults are a gift to the app, not a dependency. So does `services/index.ts`: it *references*
the app's own functions, so deleting it leaves them untouched.

**Verification.** A `motu removal-check` that strips motu imports and unwraps motu JSX in the host
app, then runs the host's own typecheck. Cheap, and it is the only way this constraint stays true
after the fourth integration rather than the first.

## The posture table

The contract between the two modes. Anything not in this table is invariant.

| | `host: "angularjs"` | `host: "next"` |
|---|---|---|
| tag | required, appears in template | derived from filename; an id, not a DOM element |
| custom element emitted | yes | no (until the posture flips — then yes, no island edit) |
| `legacy` fit strategy | **required** | **absent** — not optional, not asked |
| CSS dual-mode `:where(:host, .motu-root)` lint | enforced | **enforced** (see Phase 2 — the original claim here was wrong) |
| isolation default | `shadow` (bleed is real) | `light` (the app's Tailwind is the point) |
| channels / `$scope` coupling | declared + verified | none |
| ambient (contexts, clocks, feature gates) | rare | **the main coupling** |
| island file contains | component, input, output, `legacy`, evidence | component, input, output, evidence |

**Invariant in both** (this is what keeps it one framework, not two): one declared `Store` per region;
`bind` from store key to island prop; all server I/O through the contract seam; verify's runtime gate
(renders from defaults, survives a forced 500, identical on remount, distinct seeds → distinct
output); the seam lens.

---

## Phase 1 — The framework owns the lagoon

> **STATUS: COMPLETE.** peps' `roots/lagoon/` went from **12 files + a lockfile + node_modules to 8
> files with zero dependencies** — and those 8 are all genuinely the project's (`lagoon.config.json`,
> the region seeds, the host stubs). The reference ocean is untouched. All 21 verify reports are
> identical to the phase-0 baseline throughout.


**Why first:** biggest deletion, zero design risk, independent of every other phase, and it is the
change that most visibly stops motu looking like a scaffolder.

~350 lines + a `package.json` + a lockfile + a `node_modules` leave every adopting repo. Essentially
none of it is a project decision: the alias table (`next/link` → stub, `@/` → host root, `dedupe:
['react','react-dom']`) is **Next-adapter knowledge**; the `__MOTU_*` defines are a contract between
`vite.config.ts` and `verify.mjs` that the file's own comments warn you not to break; `main.tsx`
states "improvements arrive with the framework instead of needing this file regenerated" and then
exists anyway, hand-written, per project.

**Changes**
- `motu lagoon dev` boots Vite **programmatically** from the framework (`createServer`), with the
  config built in-process from `motu.config.json` + `lagoon.config.json`. Same for `build`, so
  `lagoonPublishCommand` / `lagoonServeCommand` stop `spawnSync`-ing a Vite binary at
  `cwd: paths.lagoonDir`.
- The gallery and focus entries (`main.tsx`, `lagoon.tsx`) become framework modules in `@motu/react`,
  parameterised by a virtual module that supplies the project's registry / fixtures / config. The
  `import.meta.glob` calls move behind that virtual module.
- Host-specific Vite knowledge (`NEXT_VITE_ALIASES`, `NEXT_STUBS`, `NEXT_TAILWIND_CONFIG`,
  `NEXT_VITE_CSS` in `packages/cli/src/lib/scaffold.mjs`) moves into `@motu/adapter-next` as a
  **config contribution**, not a template.
- `motu lagoon eject` writes today's files for a project that genuinely needs to fork.

**Deleted from peps:** `roots/lagoon/{vite.config.ts,main.tsx,lagoon.tsx,env.ts,fixtures.ts,
next-stubs.tsx,tailwind.config.ts,index.html,lagoon.html,package.json,package-lock.json}` and the
lagoon's `node_modules`. **What stays: `lagoon.config.json` and `src/lagoon.ts` (the seeds).**

**Risk — RETIRED.** Tailwind's loader needs a real config file on disk (it is what handles a host
config that `require()`s CJS plugins). Resolved by **generating, not committing**: the config is
written to `.motu/cache/tailwind.lagoon.config.ts` and Tailwind is handed that path. Proven by
building peps' lagoon both ways and diffing — identical CSS byte-for-byte (121,775 bytes, 787
utilities, host `xs:400px` breakpoint and `--primary-control` token both present).

**Landed**
- `packages/cli/src/lib/lagoon-vite.mjs` — the config, assembled in the framework. Includes
  `resolveVite`/`resolveBuildDep` (condition-aware ESM resolution: `createRequire().resolve()` always
  picks the `require` condition, which for Vite is the CJS build with no `build` on it) and a guard
  rejecting util.mjs's curated `paths` export, which has no `host` and would silently yield an
  alias-free lagoon that fails as "@motu/react could not be resolved".
- `packages/adapters/next/vite.mjs` + `lagoon/next-stubs.tsx` — Tailwind generation, the `@/` alias,
  `next/*` stubs, the `process.env` define.
- `packages/adapters/angularjs/vite.mjs` — basicSsl + HTTPS + the dev proxy, whose **target moved to
  `lagoon.config.json`** (a project fact) instead of being hardcoded in a scaffolded config.
- `packages/cli/src/lagoon-build.mjs` / `lagoon-dev.mjs` — runners. `publish`/`serve` and
  `playwright-lagoon.mjs` (verify's runtime mount) now spawn these instead of the Vite CLI; kept as
  subprocesses because two call sites sit inside sync watcher/request callbacks.
- `motu lagoon dev` — replaces each project's `npm run dev` inside `roots/lagoon`.
- **Deleted from both projects:** `vite.config.ts` (125 lines in peps), `tailwind.config.ts`,
  `src/next-stubs.tsx`.

**Verified**
- Both lagoons build byte-identically to their pre-change artifacts (peps and the reference ocean).
- Real-browser `island verify` passes on both, including `data-flow`, `error-resilient`, and the
  ocean's `fit=legacy` mount.
- All 21 `--no-runtime --json` reports identical to the phase-0 baseline.

**Entries: ownership, not generation** (`lib/lagoon-materialize.mjs`)

The obvious design — "move the entries into the framework" — is WRONG, and checking before building is
what caught it. The reference ocean's `main.tsx` is ~180 lines of real composition: MockTransport ↔
session-authenticated HttpTransport switching, an AngularJS host stood up for extracted islands,
per-archipelago channels and seeds, tide-line stations, an ocean stylesheet. No template produces
that. Generating over it would have destroyed working code.

So the rule is **ownership, decided by one marker**: if the project has its own `index.html`, the
project owns its lagoon root and the materializer never runs. Otherwise the entries are rendered into
`.motu/cache/lagoon` from the same templates `motu init` uses. Every `motu init --host next` project
carries entries that ARE the template — those are the ones this deletes; the ocean keeps its
composition root and does not even notice the change.

`motu lagoon eject` is therefore not a special path — it is the same materializer writing into the
project instead of the cache, which is what makes C1's escape hatch real rather than promised.

**Also landed**
- Build deps (`@vitejs/plugin-react`, `tailwindcss`, `autoprefixer`, `@vitejs/plugin-basic-ssl`) moved
  into the motu checkout, so a project needs none. Verified by deleting peps' lagoon `package.json`,
  lockfile and `node_modules` outright: identical build, verify still green.
- `server.fs.allow` set explicitly. With a generated root under `.motu/cache`, every real file is
  outside it and Vite's root-inferred allow-list would 403 the very modules the lagoon renders.

**Verification (all three properties measured, not assumed)**
1. **Ocean untouched** — builds byte-identically; the materializer does not run for it.
2. **peps with generated entries** — differs from its pre-change artifact by exactly **24 bytes**,
   fully accounted for: the `import.meta.glob` result KEYS gain one `../` (8 islands × 3 chars)
   because the generated `fixtures.ts` sits one level deeper. Those keys are only `Object.values()`-ed,
   never read. CSS byte-identical.
3. **C1 round-trip proven end-to-end** — original hand-scaffolded entries → framework-generated →
   `motu lagoon eject` → **byte-identical to the original artifact**. The escape hatch reproduces
   exactly what it replaced.

**Deferred (cosmetic)**
- A residual "CJS build of Vite's Node API is deprecated" warning: something in the plugin chain still
  reaches Vite's CJS entry. Does not affect output — all comparisons above were made with it present.

---

## Phase 2 — Finish the `next` posture

> **STATUS: COMPLETE.** Ocean reports 11/11 identical to the phase-1 baseline; peps' only change
> across all 10 reports is `legacy-strategy` going `ok` → `skip`. That is D5 proven: a rule that
> becomes skipped under `host: next` stays `ok` under `host: angularjs`.


**Why second:** must land before the island file is collapsed, or the collapsed file gets shaped twice.

**Spike outcome: neither (a) nor (b).** Both were wrong. `legacy` is read at runtime in exactly one
place — setting the `data-motu-legacy` attribute (`core/island.ts`) — so the type was its only real
constraint. (b) would have meant a distinct `OceanElementSpec` and rewriting the ocean's eight
`element.ts` files to call a different function: churn in the one project this work must not disturb.

Chosen instead, and it IS D5 rather than a compromise with it: **`legacy` is optional in the type and
required by the posture-aware CLI rule.** A required type field is precisely "a field islands leave
blank"; a posture-aware rule is precisely "a rule verify can skip".

**Landed**
- `IslandElementOptions.legacy` / `DefineOptions.legacy` → optional; the attribute is simply not set
  when absent, so `[data-motu-legacy]` CSS cannot match a posture that was never real.
- `report.skip()` — a third level, printed `–` and carried in `--json`. Deliberately not `ok`: a
  skipped rule reported as passing is indistinguishable from one that ran, so the two host modes could
  drift apart with every report still green. Exit codes are unaffected (`errors`/`warns` filter by
  level explicitly).
- **The legacy rule now tests posture FIRST.** It previously tested for the field first, which made
  the skip branch unreachable for any project that declared it — i.e. every project, because the type
  required it. That is why peps' eight islands each reported *"declares a required legacy-fit
  strategy"* under `host: next`. Declaring it under a modern host is now a **warning** naming the
  reason, not a silent pass.
- `legacy: 'fill'` removed from all eight peps islands.

**Two claims in this plan were wrong; the code was right.**
1. *"`defineElements` still calls `defineMotuApp` for every tag anyway."* It does not. `defineElements`
   is called from exactly one place — `ElementArchipelago`, reached only when `mount === 'element'`.
   Under `mount: 'react'` (peps' path), `Island` renders the component directly from the ElementSpec
   and `customElements.define` is never reached. **The declaration-time gap did not exist.** No change
   was needed.
2. *"The CSS dual-mode lint is skipped under `host: next`."* It must not be. The rule flags a bare
   `:host`, which is **inert under light isolation** — so the check is MORE relevant under `host: next`
   (peps runs `isolation: light`), not less. Skipping it would have deleted a real check in exactly
   peps' configuration. The rule's true axis is isolation, not host. Posture table corrected.

**Still open (deferred, low value until it bites)**
- Driving `mount`/`isolation` defaults from `config.mjs` rather than per-call defaults. Both currently
  agree; centralising is tidiness, not a fix.

**Verified:** peps' islands compile with no `legacy` field (`tsc -b` clean across the workspace);
`motu island verify --json` on peps reports `legacy-strategy` as `skip` with the posture as the
reason; real-browser verify green on both, with the ocean still running both `fit=native` and
`fit=legacy`; ocean `--json` output identical to the phase-1 baseline.

---

## Phase 3 — One file per island

Per D7, this phase deletes more than it collapses. Three shapes, behind one glob:

- ~~**No file**~~ — **this case does not exist.** The premise was "the archipelago already names it";
  it does not. `IslandSpec` (`core/archipelago.ts`) carries `element: string` — a TAG, not a component.
  Something must map tag → component, and that is exactly what `element.ts` does. The irreducible
  minimum for a wrapped island is therefore ~4 lines (tag + component import), not zero. Phase 3's
  honest target is **24 files → 8**, not "at most 2".

> **STATUS: COMPLETE.** peps' `src/islands/` went from **25 files / 348 lines to 13 files / 283
> lines**, with **zero declared defaults left** (`motu island defaults` reports none). The reference
> ocean keeps the folder layout and its 11 reports are identical to the phase-1 baseline — both
> layouts are supported, which is C1 at the layout level.

**Delivered**
- `motu island defaults` — classifies each declared default `empty` (mechanical) vs `judge` (carries a
  value). On peps: 12 mechanical, 3 needing a domain call. It reports and proposes; it does not
  rewrite, because "is `kind: 'no-social'` a sound empty state?" is not a question a tool should answer
  by editing an app component.
- **Defaults migrated into peps' own components** (`ActivityNotice`, `NetworkStatsBanner`,
  `ReceivedActionsPanel`). `ChallengesPanel`, `AmbassadorProgressCard` and `SectorPicker` already
  defaulted theirs — those island entries were simply redundant.
- **`phone: '+33617866318'` routed to evidence**, as D7's rule demands: it is now `props` on the
  directory archipelago's island entry, not a component default. Making it a component default would
  have rendered a stranger's number for any caller that omitted the prop — including
  `directory-member-fiche.tsx`, a production screen.
- **Flat layout** `<kebab>.island.ts` + sibling `<kebab>.evidence.ts`; `index.ts` gone.
- **`motu island sync`** — the registry is now GENERATED from the files on disk. It cannot be a glob:
  the barrel that exports it is imported by the host application, and `import.meta.glob` is Vite-only.
  Static generated imports give the same "adding an island is not an edit" property in every bundler.

**Measured corrections to earlier claims in this document**
- *"only 2 of 8 islands have HTTP-shaped fixtures"* — it is **1** (sector-picker). The original grep
  matched commented-out `service:` examples in the scaffolded stubs. Four islands have real scenarios;
  four have no evidence at all, and now have no evidence file.
- The `<kebab>.evidence.ts` split is deliberate: the registry imports the island file, so keeping
  evidence in a sibling keeps test data out of the application's production bundle **by construction**
  rather than by trusting tree-shaking.

**Four layout assumptions the flatten flushed out** (each would have failed silently or misleadingly)
1. `islandComponentPath` resolved relative imports against `<islandsDir>/<kebab>/` — the flat file's
   own directory is `<islandsDir>`, so component resolution broke.
2. The `registered` check matched the specifier `./<kebab>/element.js` only.
3. The `no-island-import` rule matched a path SHAPE (`../<something>/`), which under the folder layout
   happened to mean "sibling island". Under the flat layout `../ui/...` is the ui directory — exactly
   what a mount point SHOULD import — and it was flagged as a violation. Now resolved against the
   actual island list.
4. Migrating the files moved them up one directory without rewriting their relative imports.

**Closed after the phases** — the scaffolder and the docs, which were still teaching the superseded
model:
- `motu island create` now writes ONE flat `<kebab>.island.ts`, omits `legacy` under a modern host,
  regenerates the registry instead of AST-editing it, and **scaffolds no evidence file**. An empty
  `fixtures.mock.ts` full of TODOs looks like coverage and invites a hand-written response shape —
  six sat empty in peps for months. Its `input` hint now says defaults belong in the COMPONENT.
- README: the island layout, the CLI surface, verify's config layer, the archipelago definition
  (page unit, scattered, coupling derived), the defaults rule, the ambient rule, and two new
  sections — *Scope: the lagoon has no backend* (D11) and *What motu is for in a healthy project*.
- Both agent skills (`island-create`, `island-extract`) — these are executable documentation, so a
  stale one actively rebuilds the old shape.

**Still open**
- Productise the migration as `motu migrate islands` (peps was migrated by a one-off script). The
  ocean deliberately stays on the folder layout, so nothing is blocked on it.
- **Authored island** (motu owns the component, e.g. `SectorPicker`) — declaration is a sibling
  export in the island's own `.tsx`. Genuinely inline, one file.
- **Wrapped island with evidence** (the app owns the component *and* the island owns fixtures or
  ambient) — a standalone declaration file importing the app's component. The app's component stays
  free of motu imports and types.

The default-migration is a distinct, reviewable step: `motu island defaults --explain` lists each
declared default, classifies it honest-vs-fiction, and proposes the component edit or the seed.

**Changes**
- New layout: `src/islands/<kebab>.island.ts(x)` — a flat file, not a folder. It carries the tag,
  the component reference, `input` / `output`, and its evidence.
- `ELEMENT_REGISTRY` becomes an `import.meta.glob` over `src/islands/*.island.*` — the same mechanism
  `roots/lagoon/src/fixtures.ts` already uses. `src/islands/registry.ts` is deleted; adding an island
  stops being an edit to a shared file, which also removes the AST-editing path in
  `packages/cli/src/commands/create.mjs`.
- `index.ts` (8 files) deleted. `fixtures.mock.ts` folded in (see Phase 4).
- `motu island create` scaffolds **one file**. It must scaffold **no empty evidence** — see Phase 4.
- Migration: `motu migrate islands` rewrites the folder layout in place, so peps and the ocean move
  in one command each.
- `src/ui/` keeps its meaning under `host: angularjs` (the liftable survivor). Under `host: next` the
  exit has already happened; `ui-layering` stays as a rule but `motu init --host next` stops creating
  the directory.

**Done when:** peps has **at most 2** island files and no `islands/registry.ts`;
`motu island verify <name>` resolves an island by name whether or not it has a file; no fictional
default survives in any component (`phone` is a seed); the ocean is migrated by the same command and
its verify output is unchanged.

---

## Phase 4 — The page is the seed (Model B); evidence by recording

> **STATUS: mechanism COMPLETE and under test; the production-page mount remains.** The framework
> half — `Store.has()`, `Island` children, output pass-through, and D8's region contract type — is
> landed, and `packages/cli/test/model-b.test.tsx` asserts all six behaviours. What is NOT done is
> mounting the six `actions` islands on the real `app/dashboard/actions/page.tsx`, and
> `motu removal-check`.

**Landed**
- **`Store.has()`** — and the bug the plan predicted was real: `set(key, undefined)` on a never-set key
  returned early through the `Object.is` guard, so the key was **never created** and `has()` stayed
  false. The presence test in `set` is load-bearing, not defensive.
- **`Island` accepts the page's own element as children** — `<Island slot="x"><Panel a={a} /></Island>`.
  Deleting the `<Archipelago>`/`<Island>` wrappers leaves the page's own JSX rendering exactly as
  before, which is what makes C2 mechanical.
- **Publish on CHANGE, not on render.** Re-publishing an unchanged prop every render would clobber a
  sibling's write to the same key the moment anything re-rendered. This is the read-mirror discipline
  in code: while the page keeps passing a value, the page owns it.
- **Output pass-through** — the page's own handler still fires, then the archipelago's. motu OBSERVES
  the output rather than taking it over; taking it over would mean deleting the wrapper silently drops
  wiring the page already had.
- **D8's region contract type** — `ArchipelagoConfig<TRegion>`, `bind` values typed `keyof TRegion`,
  plus `AnyArchipelagoConfig` for registries and resolvers that only route (the erasure is confined to
  those positions). `ActionsRegion` and `DirectoryRegion` extracted into peps' OWN app tree, imported
  type-only.
- **`region-type` verify rule** — required under a modern host, `skip` on an ocean (where region state
  is `$scope`'s and there is no app-side type to reference).

**Proven, not asserted**
- The six Model B behaviours, including *"explicit `undefined` is honoured, not ignored"* — the
  assertion that would fail if `has()` were replaced by a value test.
- **The region type catches the exact historical drift.** Renaming the bind key back to the page's
  `loadingReceived` fails `tsc` with `Type '"loadingReceived"' is not assignable to ...`. That
  divergence is the one this document opened with; it is now a build error.
- Ocean reports differ from baseline **only by the added `region-type: skip` line** — no rule flipped.

**Two gaps the lagoon itself surfaced (found by LOOKING at it, not by reading code)**

1. **`layout` was dead config under `mount: "react"`.** It is consumed only by
   `core/archipelago-element.ts` — the custom-element path. A React-host project could declare a
   region layout and nothing would read it: peps' lagoon rendered six islands in a flat column while
   the real page renders a left column plus a sticky right rail. That is a preview of a page the
   project does not ship, and it is exactly the D5 smell (a field nothing reads) hiding in the
   framework rather than in a project.

   Fixed with the meaning that works in both paths and matches Model B:

   > **`layout` is the region's arrangement, used when no host page supplies one.**

   An ocean never supplies one, so it always applies. A React page supplies its own children, so there
   it is the fallback — which is precisely the lagoon's situation, since the lagoon has no page.
   `renderArchipelagoLayout` (`@motu/react`) parses the template and substitutes each
   `<motu-island slot="…">` with the React `<Island>`; it returns null with no DOM to parse against, so
   a server render falls back to declared order.

   peps' `actions` layout now mirrors `app/dashboard/actions/page.tsx`, verified by geometry rather
   than by eye: at 1400px the five left-column islands measure 992px wide at x=0 and `received-actions`
   sits at x=1016 w=384 (`lg:w-96`); at 600px it collapses to one column, the rail drops to the bottom,
   and `ambassador-card` is hidden — the page's own `hidden lg:block`, expressed as region `props` so
   the component stays general.

2. **The FOCUSED lagoon did not apply region seeds — FIXED.** `bootstrapLagoon` took no `overrides`,
   so `roots/lagoon/src/lagoon.ts`'s `seed` reached the gallery entry only. In the focused view — the
   one `motu island verify` and `motu archipelago verify` drive — `received-actions` rendered its empty
   state while the gallery showed the seeded three interactions. Every runtime check was therefore
   asserting against defaults plus `scenarios`, never against the state the region is actually fed:
   "renders in the lagoon" was a weaker claim than it reads.

   The fix has two halves, and the second is the one that would have been missed:

   a. `bootstrapLagoon` takes `overrides` + `archipelagos` and resolves the region from the target —
      an `archipelago:` target names it; an `island:` target resolves to the region that DECLARES that
      tag (exactly one, or nothing rather than a guess).
   b. **The seed must be TRANSLATED for an island target.** A lone island mounts through a synthesised
      config whose binds are SAME-NAMED (prop `missions` -> key `missions`) — that is what lets an
      island with no region be driven at all, and what every evidence file's `scenarios` are written
      against. The region's binds are not same-named (`missions` comes from `receivedMissions`), so
      handing the region seed over untranslated puts keys in the store that nothing reads: the island
      renders empty while the region view shows data. `translateRegionSeed` maps through the region's
      bind rather than changing the synthesised binds, so the four islands with `scenarios` keep
      passing their data-flow check — verified, all four still green.

   Also fixed while republishing: `lagoon publish`/`serve` read the artifact from
   `roots/lagoon/dist`, but Vite resolves `outDir` against ROOT, which is now `.motu/cache/lagoon`.
   The build silently landed the artifact in the cache. `outDir` is now pinned absolutely — where the
   build INPUT lives is a framework detail, where the OUTPUT lands is the project's.

**D9 — The region's ARRANGEMENT is the app's too, not just its vocabulary.**

D8 removed the duplicated *key* vocabulary. The `layout` template was the same mistake one level up:
peps' archipelago hand-copied the two-column arrangement out of `app/dashboard/actions/page.tsx`, so
changing the page's grid would leave the lagoon previewing the old one with nothing to catch it.

Under a React host the arrangement is now an app-owned component — `actions-layout.tsx`, no motu
import, takes rendered nodes and places them. **The page fills its slots with live panels; the lagoon
fills the same component with islands.** One arrangement, two fillings. The archipelago's `layout`
template stays the right answer for an ocean, whose legacy page cannot hand React anything.

Every condition stays in the PAGE, with the state that decides it — the layout is structure only. That
is also why the alternative (having motu extract the arrangement from `page.tsx` by AST) was declined:
every island there sits inside a runtime conditional (`{!isLoading && activityNotice &&
missions.length > 0 && …}`), and an extractor must decide what those mean in a lagoon that has no
`isLoading`. Whichever way it guesses, it guesses silently — the scaffolded-empty-fixture failure mode
again.

Preference order when rendering a region: **app layout component → archipelago `layout` template →
declared order.**

*Caught while doing it:* removing the duplicated template silently disabled `archipelago verify`'s
whole-region render — `hasLayout` only looked for `layout:` in the config, so the region that now had
a BETTER arrangement was treated as having none, and the check that catches slot/config drift was
downgraded to a warning. It now recognises both sources.

**Still open — re-pointed by D11.** Mounting islands on the real page is no longer about coupling
(D10 moved that to feature archipelagos). It is now about proving **C2**: that motu's presence in a
page is removable, and that D8's remaining gap closes. The type binds *motu → app*; nothing yet binds
*app → type*, so the page must consume its region type structurally (`satisfies` on what it passes)
or the type is a fiction motu is checked against and the app is not.

- ~~Mount the islands on the real page~~ — **DONE.** All seven `actions` islands are mounted on
  `app/dashboard/actions/page.tsx` through `<Island slot="…">`, wrapping the page's OWN JSX, and the
  page's shared state is declared once as an object literal `satisfies ActionsRegion`.

  **D8's gap is closed, and proven both ways.** Renaming `receivedLoading` in the app's type now fails
  in TWO places: `page.tsx` (app→type) and `actions.archipelago.ts` (motu→type). One rename, two
  errors — which is what the type was for.

  **C2 holds on a production page:** `motu removal-check` deletes `components/motu/actions-region.tsx`
  (100% motu), unwraps `page.tsx`, and the host typechecks. motu's entire footprint in the application
  is now ONE deletable file plus wrappers in one page.

  **Three framework fixes this forced, none of which reading would have found:**
  1. `ArchipelagoProps.config` / `ArchipelagoProviderProps.config` had to take the ERASED
     `AnyArchipelagoConfig`: mounting only routes a region, so requiring the declared shape made every
     composition root fail to compile.
  2. **Two React major versions.** peps has `@types/react` 19, motu's checkout had 18, and `ReactNode`
     gained `bigint` in 19 — so passing children into a motu component failed to typecheck for a
     reason unrelated to the code. `paths` overrides did not win; aligning motu's dev-only types to 19
     did. motu's runtime peer stays `>=18`.
  3. `createElement(Context.Provider, …)` infers a type React 19 rejects in a child position. Writing
     it as JSX fixed the type and **broke the runtime** — this file is transformed by whatever the
     consumer uses, and a loader that misses the workspace's `jsx: react-jsx` emits a classic
     transform needing `React` in scope (`ReferenceError: React is not defined`, at render, caught only
     because the Model B test exists). Annotating the return type keeps the call plain and satisfies
     both.

  The `/dev/motu` page is deleted: it existed to mount an archipelago in the real app shell, which the
  real page now does.
- ~~`motu removal-check`~~ — **DONE and passing.** Deletes files that are 100% motu, unwraps
  `<Archipelago>`/`<Island>` elsewhere, runs the HOST's own typecheck, and restores everything in a
  `finally` (the check must never be able to leave a repo half-stripped, including when the typecheck
  throws).

  Two things the first version got wrong, both found by running it rather than reasoning about it:
  1. **An import can reach motu without a motu specifier.** peps' composition root imports
     `@/motu/src/services` — an app-alias path into the motu project directory. Anything importing
     from that directory is motu's.
  2. **"100% motu" is TRANSITIVE.** The dev page's only import is that composition root and carries no
     motu specifier at all, so deleting the root stranded it. The classifier now runs to a fixpoint.

  It also partitions the framework's **generated** route types (`.next/types/**`) from real errors:
  deleting a route leaves those dangling until the next build, and that is not evidence motu is
  load-bearing. They are counted and reported rather than dropped — a check that silently discards
  errors is how a green result stops meaning anything.

  Current result on peps: **PASS**, deleting `components/motu/actions-archipelago.tsx` and
  `app/dev/motu/page.tsx`, with 3 generated-artifact errors ignored and named.
- Stop scaffolding empty fixture files; evidence appears only from a recording.


**The inversion.** `bind` stops meaning "this prop comes from the store" and starts meaning **"this
prop may *also* be driven by the region store"**. motu becomes an observer and override layer over
props the page already passes, instead of a replacement data path. This is what makes C2 hold, and it
is also where the seam lens gets its view — every prop crossing the boundary flows through
`Archipelago` without the page giving up ownership of its own state.

**Why it is obviously right here:** `app/dashboard/actions/page.tsx` **already implements the
archipelago's declared coupling by hand.**

```tsx
// page.tsx:99    const [newReceivedCount, setNewReceivedCount] = useState(0)
// page.tsx:523   <ReceivedActionsPanel … onNewCount={setNewReceivedCount} />
// page.tsx:430   <WeekHeader … newReceivedCount={newReceivedCount} />      ← a sibling reads it
```

against `actions.archipelago.ts`:

```ts
on: { 'new-count': (detail, { store }) => store.set('newReceivedCount', detail) }
```

Same value, same producer, same consumer, expressed twice.

### Model A (today) vs Model B (target)

```tsx
// A — store as source. Props arrive only via bind; the store must be filled by channels or a seed.
<Archipelago config={actionsArchipelago} elements={ELEMENT_REGISTRY} host={host} />
// Delete motu → the region renders nothing. The page's useState / fetches / :324 computation
// go dead or duplicated. C2 FAILS.

// B — page seeds, store augments. The page's JSX is untouched, just wrapped.
<Archipelago config={actionsArchipelago} host={host}>
  <ActivityNotice kind={activityNotice} />                              {/* :448 unchanged */}
  <NetworkStatsBanner stats={networkStats}
                      profilsWaiting={applicableMissions.length} />     {/* :457 unchanged */}
  <ReceivedActionsPanel missions={receivedMissions}
                        isLoading={loadingReceived}
                        onNewCount={setNewReceivedCount} />             {/* :521 unchanged */}
</Archipelago>
// Delete the wrapper + its import → byte-identical page behaviour. C2 HOLDS mechanically.
```

`Archipelago`'s job under B, per slot:

```
publish the child's incoming props into the store under the archipelago's bind keys   ← the page IS the seed
if a bound key has been EXPLICITLY set in the store, that value overrides the passed prop
intercept declared outputs: onNewCount still calls the page's setter AND fires 'new-count'
```

### The unifying statement

> **Whoever hosts the region seeds it.** A React page seeds from its own props. The lagoon seeds from
> `seed`. An ocean seeds through channels — because there is no page to do it.

Not a fork: same `Store`, same `bind`, posture-dependent provenance. It also revises the earlier
"seeds are region state" — **seeds only exist where there is no page.**

**Changes**
- `packages/adapters/next/src/archipelago.tsx`: children-with-slots becomes the primary path
  (`ArchipelagoProps.children` and `Island` already exist — this promotes them from an option to the
  default). Props flowing through a slot are published to the store; bound keys are override points.
- `packages/core/src/store.ts`: **one precedence rule, framework-wide** — store wins when a key is
  bound *and has been explicitly set*. This requires distinguishing *never set* from *set to
  `undefined`*, which must be a property of `Store` itself, never a per-binding decision. Named here
  because it is the likeliest subtle bug in the whole plan.
- Lagoon seeds stay in `roots/lagoon/src/lagoon.ts` (there is no page there); island `scenarios`
  become **deltas over the region seed**, not full copies, killing the current duplication with
  `seed.actions.*`.
- The differentiation check (`verify.mjs:457+`) applies deltas to the region seed. Contract unchanged:
  two or more scenarios, distinct output, opt-out-by-absence.
- **Stop scaffolding empty fixture files.** Six of peps' eight are `fixtures: []` with
  `TODO(motu:fixtures)`; an empty scaffolded mock invites a hand-written lie and is the single thing
  that most makes the repo read as Storybook. A fixture block appears only when `motu fixtures record`
  produced it, and carries a recorded-at marker.

### Migration discipline: the store starts as a read-mirror

Under B a value can briefly exist twice (the page's `newReceivedCount` state and the store's mirror).
That is acceptable **only with a stated direction**, or they drift:

> During migration the store is a **read-mirror**: the page owns the value, siblings read the mirror.
> A key becomes **store-owned** only when the page stops holding it — a deliberate, reviewable step.

This is incremental migration applied to *state* rather than to components — motu's own thesis, one
level down. Adopting motu on `actions/page.tsx` is therefore not a rewrite: **wrap, verify nothing
changed, then move keys one at a time.**

**Cost, stated plainly:** recording needs a real session once per island. Once, not per run.

**Done when** (restated after D10/D11 — this phase is about C2 and D8's open half, not coupling):
`received-actions`' two islands are mounted on the real `app/dashboard/actions/page.tsx` through
`<Island>`, with its JSX unchanged apart from the wrappers; the page `satisfies` its region type, so
the binding runs app→type as well as motu→app; `motu removal-check` (C2) passes on that page; no island
file carries a hand-written `fixtures` array except the one that genuinely replays contract calls; the
data-flow check still passes for all four islands that declare scenarios.

---

## Phase 5 — Ambient as a declared third leg

> **STATUS: COMPLETE, with one goal declined on principle** (see below).

**Landed.** `contract.ambient` is the third leg beside input and output: the host capabilities an island
reaches for without being handed them — a React context, a session hook, a feature gate, a service
module it imports directly.

**It is DERIVED, not asked for twice.** The lagoon's `alias` table already lists exactly the modules a
project has had to stand down, so an island importing one of them requires it. Verify reconciles the
derived list against the declared one and reports both directions — undeclared reach, and declared
ambient that is not used. peps: three islands declare four, four and two capabilities; six declare
none, which is now a stated fact rather than an absence.

Before this, ambient hid in `lagoon.config.json`'s alias table, where standing a module down looks like
build configuration rather than a declared dependency — and it is the coupling most likely to make an
island unmountable somewhere else.

**Declined: retiring the service stubs by widening the contract.** The original plan said an island
reaching a service outside the contract should fail, with the remedy being one line in
`services/index.ts`. That cannot work here, and the reason is a constraint we set ourselves: those are
the APP's own components (`AmbassadorProgressCard`, `ChallengesPanel`, `RevenueThanksPanel`), and
routing them through `contract` would put a motu import inside them — violating constraint 4 and C2.

So the contract seam applies to components motu owns (`src/ui/`); an app-owned component legitimately
calls the app's own services. The stubs stay — but they are no longer hidden: what they stand in for is
declared on the island and carried in the contract snapshot.


The remaining `host-stubs/` (`member-context`, `clock-context`, `use-feature-gate`) are not data —
they are ambient host capability, and today they hide in an `alias` table in `lagoon.config.json`.
`member-context.tsx` carries a 10-line comment about returning a stable object identity or the page
freezes: a **framework** lesson being re-learned per project.

**Changes**
- Islands declare **ambient** alongside input and output: `requires: ['member', 'clock', 'featureGate']`.
  The lagoon provides them from a declared seed, with **framework-guaranteed stable identity** — the
  freeze bug becomes structurally impossible rather than commented against.
- Verify **fails** an island whose component reaches a service module outside the contract. Today
  `AmbassadorProgressCard` imports `@/lib/services/ambassador` directly, and the only way to stand it
  down was a 37-line alias stub that hand-reimplements the return shape. The remedy must be **one line
  in `services/index.ts`**, not a stub module. This deletes all three `host-stubs/services-*.ts`
  (106 lines) and makes the boundary stronger.
- `lagoon.config.json`'s `alias` key survives as a genuine escape hatch, but nothing in the scaffold
  or the docs should route you to it.

**Done when:** `roots/lagoon/src/host-stubs/` is empty; the three self-fetching islands read through
`contract`; ambient requirements are visible in the seam lens next to input and output.

---

## Phase 6 — Contract snapshot

> **STATUS: COMPLETE.** `motu contract check [--update]` — the boundary as one committed artifact.

**What it holds:** the callable surface, every island's input / output / ambient, every archipelago's
members and shared state, and the **derived coupling graph** — who feeds whom, computed from what is
already declared rather than restated. On peps: 2 callable methods, 9 islands, 1 coupling edge
(`newReceivedCount`: `received-actions` → `received-summary`).

**Proven:** adding a method to `services/index.ts` without acknowledging it fails `check`; `--update`
records it. Same contract a lockfile offers, for architecture instead of dependencies — widening the
callable surface, adding an input, or coupling two islands that were independent all stop being things
you have to notice in review.

Comments are blanked before analysis, for the third time in this document: scaffolded wiring examples
are comments, and reading them as real coupling has already produced one false green here.


Most of `contract.input` restates what TypeScript already knows, and `verify.mjs:251+` already
cross-checks it against `<Pascal>Props`. So stop hand-writing it.

**Changes**
- Generate the boundary (per island: input names/types/defaults, output events, ambient) into a
  committed snapshot file — one per archipelago, or one per project.
- `motu contract check` fails when the boundary moves without the snapshot being updated;
  `--update` writes it.
- Only *exceptions* stay hand-written: defaults, `required`, event-name mapping.

This keeps everything wanted from "clear input/output contracts" — an explicit, reviewable, diffable
artifact where a widened boundary shows up in a PR — with **zero hand-written declaration**.

**Elevated by D11 — this is now the headline deliverable for a healthy project.** The snapshot is the
reviewable architecture artifact: the app's entire boundary in one committed file, so widening it shows
up in a PR diff instead of inside a component.

It should also carry the **derived coupling graph** — which islands share which keys, computed from
what is already declared rather than restated. STORE coupling only: backend coupling is out of scope
(D11), so no resource tags, no dependency inference through the contract.

**Done when:** an island file declares only component + exceptions + evidence; widening a component's
props without updating the snapshot fails CI; the snapshot shows the coupling graph.

---

## Expected end state for peps

From 56 files / ~1,260 lines to roughly:

```
motu.config.json                    posture: host next, isolation light, mount react
motu/lagoon.config.json             chrome, env, ambient seed
motu/src/services/index.ts          the callable surface (widened, no stubs behind it)
motu/src/archipelagos/*.ts          one per PAGE — islands scattered, coupling derived
motu/src/islands/*.island.ts(x)     one per island; evidence in a sibling .evidence.ts
motu/src/contract.snapshot.json     generated, committed, reviewed — the boundary + coupling graph
app/**/                             the app owns its layouts and its region types
```

Reached today: **two page archipelagos** — `actions` (7 islands, sharing `newReceivedCount`) and
`directory` (2 islands, independent) — layout and region types in the app, and `roots/lagoon/` down to
project-owned files with zero dependencies.

The thing a reviewer opens is the archipelago: the region, its store, what each panel takes and
emits. That is the artifact Storybook has no equivalent of — no page region, no declared shared store,
no callable-surface boundary, no machine-checked "renders from defaults / survives a 500 / identical
on remount / distinct seeds produce distinct output".

## Explicitly not doing

- **Any backend in the lagoon** (D11): no stateful fakes, no in-memory Supabase, no pglite, no resource
  tags, no dependency inference through the contract. Cross-page coupling is integration-test work
  against a real local stack with auth bypassed — cheaper and more honest than simulating it.

- **Not** running the lagoon as a Next dev route. It would delete the second toolchain, but the
  lagoon's whole value is that a failure has exactly one cause; pulling the host back in gives that
  away for a saving Phase 1 already gets.
- **Not** folding island declarations into the archipelago (D1).
- **Not** putting motu imports in the app's own components (constraint 4). Pages mounting an
  `Archipelago` are fine; components are not.
- **Not** making the lagoon live-local by default (D6).
- **Not** per-island posture opt-in (D4).

## Regression discipline

The ocean is the reference host and has no second implementation to fall back on. Every phase lands
with: `motu island verify` + `motu archipelago verify` run over **both** projects, the ocean's
`--json` report diffed against a baseline captured before the phase started, plus the two constraint
gates — **C1's explode round-trip** and **C2's removal-check** — green on both projects. A rule that becomes
`skipped` under `host: next` must stay `ok` under `host: angularjs`, and the diff is how that is
proven rather than assumed.
