# Checks and verification

Every claim motu makes about a project is a named check with an id, a severity and a verdict. This page is the catalogue: what each check id proves, which severities it can emit, which command runs it, and whether it reads source or drives a browser. It also documents the three exit codes, the three cost tiers, what `--changed` / `--fast` / `--runtime` / `--audit` do and do not see, and every documented way to downgrade or excuse a check.

Related: [concepts](01-concepts.md) · [CLI reference](03-cli-reference.md) · [configuration](04-configuration.md) · [archipelagos and regions](05-archipelagos-and-regions.md) · [lagoon](08-lagoon.md) · [coverage](09-coverage.md) · [evidence and testing](10-evidence-and-testing.md) · [contract and backend](11-contract-and-backend.md) · [hosts and adapters](12-hosts-and-adapters.md).

---

## 1. The report model

A finding is an object, not a line of prose. `makeReport()` (`packages/cli/src/commands/verify.mjs:92`) exposes five constructors, each taking the **check id as its first argument**:

| Constructor | Level | Meaning | Fails the run? |
|---|---|---|---|
| `report.error(check, msg, line)` | `error` | A declaration was **contradicted**. Repair it. | Yes |
| `report.warn(check, msg, line)` | `warn` | A rule the project has not adopted yet, or a design choice worth naming. | **No** |
| `report.ok(check, msg, seen)` | `ok` | The claim **held**, over `seen` things examined. | No |
| `report.skip(check, msg)` | `skip` | The rule does not apply to this project's posture, with the reason stated. | No |
| `report.inconclusive(check, msg)` | `inconclusive` | The check **could not run** — environment, not code. | No, but exit 2 |

Two invariants live in the constructors themselves, not at the call sites:

- **`report.ok(check, msg, 0)` becomes a `skip`** (`verify.mjs:104-113`). A check that examined nothing cannot have held. This is why many `ok` calls pass `{ n, of }` or an array — the printed line carries `· 12 slot(s) asserted` (`verify.mjs:1911-1913`), so a wall of green can be told apart from a wall of nothing.
- **`skip` is deliberately not `ok`** (`verify.mjs:127-132`). A rule silently reported as passing is indistinguishable from a rule that ran.

`inconclusive` is decided by `environmentalCause(err)` (`verify.mjs:919-931`), which requires **both** a known environmental signature (`did not open port … in time`, `Executable doesn't exist`, `EADDRINUSE`, `ECONNREFUSED`, `browserType.launch`, …) **and** the absence of any application cause in the output. A port that never opened *because the project does not build* is a finding, not an environment.

`motu integrate check` uses a narrower vocabulary — `add(level, check, msg)` at `packages/cli/src/commands/integration.mjs:131`, with levels `error | warn | ok | skip` and no `inconclusive` and no `seen`-count guard.

---

## 2. Severity semantics — what actually fails a run

**Warnings do not fail anything. Plan around this.**

| Gate | Source | Condition |
|---|---|---|
| `motu island verify <name>` | `verify.mjs:1072` → `verifyExitCode` (`verify.mjs:1173`) | `errors.length` → 1; else any `inconclusive` → 2; else 0 |
| `motu island verify --all` | `verify.mjs:1063` | `results.every(r => r.errors.length === 0) ? 0 : 1` |
| `motu archipelago verify <id>` | `verify.mjs:2621` → `verifyExitCode` | same three-way |
| `motu archipelago verify --all` | `verify.mjs:2612` | `results.every(r => r.errors.length === 0) ? 0 : 1` |
| `motu integrate check` | `integration.mjs:830` (json), `:852` (human) | any finding at `level === 'error'` → 1 |
| `motu check` | `check.mjs:137`, exits at `:155` / `:268` | `structureOk && integrationOk && (removal?.pass ?? false)` |
| `motu removal-check` | `removal-check.mjs:669` | `summary.pass ? 0 : 1` |
| `motu contract check` | `contract.mjs:156`, `:169` | snapshot missing, or snapshot differs → 1 |
| `motu region coverage <id>` | `region-coverage.mjs:507`, `:557`, `:563` | uncovered states at or above `--fail-above` → 1 |

Two consequences worth stating flatly:

1. **The `--all` sweep loses exit 2.** `verify.mjs:1063` and `:2612` gate on `errors.length === 0` only, so a sweep in which every runtime check was inconclusive (no Chromium, say) exits **0**. Only the single-target form routes through `verifyExitCode`. If you are gating an unattended loop, verify one island or one region at a time, or read `--json`.
2. **`motu check`'s aggregation drops severity nuance further** (`check.mjs:126-134`): integration warnings never block, `strict-boundaries` is audited and never enforced (`check.mjs:160-175`), and `removal` is `null` — hence falsy — when the structure checks already failed.

---

## 3. The three exit codes

    0  the declarations hold
    1  something contradicted them        -> repair
    2  a check could not run              -> retry, do NOT repair

Documented at `.github/host-rules.md` "Three outcomes, three exit codes"; implemented at `verify.mjs:1173-1176`.

**Why 2 is distinct from 1.** A human shrugs at a port timeout and re-runs. An agent reads `✗` and repairs a bug that does not exist — and several agents produce several confident wrong repairs. `verify.mjs:120-127` records this as the reason `inconclusive` exists at all. The verdict line prints `INCONCLUSIVE  N check(s) could not run … — retry, do not repair` (`verify.mjs:1914-1919`), not `PASS` and not `FAIL`.

Exit 2 is also the code for **"this run proves nothing"**, which is a different failure from "this run found nothing":

| Exit 2 site | Condition |
|---|---|
| `verify.mjs:1049`, `:2596` | usage error — no target and no `--all` |
| `check.mjs:115` | `--changed` narrowed to zero islands and zero regions → `NOTHING TO CHECK` |
| `integration.mjs:816` | `hostSources` scanned **0 files** → `host-sources`; nothing was examined, so nothing is proved. Fires inside `motu check` too, before it prints anything |
| `integration.mjs:825` | no archipelago to check |
| `region-coverage.mjs:163`, `:182`, `:232` | no region id, no readable flows, or no corpus and no `coverage.corpusUrl` |
| `run.mjs:294`, `cli.mjs:45`, `:61` | unknown verb / bad invocation |

---

## 4. Check catalogue

Severities listed are the ones the code can actually emit for that id. Any `ok` that carries a `seen` count can additionally degrade to `skip` when it examined zero things (§1) — not repeated per row.

`Run by` abbreviations: **IV** = `motu island verify`, **AV** = `motu archipelago verify`, **IC** = `motu integrate check`, **C** = `motu check` (runs IV + AV + IC + removal-check).

### 4.1 Island checks — static (AST over the ui component)

Run on every `motu island verify` / `motu check`, no flags needed. Source: `staticChecks` (`verify.mjs:143`).

| Check id | Proves | Severities | Run by | Line |
|---|---|---|---|---|
| `component` | The island has a component at all; nothing else can run without it. | error | IV, C | `verify.mjs:1094` |
| `adapter-island` | This is an AngularJS island (a `*.ng.ts`, no React component), so the React-only checks are legitimately not run. | ok | IV, C | `verify.mjs:1104` |
| `no-bare-fetch` | No `fetch()` call and no `XMLHttpRequest` — all I/O crosses the contract seam, so the lagoon can stand in for the backend. | ok, error | IV, C | `verify.mjs:155`, `:160`, `:185` |
| `no-history` | No `history.pushState/replaceState`, no `history`, no `location.*` (except `.origin`) — the ocean owns the URL; navigation is a host intent. | ok, error | IV, C | `verify.mjs:169`–`:177`, `:186` |
| `no-doc-reachout` | No `document.querySelector/querySelectorAll/getElementById/getElementsByClassName` — an island never reaches into the host DOM. | ok, error | IV, C | `verify.mjs:181`, `:187` |
| `contract-only-io` | No `axios`/`ky`/`superagent`/`node-fetch`/`got` import, and no raw `configure`/`HttpTransport`/`MockTransport` from `@motu/runtime`. | ok, error | IV, C | `verify.mjs:196`, `:202`, `:208` |
| `ui-layering` | A `ui/` component imports neither `islands/` nor `archipelagos/` — it stays liftable, and islands cannot couple through it. `ui`→`ui` is fine. | ok, error | IV, C | `verify.mjs:218`, `:222` |
| `contract-calls` | Every `service.method()` the component invokes exists in the generated `@motu/contract` — catches invented endpoints and names stale after a backend change. Silent when the component imports no contract service. | ok, error | IV, C | `verify.mjs:245`, `:249` |
| `default-props` | The component renders from default props alone — statically, only the clearly-bad case (a required, non-destructured, undefaulted props param). The runtime mount is authoritative. Warns when the function cannot be found. | ok, warn, error | IV, C | `verify.mjs:260`, `:265`, `:267` |

### 4.2 Island checks — config (AST over the island file + the registry)

Source: `configChecks` (`verify.mjs:303`).

| Check id | Proves | Severities | Run by | Line |
|---|---|---|---|---|
| `registered` | `element.ts` exists, declares an island (long or short form), and is wired into `ELEMENT_REGISTRY`. Warns when it mounts an identifier it does not import. | ok, warn, error | IV, C | `verify.mjs:306`, `:346`, `:355`, `:368`, `:370` |
| `no-island-import` | The mount point imports no **sibling island** — mount points coordinate only at runtime, through the store. Resolved against the real island list, not a path shape. | ok, error | IV, C | `verify.mjs:326`, `:330` |
| `legacy-strategy` | Posture first: where the host **has** a legacy skin (`LEGACY_FIT`), the element row declares a `legacy` fit strategy. Where it does not, the rule is *skipped*, and declaring `legacy` anyway is a warning. | ok, warn, error, skip | IV, C | `verify.mjs:395`, `:400`, `:403`, `:405` |
| `props-match` | The registry and the component do not drift: a registered prop the component does not accept is dead config (error); a callback not mapped to an event has its output dropped (warn); an unregistered prop can never be set (warn). Warns when props are typed inline and there is nothing to compare. | ok, warn, error | IV, C | `verify.mjs:421`, `:430`, `:433`, `:436`, `:441` |
| `ambient` | The host capabilities the component reaches for without being handed them — derived from the lagoon's `alias` keys, over **runtime** imports only — match `contract.ambient`. Flags both missing and stale declarations. | ok, warn | IV, C | `verify.mjs:487`, `:490`, `:493` |
| `archipelago` | The island is a member of an archipelago, or has declared `standalone: true`. Not being in one is a warning, not a failure — most islands couple with nothing. | ok, warn | IV, C | `verify.mjs:506`, `:508`, `:510` |

### 4.3 Island checks — CSS

`cssChecks` (`verify.mjs:570`). Runs over the island's **own** `.css` if it owns one (opt-in, `verify.mjs:615`), and over the shared stylesheet at region scope.

| Check id | Proves | Severities | Run by | Line |
|---|---|---|---|---|
| `css-host-form` | Every `:host` is functional (`:host(...)`) or wrapped in `:where(:host, .motu-root)`, so the rule also applies in **light** isolation — a bare `:host` is inert in light DOM. | ok, error | IV, AV, C | `verify.mjs:587`, `:610` |
| `css-tokens` | Colours come from `--x-*` / `--_*` tokens rather than raw hex literals (`#fff`/`#000` exempt). | ok, warn | IV, AV, C | `verify.mjs:605`, `:611` |

### 4.4 Island checks — adapter-contributed

The CLI parses; the adapter judges. Discovery is by the adapter the island imports, falling back to the configured host (`verify.mjs:1022-1043`). Findings come back as `{ level, check, msg }` and are replayed through the same report (`verify.mjs:1038`).

| Check id | Proves | Severities | Adapter | Line |
|---|---|---|---|---|
| `adapter-verify` | Meta: the adapter's verify contribution could be loaded and run at all. | warn | core | `verify.mjs:1041` |
| `host-coupling` | An AngularJS island that reaches host scope (`inheritScope` / `hostScopeKey`) declares the host-scope names it depends on in `contract.coupling.hostScope`. `adopt` relocates a live node and needs no manifest. Also flags an unused declaration and a `hostScopeKey` missing from the list. | ok, warn, error | angularjs | `packages/adapters/angularjs/verify.mjs:29`, `:41`, `:48`, `:57`, `:65` |
| `host-scope-stub` | Honest limit, stated as a standing warning whenever a host-scope contract is declared: verify cannot reach the real embedded host, so the lagoon stub must supply those keys and an integration check is still owed. | warn | angularjs | `packages/adapters/angularjs/verify.mjs:73` |
| `rsc-boundary` | A Next island imports no server-only module (`server-only`, `next/headers`, `next/server`, `next/cache`, `next/og`) and contains no `'use server'` action — either makes it unmountable in the lagoon, which has no Next runtime. Type-only imports are erased first and never flagged. | ok, warn, error | next | `packages/adapters/next/verify.mjs:56`, `:63`, `:88`, `:94` |
| `use-client` | The component declares `'use client'`. An **error** once it actually uses hooks (the exit path — importing the component directly — breaks mechanically); a **warning** otherwise, because a pure projection is safe either way. | ok, warn, error | next | `packages/adapters/next/verify.mjs:74`, `:77`, `:82` |
| `next-stubs` | Visibility, not prohibition: the island uses `next/link` / `next/image` / `next/navigation`, which the lagoon renders **inert**. It will pass here and can still be wrong in the host. | warn | next | `packages/adapters/next/verify.mjs:105` |

### 4.5 Island checks — runtime (`--runtime` / `--audit`)

Opt-in. Everything here drives a lagoon: a real browser (Playwright/Chromium) by default, or an in-process happy-dom mount under `--fast`. Gated at `verify.mjs:1121`.

| Check id | Proves | Severities | Engine | Line |
|---|---|---|---|---|
| `lagoon-render` | The island tag upgrades and paints a non-empty shadow DOM, in `native` and (where a legacy skin exists) `legacy` fit. Mounting but rendering nothing from defaults is a **warning** — a pure projection may be right. | ok, warn, error, inconclusive | browser or `--fast` | `verify.mjs:787`–`:800` (fast), `:946`–`:958` (browser) |
| `no-console-errors` | Nothing logged a console error or leaked an unhandled rejection while the island (or region) was mounted. | ok, error | both | `verify.mjs:715`, `:717` |
| `remount-stable` | Re-mounting produces byte-identical output — catches accidental module-level state. Silent when the island never rendered (the mount error already covers it). | ok, error | both | `verify.mjs:721`, `:723` |
| `error-resilient` | The island survives a backend that fails every call (forced 500): it renders, and leaks no unhandled rejection. Not mounting under forced errors is a warning; an unhandled rejection is an error. | ok, warn, error | browser only | `verify.mjs:969`–`:979` |
| `seed-transport` | Every scenario seed crosses into the browser intact. A `Set`, `Map`, `Date` or function arrives as `{}`, which breaks **every** scenario and makes `data-flow` and `responsive` report the wrong cause. Checked before the checks that depend on it. | ok, error | browser only | `verify.mjs:1267`, `:1273` |
| `input-coverage` | Every seeded input is shown in more than one shape: an array prop is seeded empty at least once; a boolean takes both values. Needs no browser and runs under `--fast`. Explicitly does **not** catch per-pair gaps. | ok, warn | neither (reads evidence) | `verify.mjs:1318`, `:1324` |
| `data-flow` | Opt-in at two or more declared `scenarios`: distinct seeds produce **distinct rendered output**, so data flows past the seam rather than merely type-checking. A scenario that rendered nothing is an error with its own message — a blank cannot be compared. Duplicate renders warn. | ok, warn, error, inconclusive | both | `verify.mjs:861`, `:872`, `:878`, `:889`, `:896` |
| `responsive` | The island fits every declared viewport, in every scenario. Horizontal overflow is an **error** (a page the member must pan sideways is broken); rendering nothing at any viewport is a warning. | ok, warn, error | browser, `--audit` only | `verify.mjs:1365`–`:1385` |
| `a11y` | axe finds no violation, per declared scenario, scoped to the island's subtree. The fail bar is `lagoon.config.json` → `a11y.fail`, **default `never`** — so by default every violation is a warning. | ok, warn, error, inconclusive | browser, `--audit` only | `verify.mjs:1223`, `:1229`, `:1238`, `:1239` |
| `audit` | Meta: says out loud that `responsive` and `a11y` were **not** run, because this was not an `--audit` run. | skip | — | `verify.mjs:1153` |

### 4.6 Region checks — static config

`archipelagoConfigChecks` (`verify.mjs:2259`), plus the static region checks called from `runArchipelagoVerify` (`verify.mjs:3092`). All run without a browser, in the fast loop.

| Check id | Proves | Severities | Run by | Line |
|---|---|---|---|---|
| `registered` | The archipelago file exists and is wired into `ARCHIPELAGOS`. | ok, error | AV, C | `verify.mjs:2262`, `:2521`, `:2523` |
| `region-type` | The region's shared vocabulary is a **type extracted from the app** (`archipelago<TRegion, …>()` or `satisfies ArchipelagoConfig<R, …>`), so `bind` keys cannot drift from it and a rename is a compile error. Skipped on an ocean host (region state is motu's). A region with no islands yet warns instead of erroring — the scaffolder's own output must not open red. | ok, warn, error, skip | AV, C | `verify.mjs:2275`, `:2281`, `:2287`, `:2293` |
| `coupling` | Which members actually share state. Reports island-written ∩ island-read; falls back to keys read by more than one island and written by none (**coupled through the host**); otherwise states independence explicitly. Warns on a key written here and read by no island — the coupling **escapes** the archipelago. | ok, warn | AV, C | `verify.mjs:2361`, `:2369`, `:2375`, `:2384` |
| `composition` | Every slot filled by a nested island is a slot this region declares. | ok, error | AV, C | `verify.mjs:2408`, `:2413` |
| `ownership` | Every key an island reads has **exactly one** declared owner. Errors: a key written by two different *elements* (two slots may share a producer, two implementations may not); a key in both `provides` and an island's `writes`. Warns: a key read with no declared owner (adoption is per key); a key written from a handler body rather than declared `writes` — opaque, undrawable, unejectable. | ok, warn, error | AV, C | `verify.mjs:2443`, `:2456`, `:2466`, `:2474`, `:2485` |
| `host-stubs` | The lagoon's stand-ins still stand in: every export the islands reach for is exported by the stub, and every stub specifier resolves. | ok, error | AV, C | `verify.mjs:2500`, `:2502`, `:2511` |
| `planned` | The survey flag is honest. Errors when a `planned: true` island **is** registered — the flag removes itself, or a survey silently becomes a list of things nobody built. Warns to keep the pending ones visible. | warn, error | AV, C | `verify.mjs:2540`, `:2548` |
| `islands-registered` | Every `element:` tag the config references is a registered island tag, excluding `planned` ones. Skips (rather than warning "declares no islands") when every declared island is still planned. | ok, warn, error, skip | AV, C | `verify.mjs:2557` (computed level), `:2564`, `:2569` |
| `channel-source` | Every channel installed for this region was built by the tool — `channelFrom({ to, id, args })`, whose copy into the region comes from the archipelago's `sources`, or the excused `rawChannel('<why>', fn)`. Hand-written channels forget keys, rename them in transit and re-derive what the page already derives. | ok, error | AV, C | `verify.mjs:2692`, `:2701` |
| `sources-tested` | Every application-authored source (the identifier form, `week: weekSource`) is named by some host test file. A flow drives a source through the *screen* and reaches only branches a rendered state tells apart; a threw-vs-answered-null distinction needs a unit test over a hand-made port. | ok, warn | AV, C | `verify.mjs:2737`, `:2763`, `:2766` |
| `render-coverage` | Every declared slot is asserted by some flow's `expectRender`. A slot no flow looks at can be wired to anything and stay green — this is the gap that let a merge make one island render another's data. Warning by design, so pre-existing regions do not go red wholesale. | ok, warn | AV, C | `verify.mjs:1524`, `:1527` |
| `writes-covered` | Every declared write is driven by some flow's `emit`. Narrow on purpose: it proves the coupling is exercised **at all**, not that the component still emits it (that is `emitted-live`). | ok, warn | AV, C | `verify.mjs:1576`, `:1582` |
| `catalogue` | For `membership: 'catalogue'` regions: the declared member types are the ones the data actually produces, read from the app's own captured payloads and its own enum. Errors on a member type in the capture that no island declares, and on one absent from the app's enum (unreachable, not merely unexercised). Warns on a declared type absent from the capture, and on a missing `capture` export. | ok, warn, error | AV, C | `verify.mjs:1431`, `:1436`, `:1459`, `:1472`, `:1478`, `:1484`, `:1486` |
| `region-root` | The region has ONE description. Best case: the archipelago declares `root` — the page and the lagoon compose from the same declaration. Otherwise a hand-written frame is inspected: it may hold only the application's own components, fragments and `island(slot)` calls. Intrinsic elements, literal strings, or a host component no composing file renders are errors. A clean frame is an `ok` that names `root`, unless `regionRoot: "required"`, which makes it an error. | ok, warn, error | AV, C | `verify.mjs:2138`, `:2145`, `:2151`(computed), `:2250`, `:2251`, `:2255`, `:2256` |
| `island-composition` | The region is made of the **same islands** the application places — comparing the frame's `island(slot)` calls plus motu-filled nested slots against the host's `<X.Island slot="…">` placements. A slot only the frame mounts is shipped by nothing; a slot the app **always** places and the region never mounts has never been looked at. A conditionally-placed slot is a warning (a different *state* of the same page). Skipped under `root`, with no frame, or with no readable host file. | ok, warn, error, skip | AV, C | `verify.mjs:2040`, `:2046`, `:2071`, `:2111`, `:2115`, `:2123`, `:2151` |

### 4.7 Region checks — runtime (`--runtime` / `--audit`, browser only)

Skipped under `--fast`, which says so via `region-runtime`. Gated at `verify.mjs:3121-3135`.

| Check id | Proves | Severities | Line |
|---|---|---|---|
| `region-runtime` | Meta: flows, mutation and the region render need a browser and were **not** run because `--fast` was passed. | skip | `verify.mjs:3128` |
| `lagoon-render` (region) | The region frame renders and every declared, non-planned slot mounts its island. Warns when a declared slot is not placed by this arrangement (behind an overlay or a conditional branch). Warns and skips when the region is layout-less — islands placed individually across the host. | ok, warn, error, inconclusive | `verify.mjs:3146`, `:3154`, `:3167`, `:3172`, `:3180`, `:3183`, `:3190`–`:3194` |
| `region-flow` | Every declared flow step ends as declared. Absent evidence, unreadable evidence and step-less evidence each get their own warning rather than a silent pass. A `ReferenceError`/`TypeError` is rethrown — that is a bug in motu, not a region that could not be driven. | ok, warn, error, inconclusive | `verify.mjs:1759`, `:1773`, `:1778`, `:1803`, `:1821`, `:1825` |
| `flow-mutation` | A step that cannot fail is not a check. **By construction**: a step whose `expect` names only keys it just `provide`d asserts the lagoon stored what it was handed (error). **By mutation**: the stimulus is changed crudely and re-run; an assertion that still holds is asserting a constant (error). A mutant that *broke* the region proves nothing and is a warning, not a kill. Counts what came back, not what was sent. | ok, warn, error, skip, inconclusive | `verify.mjs:1637`, `:1698`, `:1720`, `:1728`, `:1735`, `:1742` |
| `wiring-live` | Firing each declared write actually moves the key it claims to write. Precise about its limit: it fires the event **itself**, through the lagoon's emit seam, so it cannot tell you the component still produces it. | ok, error, skip, inconclusive | `verify.mjs:1857`, `:1861`, `:1864`, `:1870` |
| `emitted-live` | The other half: an output the component invokes **from an effect** actually fired while the region merely rendered. Narrow by construction — only provably effect-driven outputs are checked, because a click-handler output legitimately never fires in a render-only pass. | ok, warn | `verify.mjs:2854`, `:2860` |
| `store-guard` | motu's own runtime ownership guard ("key X is produced by island A, but written by B") did not complain while the region was driven. Surfaced here because the guard fires into a console nobody reads. | error | `verify.mjs:2635` |
| `laundering` | The host did not write a key shortly after an island emitted — a value derived from what an island did, fed back through the page instead of declared as an output. | warn | `verify.mjs:1810` |
| `provenance` | What the islands actually **fetched**, via stub exports wrapped in `traced(...)`. Without any traced call it skips and says how to opt in — the lagoon otherwise shows the result and never the question. | ok, skip | `verify.mjs:1404`, `:1417` |
| `sources-live` | The runtime half of `sources`. A channel writing a key no declared source claims is an **error**. A declared source that produced nothing is a warning, split by whether its keys hold anything: *seeded, not installed* (the page's own derivation is never exercised) versus *fed by neither channel nor seed*. | ok, warn, error | `verify.mjs:2957`, `:2983`, `:2991`, `:2999` |
| `region-responsive` | The **composed page** fits every declared viewport. Every island fits alone and the arrangement still overflows — a fixed-rail grid fits nothing on a phone and no island is at fault. Reports `inconclusive` when the region rendered **without the island stylesheet**, because an unstyled page cannot overflow by construction. | ok, error, inconclusive | `verify.mjs:2892`, `:2901`, `:2911`, `:2918` |
| `region-a11y` | axe over the composed page, in the states the flows establish. Serious/critical violations warn; a page with only minor findings is reported as such. | ok, warn | `verify.mjs:2928`, `:2930`, `:2931` |
| `no-console-errors`, `remount-stable` | As §4.5, applied to the region mount. | ok, error | `verify.mjs:715`–`:723` |

### 4.8 Host-integration checks — `motu integrate check`

`packages/cli/src/commands/integration.mjs`. **100% static**: text over comment-blanked host source, plus ts-morph for prop reconciliation. It never executes host code. Also runs as the last section of `motu check` (`check.mjs:122`).

| Check id | Proves | Severities | Line |
|---|---|---|---|
| `host-sources` | Meta, and printed rather than reported: the scan examined **0 files** under the host root, so nothing is proved about the host either way. **Exits 2 immediately**, before any JSON. | (exit 2) | `integration.mjs:810`–`:816` |
| `composed` | Some host file calls `createRegion(<Id>Archipelago)`. Without it the region verifies green and the app never composes it — and this error **returns early**, since nothing below is answerable. | ok, error | `integration.mjs:174`, `:182` |
| `mounted` | Some host JSX wraps content in `<binding.Region>` (or an alias). Composed but never mounted means the store exists and no island ever renders. | ok, error | `integration.mjs:217`, `:219` |
| `root` | Where the archipelago declares `root:`, a `<binding.Root>` is actually rendered — otherwise the page ignores the region's one description. | ok, error | `integration.mjs:278`, `:280` |
| `placed` | Every declared, live, non-catalogue slot appears as `<X.Island slot="…">` in host JSX, and every placed slot is declared. Warns when a slot sits inside a ternary, `&&` guard or `.map/filter/flatMap/forEach` callback — **placed is not reached** — and when the page never passes props the island binds. | ok, warn, error | `integration.mjs:298`, `:320`, `:519`, `:527`, `:530` |
| `fed` | Every host-fed key (bound, written by no island) is established by something: `seed`, a passed prop, `provide`, or a declared source. | ok, warn | `integration.mjs:373`, `:382` |
| `flow-shape` | The flows seed every key the page seeds on a real load — otherwise the lagoon previews a differently *shaped* region than users get. Skips when flows or page seeds are unreadable. | ok, warn, skip | `integration.mjs:400`, `:402`, `:406`, `:415` |
| `source-owned` | The host does not call `binding.provide('k')` for a key a declared source produces — page and lagoon would answer the same coupling differently. Downgrades to a warning when the source's `produces` could not be read. | ok, warn, error | `integration.mjs:432`, `:442`, `:452` |
| `island-props` | What the page passes on an island element and what the lagoon supplies for that slot are the same set. The page passing environment props the lagoon supplies nothing for is an **error** (previewed and approved without what the page gives it); the lagoon supplying more than the page does is a warning. | ok, warn, error | `integration.mjs:468`, `:487`, `:499`, `:507` |
| `read` | Some host file calls `binding.useRegion(...)` — otherwise the host feeds the region and never reads it back. | ok, warn | `integration.mjs:536`, `:537` |
| `source` | A file that uses the binding actually imports the declared source module (resolved, not text-compared). | ok, error | `integration.mjs:555`, `:557` |
| `duplicated` | The page keeps no `useState` copy of a key an island produces — two copies of one value drift, and the user sees whichever the page renders. | warn | `integration.mjs:571` |
| `contract` | A catalogue member declares no `writes` — it may own nothing, or ownership may simply be undeclared. | warn | `integration.mjs:153` |
| `catalogue` | Informational, never fails: the region is `membership: 'catalogue'`, and this many members are data-summoned rather than source-placed. | ok | `integration.mjs:144` |

**Boundary, stated in `.github/host-rules.md` "Placed is not the same as rendered":** `integrate check` reads the host's source. It can see `<X.Island slot="y">`; it cannot see whether the branch containing it ever runs. The lagoon renders every declared slot unconditionally, so it cannot see it either. The lagoon proves the island works, `integrate check` proves the page names it, and **nothing proves the page reaches it** — that needs the page rendered, in the host's own test runner.

### 4.9 `motu check`'s own rows

`packages/cli/src/commands/check.mjs`. These are printed rows, not report findings.

| Row | Proves | Severity | Affects `pass`? | Line |
|---|---|---|---|---|
| `strict-boundaries` | The host tsconfig enables `noUncheckedIndexedAccess` — `list[0].x` on a possibly-empty list compiles under plain `strict` and throws in the browser. The mechanical half of `default-props`. **Audited, never enforced**; unknown tsconfig prints nothing. | `✓` / `!` | No | `check.mjs:164`, `:172` |
| `generated` | `islands/contracts.generated.ts` exists and matches every component. Fix with `motu island sync`. | `✓` / `✗` | Yes | `check.mjs:177` |
| `region-generated` | `coverage.generated.ts` matches `motu.config.json`. A stale one still compiles, still imports, and configures the wrong thing — the symptom is coverage that never records, which looks exactly like a region nobody visited. | `✓` / `✗` | Yes | `check.mjs:186` |
| `skipped` | removal-check did not run because structure checks failed first. | `–` | (already failing) | `check.mjs:216` |
| `removable` | The host compiles with motu removed. Prints `N deleted, N unwrapped, N ejected`, and `· unchanged since the last proof` when the verdict came from the fingerprint cache. | `✓` / `–` | Yes | `check.mjs:221`, `:225` |
| `load-bearing` | The host does **not** compile without motu; prints the first five errors. | `✗` | Yes | `check.mjs:236` |
| `NOTHING TO CHECK` | `--changed` narrowed to zero islands and zero regions. Not a pass — **exit 2**. | verdict | exit 2 | `check.mjs:107`–`:115` |

### 4.10 Removal — `motu removal-check`

`packages/cli/src/commands/removal-check.mjs`. Neither purely static nor a lagoon run: it builds an import graph, **mutates the working tree** (deleting 100 %-motu files, unwrapping motu tags elsewhere, ejecting region reads/seeds to plain state), shells out to the host's own `npx tsc --noEmit`, and restores unconditionally in a `finally` (`:515`–`:525`). `check.mjs:9-10` names it the one deliberate exception to "motu doesn't run the host's tools".

| Verdict | Proves | Line |
|---|---|---|
| skip | The project declares `removable: false`. Deliberately **not** a tick — nothing was examined. Returns `pass: true, skipped: true`, and the `motu check` PASS line suppresses the word "removable". | `:288`–`:296`, `check.mjs:264` |
| fail (empty scan) | The walk examined **0** host files. Yellow glyph, `pass: false` — a green from an empty search is the bug this command was rewritten to stop reporting about itself. | `:438`–`:454` |
| pass (no references) | The host was scanned and contains zero motu references. | `:455`–`:461` |
| pass (cached) | The fingerprint matches the last recorded PASS, so the verdict is re-asserted without a `tsc`. `--force` dissolves the cache. | `:489`–`:511` |
| PASS | The host typechecks with motu removed. | `:598`–`:608` |
| FAIL | motu is load-bearing. | `:610` |
| `surgeryErrors` | **Unanswered, not failed**: the rewriter threw on a JSX shape and left the file alone. Fatal to `pass` (`:570`). | `:425`, `:617`–`:628` |
| `disqualified` | Files that compose a region but import the application, so they can only be stripped, not deleted. Advisory — does not affect `pass`. | `:320`–`:336`, `:646`–`:659` |
| `preExisting` / `generated` | Errors reproducible on the restored tree, and `.next/`-prefixed route artifacts, are subtracted from the real error set and counted separately. | `:545`, `:558`–`:565` |

Two exemptions narrow the claim honestly: `@motu/types` is type-only and erases at compile time, so it is **not** stripped (`:118`–`:128`) — the claim is "no *runtime* trace". `@motu/chrome` tags are never unwrapped (`:208`, `:217`), so an app painting with `@motu/chrome/react` legitimately reports load-bearing.

### 4.11 Contract — `motu contract check`

`packages/cli/src/commands/contract.mjs`. Purely static: ts-morph plus regex over comment-blanked archipelago text. One rule, three outcomes.

| Verdict | Proves | Exit | Line |
|---|---|---|---|
| no snapshot | `src/contract.snapshot.json` has never been generated; nothing can be compared. | 1 | `:154`–`:157` |
| `PASS  boundary unchanged` | The rebuilt boundary — callable methods, each island's input/output/ambient, each region's slots, shared state and coupling edges — is byte-identical to the committed snapshot. | 0 | `:158`–`:166` |
| `FAIL  the boundary moved and <file> did not.` | Something in that surface changed without acknowledgement. `--update` writes it, so the change lands as a reviewable line in the diff. | 1 | `:167`–`:169` |

**Known weakness worth knowing:** `contract check` has no `seen: 0 → skip` guard. If `src/services/index.ts` is absent and no archipelago dirs exist, `build()` returns empty objects, and once `--update` has recorded that emptiness the check is green forever.

### 4.12 Coverage — `motu region coverage <id>`

`packages/cli/src/commands/region-coverage.mjs`. Static: it compares a recorded corpus of production state fingerprints against the states the region's flows establish. See [coverage](09-coverage.md).

| Row | Proves | Severity | Line |
|---|---|---|---|
| `corpus` | Which corpus was used, when it came from `coverage.corpusUrl` rather than `--corpus`. The configured URL is rewritten to carry `region=<id>`, because one string for several regions is right for exactly one of them. | note | `:218`, `:330` |
| `coverage` (no flows) | Nothing to compare a corpus against. **Exit 2.** | `–` | `:179` |
| `coverage` (no corpus) | Prints what the flows cover and the known set to publish, and states that it examined no reality. **Exit 2.** | `–` | `:222` |
| `declaration` | The corpus and the code fingerprint states the same way (`keysHash`). If they differ, nothing below is comparable — **exit 1** immediately, which is what caught one region being compared against another region's data. | `✗` | `:446` |
| `systemic` | A key where the two sides are **disjoint**: production shows one set, the flows another. Not a missing scenario — a missing column. Widen the flow seeds. | `!` | `:459` |
| `coverage` | Every recorded state is previewed by some flow. Otherwise uncovered states are listed most-seen first with a paste-able seed skeleton. | `✓` | `:512` |
| `saved` / `forget` / `accept` | Corpus persistence and triage against the lagoon host. | note / exit 2 on host error | `:360`, `:380`, `:417` |

Advisory unless gated: without `--fail-above` the run exits 0 and says `(advisory — pass --fail-above to gate)` (`region-coverage.mjs:560`). A state reached through `emit` is reported as uncovered even though a flow does exercise it, because only a browser knows the result — said in the prose (`region-coverage.mjs:537`) and in the JSON `caveats` (`region-coverage.mjs:497`).

---

## 5. The three tiers, and their real costs

From `.github/host-rules.md` "Three tiers, and which one you are in". **Measured on a 16-island, 2-region project; the snapshot rows on a 20-island, 3-region one.**

| Command | Question it answers | Cost | When |
|---|---|---|---|
| `motu check` | Has anything drifted from what it declares? | **1.4s** | every change |
| `motu island verify <n> --runtime` | Does this one island still behave? | **~15s** | while you work |
| `motu archipelago verify <id> --runtime` | Does this one region still behave? | **~25s** | while you work |
| `motu check --runtime --fast` | (no browser) | **44.0s** — **5.9s with `--changed`** | while you work |
| `motu check --runtime` | Does it work? | **103.5s** | before handing work over |
| `motu check --audit` | Is it usable? | — | before integrating, and in CI |
| `motu island snapshot --all --remote` | Did it move? | **89s** | before handing work over |
| `motu archipelago snapshot --all --remote` | Did the page move? | **18s** | before handing work over |

**Name what you touched.** While working on a region, the runtime check you run is that region and its islands — `motu archipelago verify login --runtime`, `motu island verify login-form --runtime` — not the whole project. The full `motu check --runtime` re-drives a browser for every island in the repo to tell you about the one you changed. Run it once, before handover.

For the snapshots, `--changed` is the point: scoped to one touched island they cost **11s and 15s**, cheaper than the `--fast` loop, because `--changed` maps a changed island to the regions that declare it.

---

## 6. Scoping and engine flags

### `--changed` — worth passing, not a plan

`check.mjs:79` → `changedScope()` (`packages/cli/src/lib/changed.mjs:73`). It maps each changed file to an island or a region: files under `archipelagos/<id>/` map to that region; files under `islands/` map by `<kebab>.island.ts` / `<kebab>.evidence.ts` (the generated `registry.*` and `contracts.*` are nobody's, `changed.mjs:112`); components are followed **by what each island actually mounts** (`changed.mjs:86-94`), because on a React host the component lives in the app, not under motu. Files that provably cannot reach a render (`.claude/`, `.vscode/`, `.idea/`, `.github/`, `*.md`) are ignored (`changed.mjs:97`).

**It widens back to everything the moment one changed file maps to nothing**, and says so on stdout (`check.mjs:80-82`). That is the design: a check that quietly examined less than you think is the worse failure.

The measured account from `.github/host-rules.md`: on this project, mid-session, **16 changed files were unattributable, so it ran everything**. After ignoring files that cannot reach a render and mapping the lagoon's per-region module to its region, that dropped to **14 — and it still ran everything**, because `peps:app/dashboard/profile/page.tsx` and four app-side files remained. What does not map is most of a real session: the page, the screen that installs a source, the app-side region type, `roots/lagoon/src/lagoon.tsx`, a shared evidence module, the generated barrels.

So: `--changed` is worth passing, and it is **not a substitute for naming the region**. And a `--changed` run that narrowed to nothing exits **2** with `NOTHING TO CHECK` rather than green (`check.mjs:107-115`).

### `--fast` vs `--runtime` vs `--audit`

| Flag | Engine | Sees | Cannot see |
|---|---|---|---|
| *(none)* | none — AST and file reads | Drift between declarations, source and registry: §4.1–4.4, §4.6, §4.8 | Anything about behaviour |
| `--fast` | in-process **happy-dom** in node (`verify.mjs:753`) | Island mount, console errors, remount stability, `data-flow` via the harness, `input-coverage` | Layout, paint, axe, error-resilience, seed transport, **and every region runtime check** — flows, mutation and the region render are browser-only and are skipped and said (`region-runtime`, `verify.mjs:3128`) |
| `--runtime` | real browser (Playwright/Chromium) | Everything in §4.5 except `responsive`/`a11y`, plus everything in §4.7 | `responsive`, `a11y`, `region-responsive`, `region-a11y` — which say so via `– audit` (`verify.mjs:1153`) |
| `--audit` | real browser; **implies `--runtime`** (`check.mjs:68`) | Adds `responsive`, `a11y`, `region-responsive`, `region-a11y` | — |

`--fast` has one honest limit of its own: it is plain node, so the project's `react` and the framework's `react` can meet in one tree and a hook sees a null dispatcher. That is reported as `inconclusive`, not as a defect (`verify.mjs:779-786`) — the browser lagoon dedupes and the same island passes there.

`--audit` is a gate, not a loop: `responsive` and `a11y` are the two most expensive per-island checks, and their answer changes when the **rendering** changes, not when a key moves.

The runtime lane opens the lagoon **once** — one dev server, one browser, one page — and re-aims it. In a real project the first island pays the Vite boot (~15s) and every island after it is under a second per check. Chromium is a one-time install: `cd packages/cli && npx playwright install chromium`.

---

## 7. Escape hatches

Every documented way to downgrade or excuse a check. Each costs something; the cost is the point.

| Hatch | Declared in | Downgrades | To | Cost |
|---|---|---|---|---|
| `inventedArrangement('why', node)` | the lagoon frame; `packages/react/src/lagoon-overrides.ts:171` | `region-root` error on a frame that draws its own elements or strings | **warn**, with the reason printed beside it (`verify.mjs:2255`) | A sentence, in the file. Throws if the reason is empty (`lagoon-overrides.ts:172`). It excuses a stand-in, never a copy of the page — the copy drifts. |
| `rawChannel('why', fn)` | `packages/core/src/archipelago.ts:852` | `channel-source` error on a channel not built by the tool | **vouched**, counted as ok (`verify.mjs:2681`) | A sentence; throws without one. The channel then belongs to no archipelago, so the region-mismatch guard cannot check it (`lagoon-overrides.ts:140`). |
| `planned: true` | an island entry in the archipelago | Existence, mount and placement checks for that island | **skipped** — `islands-registered` skip (`verify.mjs:2557`), excluded from `render-coverage` (`verify.mjs:1513`), from the region render's declared list (`verify.mjs:3164`), and from `integrate check`'s live islands (`integration.mjs:139`) | Ownership is **still enforced** — a second claim on its keys fails. And **the flag removes itself**: once the island is registered, `planned: true` is an `error` (`verify.mjs:2540`). |
| `standalone: true` (island file) or `--standalone` | `element.ts`; `verify.mjs:504` | `archipelago` warn ("not in an archipelago") | **ok** — "standalone island — couples with nothing" (`verify.mjs:508`) | Declared on the island, not passed to verify, because it is a property of the island rather than of how you invoked the check. |
| `removable: false` | `motu.config.json`; `packages/cli/src/lib/config.mjs:171` | The whole removal-check | **skip**, `pass: true, skipped: true` (`removal-check.mjs:296`) | The `motu check` PASS line **stops claiming removability** (`check.mjs:264`), and the row prints `–`, never `✓` (`check.mjs:221-224`). |
| `regionRoot: "required"` | `motu.config.json`; `config.mjs:135` | *(inverse)* — it **upgrades** | A clean hand-written frame goes from `ok` to **error** (`verify.mjs:2250`) | For a project that has finished migrating. The default is `encouraged`. |
| `root:` on the archipelago | the archipelago file | `region-root` and `island-composition` comparison | **ok** / **skip** — one declaration, nothing to compare (`verify.mjs:2135-2151`) | Not a hatch so much as the answer: a real refactor of the host's own JSX. |
| `membership: 'catalogue'` | the archipelago file | The `placed` requirement for data-summoned members (`integration.mjs:141`); the declared-slot list in the region render (`verify.mjs:3161-3164`) | members are excluded | The `catalogue` check takes over: declared member types are compared against the app's own capture and enum (`verify.mjs:1428`). |
| `a11y.fail` / `a11y.ignore` | `lagoon.config.json`; `packages/cli/src/lib/util.mjs:271` | axe violations | `fail` defaults to **`never`** — every violation is a warning; `ignore` drops named rules entirely | The default is the hatch: a check that turns an existing codebase red on the day it ships gets switched off, not acted on. Ignored rules are counted in the `ok` message. |
| `--fast` | flag | Every browser-only check | **skip**, said out loud (`region-runtime`, `verify.mjs:3128`) | Regions are not checked at all. Re-run without it before handing over. |
| `--force` | `motu removal-check --force`; `removal-check.mjs:489` | The fingerprint cache | forces a real `tsc` | Time. |
| `--update` | `motu contract check --update`; `contract.mjs:149` | A boundary FAIL | write-and-return, no verdict | The change lands **in the committed diff** (`contract.mjs:9-10`) — widening the callable surface becomes a reviewable line rather than an invisible one. |
| `--accept <id>` | `motu region coverage`; `region-coverage.mjs:417` | An uncovered production state | accepted, no longer triaged | One of three answers; the other two are "write a scenario" and "fix the application" (`region-coverage.mjs:530`). |
| `hostSources: [...]` | `motu.config.json`; read at `removal-check.mjs:85`, whitelisted at `config.mjs:123` | *(widens, does not excuse)* the removal scan roots | — | **Caveat: `integrate check` ignores it.** `integration.mjs:62` hardcodes `['app','components','lib','src','pages']`, even though its own `host-sources` message at `integration.mjs:814` tells you to set `hostSources`. |
| `@motu/types` import | — | The removal surgery | not stripped (`removal-check.mjs:118-128`) | The claim narrows to "no **runtime** trace of motu". |
| Comments | everywhere | — | *(not a hatch — the opposite)* | `blankComments` runs before nearly every text match (`verify.mjs:2321-2323`, `integration.mjs:67`, `contract.mjs:96`), so a commented-out `<X.Island>` never counts as a placement and a scaffolded `// bind: {…}` never counts as coupling. Commenting things out removes evidence; it does not excuse a check. |

There is **no comment pragma** — no `motu-ignore`, no inline suppression — anywhere in the checkers. Every hatch above is either a declaration in the code, a key in config, or a flag.

---

## 8. Reading the output

### A finding, on a terminal

`printReport` (`verify.mjs:1888`) renders one line per finding:

```
  ✓ no-bare-fetch      no bare fetch / XMLHttpRequest
  ! props-match        prop 'compactMode' isn't registered in element.ts props — it can never be set
  ✗ region-root        roots/lagoon/src/regions/login.tsx: draws 3 element(s) of its own (<div>, <h2>, <p>)  (line 12)
  – audit              responsive + a11y not run — they are the `--audit` gate
  ? lagoon-render      Chromium not installed — run `npx playwright install chromium`
  ✓ render-coverage    every declared slot is asserted by a flow  · 6 slot(s) asserted
```

| Mark | Level |
|---|---|
| `✓` green | ok |
| `!` yellow | warn |
| `✗` red | error |
| `–` dim | skip |
| `?` yellow | inconclusive |

The check id is padded to 18 columns, the message follows, then `· N examined` when the check counted what it looked at, then `(line N)` when the finding has a source line. Then one verdict line:

```
FAIL          3 error(s), 5 warning(s)
INCONCLUSIVE  2 check(s) could not run, 5 warning(s) — retry, do not repair
PASS          5 warning(s)
```

A sweep (`--all`, or `motu check`) collapses each clean member to one line and prints only its errors and warnings (`printSweep`, `verify.mjs:1189-1209`).

### `--json`

`motu island verify <name> --json` (`verify.mjs:1067`):

```json
{ "island": "login-form", "tag": "x-login-form", "pass": true,
  "findings": [ { "level": "ok", "check": "no-bare-fetch", "msg": "…", "examined": 4, "examinedOf": "scenario(s)" },
                { "level": "error", "check": "props-match", "msg": "…", "line": 31 } ] }
```

`motu archipelago verify <id> --json` (`verify.mjs:2617`): `{ "archipelago": id, "pass": boolean, "findings": [...] }`.

Either verb with `--all` (`verify.mjs:1059`, `:2606`) wraps `summaryOf` (`verify.mjs:1179`): `{ "islands": [ { name, tag, pass, findings } ] }` / `{ "archipelagos": [ … ] }`.

`motu integrate check --json` (`integration.mjs:829`):

```json
{ "host": "/abs/path", "regions": [ { "id": "login",
    "findings": [ { "level": "error", "check": "placed", "msg": "…" } ] } ] }
```

`motu check --json` (`check.mjs:139-155`):

```json
{ "pass": false, "runtime": true,
  "contracts": { "stale": false, "reason": null },
  "islands": [ /* summaryOf */ ], "archipelagos": [ /* summaryOf */ ],
  "integration": [ { "id": "login", "findings": [ … ] } ],
  "removal": { "pass": true, "scanned": 214, "deleted": [], "stripped": [], "ejected": [], "errors": [] } }
```

Finding-object fields, in one place:

| Field | Present when | Meaning |
|---|---|---|
| `level` | always | `ok` / `warn` / `error` / `skip` / `inconclusive` |
| `check` | always | the check id — the stable identifier; the `msg` is prose and will change |
| `msg` | always | the finding, written to be acted on |
| `line` | error/warn from a static check | 1-based line in the file the check read |
| `examined` | `ok` (and the `seen: 0` skip) | how many things the check looked at |
| `examinedOf` | with `examined` | what those things were (`'slot(s) asserted'`, `'shared key(s)'`) |

Three shapes do **not** appear in JSON and exist only on the human path: `strict-boundaries`, `region-generated` (though `regionDrift.stale` still affects `pass`), and the `host-sources` exit-2 message, which prints prose and exits before any JSON is written.

`motu region coverage --json` (`region-coverage.mjs:474-507`) owns stdout entirely — the prose printer is disabled (`region-coverage.mjs:159`) so a parser cannot get half of each. Its payload carries `covered`, `systemic`, `uncovered[]` (each with `share`, `count`, `differsBy`, `fingerprint` and a paste-able `scenario` skeleton), `unreachable`, `keysDiffer`, `caveats` and `pass`.

`motu contract check` and `motu removal-check` have no `--json` of their own: the contract's artifact is `src/contract.snapshot.json` itself, and removal-check's summary surfaces under `motu check --json` → `removal`.
