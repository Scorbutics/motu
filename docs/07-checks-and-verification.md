# Checks and verification

Every claim motu makes about a project is a named check with an id, a severity and a verdict. This page is the catalogue: what each check id proves, which severities it can emit, which command runs it, and whether it reads source or drives a browser. It also documents the three exit codes, the three cost tiers, what `--changed` / `--fast` / `--runtime` / `--audit` do and do not see, and every documented way to downgrade or excuse a check.

Related: [concepts](01-concepts.md) · [CLI reference](03-cli-reference.md) · [configuration](04-configuration.md) · [archipelagos and regions](05-archipelagos-and-regions.md) · [lagoon](08-lagoon.md) · [coverage](09-coverage.md) · [evidence and testing](10-evidence-and-testing.md) · [contract and backend](11-contract-and-backend.md) · [hosts and adapters](12-hosts-and-adapters.md).

---

## 1. The report model

A finding is an object, not a line of prose. `makeReport()` (`packages/cli/src/commands/verify/report.mjs:45`) exposes five constructors, each taking the **check id as its first argument**:

| Constructor | Level | Meaning | Fails the run? |
|---|---|---|---|
| `report.error(check, msg, line)` | `error` | A declaration was **contradicted**. Repair it. | Yes |
| `report.warn(check, msg, line)` | `warn` | A rule the project has not adopted yet, or a design choice worth naming. | **No** |
| `report.ok(check, msg, seen)` | `ok` | The claim **held**, over `seen` things examined. | No |
| `report.skip(check, msg)` | `skip` | The rule does not apply to this project's posture, with the reason stated. | No |
| `report.inconclusive(check, msg)` | `inconclusive` | The check **could not run** — environment, not code. | No, but exit 2 |

Two invariants live in the constructors themselves, not at the call sites:

- **`report.ok(check, msg, 0)` becomes a `skip`** (`verify/report.mjs:57-66`). A check that examined nothing cannot have held. This is why many `ok` calls pass `{ n, of }` or an array — the printed line carries `· 12 slot(s) asserted` (`verify/reach.mjs:369-371`), so a wall of green can be told apart from a wall of nothing.
- **`skip` is deliberately not `ok`** (`verify/report.mjs:80-85`). A rule silently reported as passing is indistinguishable from a rule that ran.

`inconclusive` is decided by `environmentalCause(err)` (`verify/reach.mjs:200-212`), which requires **both** a known environmental signature (`did not open port … in time`, `Executable doesn't exist`, `EADDRINUSE`, `ECONNREFUSED`, `browserType.launch`, …) **and** the absence of any application cause in the output. A port that never opened *because the project does not build* is a finding, not an environment.

`motu integrate check` uses a narrower vocabulary — `add(level, check, msg)` at `packages/cli/src/commands/integration.mjs:131`, with levels `error | warn | ok | skip` and no `inconclusive` and no `seen`-count guard.

---

## 2. Severity semantics — what actually fails a run

**Warnings do not fail anything. Plan around this.**

| Gate | Source | Condition |
|---|---|---|
| `motu island verify <name>` | `verify/island-runtime.mjs:154` → `verifyExitCode` (`verify/island-runtime.mjs:255`) | `errors.length` → 1; else any `inconclusive` → 2; else 0 |
| `motu island verify --all` | `verify/island-runtime.mjs:145` | `results.every(r => r.errors.length === 0) ? 0 : 1` |
| `motu archipelago verify <id>` | `verify/region-composition.mjs:32` → `verifyExitCode` | same three-way |
| `motu archipelago verify --all` | `verify/region-composition.mjs:23` | `results.every(r => r.errors.length === 0) ? 0 : 1` |
| `motu integrate check` | `integration.mjs:830` (json), `:852` (human) | any finding at `level === 'error'` → 1 |
| `motu check` | `check.mjs:137`, exits at `:155` / `:268` | `structureOk && integrationOk && (removal?.pass ?? false)` |
| `motu removal-check` | `removal-check.mjs:669` | `summary.pass ? 0 : 1` |
| `motu archipelago coverage <id>` | `region-coverage.mjs:507`, `:557`, `:563` | uncovered states at or above `--fail-above` → 1 |

Two consequences worth stating flatly:

1. **The `--all` sweep loses exit 2.** `verify/island-runtime.mjs:145` and `region-composition.mjs:23` gate on `errors.length === 0` only, so a sweep in which every runtime check was inconclusive (no Chromium, say) exits **0**. Only the single-target form routes through `verifyExitCode`. If you are gating an unattended loop, verify one island or one region at a time, or read `--json`.
2. **`motu check`'s aggregation drops severity nuance further** (`check.mjs:126-134`): integration warnings never block, `strict-boundaries` is audited and never enforced (`check.mjs:160-175`), and `removal` is `null` — hence falsy — when the structure checks already failed.

---

## 3. The three exit codes

    0  the declarations hold
    1  something contradicted them        -> repair
    2  a check could not run              -> retry, do NOT repair

Documented at `.github/host-rules.md` "Three outcomes, three exit codes"; implemented at `verify/island-runtime.mjs:255`.

**Why 2 is distinct from 1.** A human shrugs at a port timeout and re-runs. An agent reads `✗` and repairs a bug that does not exist — and several agents produce several confident wrong repairs. `verify/report.mjs:73-80` records this as the reason `inconclusive` exists at all. The verdict line prints `INCONCLUSIVE  N check(s) could not run … — retry, do not repair` (`verify/reach.mjs:372-377`), not `PASS` and not `FAIL`.

Exit 2 is also the code for **"this run proves nothing"**, which is a different failure from "this run found nothing":

| Exit 2 site | Condition |
|---|---|
| `verify/island-runtime.mjs:131`, `report.mjs:333` | usage error — no target and no `--all` |
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

Run on every `motu island verify` / `motu check`, no flags needed. Source: `staticChecks` (`verify/report.mjs:96`).

| Check id | Proves | Severities | Run by | Line |
|---|---|---|---|---|
| `component` | The island has a component at all; nothing else can run without it. | error | IV, C | `verify/island-runtime.mjs:176` |
| `adapter-island` | This is an AngularJS island (a `*.ng.ts`, no React component), so the React-only checks are legitimately not run. A **skip**, not an `ok`: it reports that checks did not happen, and "a rule silently reported as passing is indistinguishable from a rule that ran" (§1). | skip | IV, C | `verify/island-runtime.mjs:364` |
| `no-bare-fetch` | No `fetch()` call and no `XMLHttpRequest` — all I/O crosses the contract seam, so the lagoon can stand in for the backend. | ok, error | IV, C | `verify.mjs:155`, `:160`, `:185` |
| `no-history` | No `history.pushState/replaceState`, no `history`, no `location.*` (except `.origin`) — the ocean owns the URL; navigation is a host intent. | ok, error | IV, C | `verify/island-static.mjs:27`–`island-static.mjs:35`, `island-static.mjs:44` |
| `no-doc-reachout` | No `document.querySelector/querySelectorAll/getElementById/getElementsByClassName` — an island never reaches into the host DOM. | ok, error | IV, C | `verify/island-static.mjs:39`, `island-static.mjs:45` |
| `contract-only-io` | No `axios`/`ky`/`superagent`/`node-fetch`/`got` import, and no raw `configure`/`HttpTransport`/`MockTransport` from `@motu/runtime`. | ok, error | IV, C | `verify/island-static.mjs:54`, `island-static.mjs:60`, `island-static.mjs:66` |
| `ui-layering` | A `ui/` component imports neither `islands/` nor `archipelagos/` — it stays liftable, and islands cannot couple through it. `ui`→`ui` is fine. | ok, error | IV, C | `verify/island-static.mjs:76`, `island-static.mjs:80` |
| `contract-calls` | Every `service.method()` the component invokes exists in the generated `@motu/contract` — catches invented endpoints and names stale after a backend change. Silent when the component imports no contract service. | ok, error | IV, C | `verify/island-static.mjs:103`, `island-static.mjs:107` |
| `default-props` | The component renders from default props alone — statically, only the clearly-bad case (a required, non-destructured, undefaulted props param). The runtime mount is authoritative. Warns when the function cannot be found. | ok, warn, error | IV, C | `verify/island-static.mjs:118`, `island-static.mjs:123`, `island-static.mjs:125` |

### 4.2 Island checks — config (AST over the island file + the registry)

Source: `configChecks` (`verify/island-static.mjs:161`).

| Check id | Proves | Severities | Run by | Line |
|---|---|---|---|---|
| `registered` | `element.ts` exists, declares an island (long or short form), and is wired into `ELEMENT_REGISTRY`. Warns when it mounts an identifier it does not import. | ok, warn, error | IV, C | `verify/island-static.mjs:164`, `island-static.mjs:204`, `island-static.mjs:213`, `island-static.mjs:226`, `island-static.mjs:228` |
| `no-island-import` | The mount point imports no **sibling island** — mount points coordinate only at runtime, through the store. Resolved against the real island list, not a path shape. | ok, error | IV, C | `verify/island-static.mjs:184`, `island-static.mjs:188` |
| `legacy-strategy` | Posture first: where the host **has** a legacy skin (`LEGACY_FIT`), the element row declares a `legacy` fit strategy. Where it does not, the rule is *skipped*, and declaring `legacy` anyway is a warning. | ok, warn, error, skip | IV, C | `verify/island-static.mjs:253`, `island-static.mjs:258`, `island-static.mjs:261`, `island-static.mjs:263` |
| `props-match` | The registry and the component do not drift: a registered prop the component does not accept is dead config (error); a callback not mapped to an event has its output dropped (warn); an unregistered prop can never be set (warn). Warns when props are typed inline and there is nothing to compare. | ok, warn, error | IV, C | `verify/island-static.mjs:279`, `island-static.mjs:288`, `island-static.mjs:291`, `island-static.mjs:294`, `island-static.mjs:299` |
| `effects` | The host **modules** the component reaches without being handed them — derived from the lagoon's `alias` keys, over **runtime** imports only — match the bare-string entries of `contract.effects`. Flags both missing and stale declarations. The object kinds are checked elsewhere: `{ scope }` by the AngularJS adapter, `{ table }`/`{ rpc }`/`{ fn }`/`{ route }` by `data-reach`. | ok, warn | IV, C | `verify/island-static.mjs:345`, `island-static.mjs:348`, `island-static.mjs:351` |
| `archipelago` | The island is a member of an archipelago, or has declared `standalone: true`. Not being in one is a warning, not a failure — most islands couple with nothing. | ok, warn | IV, C | `verify/island-static.mjs:364`, `island-static.mjs:366`, `island-static.mjs:368` |

### 4.3 Island checks — CSS

`cssChecks` (`verify/island-static.mjs:428`). Runs over the island's **own** `.css` if it owns one (opt-in, `verify/island-static.mjs:473`), and over the shared stylesheet at region scope.

| Check id | Proves | Severities | Run by | Line |
|---|---|---|---|---|
| `css-host-form` | Every `:host` is functional (`:host(...)`) or wrapped in `:where(:host, .motu-root)`, so the rule also applies in **light** isolation — a bare `:host` is inert in light DOM. | ok, error | IV, AV, C | `verify/island-static.mjs:445`, `island-static.mjs:468` |
| `css-tokens` | Colours come from `--x-*` / `--_*` tokens rather than raw hex literals (`#fff`/`#000` exempt). | ok, warn | IV, AV, C | `verify/island-static.mjs:463`, `island-static.mjs:469` |

### 4.4 Island checks — adapter-contributed

The CLI parses; the adapter judges. Discovery is by the adapter the island imports, falling back to the configured host (`verify/island-runtime.mjs:104`). Findings come back as `{ level, check, msg }` and are replayed through the same report (`verify/island-runtime.mjs:120`).

| Check id | Proves | Severities | Adapter | Line |
|---|---|---|---|---|
| `adapter-verify` | Meta: the adapter's verify contribution could be loaded and run at all. **Inconclusive**, not a warning — a warning does not affect the exit code, so an adapter that failed to load meant its checks silently did not run and the island still reported PASS. | inconclusive | core | `verify/island-runtime.mjs:301` |
| `host-coupling` | An AngularJS island that reaches host scope (`inheritScope` / `hostScopeKey`) declares the host-scope names it depends on as `{ scope: … }` entries in `contract.effects`. `adopt` relocates a live node and needs no manifest. Also flags an unused declaration and a `hostScopeKey` missing from the list. Its `ok` line carries the honest limit: verify cannot reach the real embedded host, so the lagoon stub must supply those keys and an integration check is still owed. | ok, warn, error | angularjs | `packages/adapters/angularjs/verify.mjs:29`, `:41`, `:48`, `:57`, `:65` |
| `rsc-boundary` | A Next island imports no server-only module (`server-only`, `next/headers`, `next/server`, `next/cache`, `next/og`) and contains no `'use server'` action — either makes it unmountable in the lagoon, which has no Next runtime. **Asked of the whole reachable graph, not just the island's own file**: a Next app keeps `'use server'` in an actions module and `server-only` in the lib beneath it, so the disqualifying import is normally several ordinary hops away, and the failure it replaces was an opaque bundler error naming none of them. The offending module is named, with the reason. Application imports only (relative and the host's `@/` alias), breadth-first, capped — and the cap being reached is reported, because a check that quietly examined part of a graph is the bug this closes. Type-only imports are erased first and never flagged. Also reports, on its `ok` line, any use of `next/link` / `next/image` / `next/navigation`, which the lagoon renders **inert** — it passes here and can still be wrong in the host. | ok, warn, error | next | `packages/adapters/next/verify.mjs:56`, `:63`, `:88`, `:94`, `:104` |
| `use-client` | The component declares `'use client'`. An **error** once it actually uses hooks (the exit path — importing the component directly — breaks mechanically); a **warning** otherwise, because a pure projection is safe either way. | ok, warn, error | next | `packages/adapters/next/verify.mjs:74`, `:77`, `:82` |

### 4.5 Island checks — runtime (`--runtime` / `--audit`)

Opt-in. Everything here drives a lagoon: a real browser (Playwright/Chromium) by default, or an in-process happy-dom mount under `--fast`. Gated at `verify/island-runtime.mjs:203`.

| Check id | Proves | Severities | Engine | Line |
|---|---|---|---|---|
| `lagoon-render` | The island tag upgrades and paints a non-empty shadow DOM, in `native` and (where a legacy skin exists) `legacy` fit. Mounting but rendering nothing from defaults is a **warning** — a pure projection may be right. | ok, warn, error, inconclusive | browser or `--fast` | `verify/reach.mjs:68`–`reach.mjs:81` (fast), `island-runtime.mjs:28`–`island-runtime.mjs:40` (browser) |
| `no-console-errors` | Nothing logged a console error or leaked an unhandled rejection while the island (or region) was mounted. | ok, error | both | `verify/island-static.mjs:573`, `:717` |
| `remount-stable` | Re-mounting produces byte-identical output (portaled output included, as for `data-flow`) — catches accidental module-level state. Silent when the island never rendered (the mount error already covers it). | ok, error | both | `verify/island-static.mjs:579`, `island-static.mjs:581` |
| `error-resilient` | The island survives a backend that fails every call (forced 500): it renders, and leaks no unhandled rejection. Not mounting under forced errors is a warning; an unhandled rejection is an error. | ok, warn, error | browser only | `verify/island-runtime.mjs:51`–`island-runtime.mjs:61` |
| `seed-transport` | Every scenario seed crosses into the browser intact. A `Set`, `Map`, `Date` or function arrives as `{}`, which breaks **every** scenario and makes `data-flow` and `responsive` report the wrong cause. Checked before the checks that depend on it. | ok, error | browser only | `verify/island-runtime.mjs:290`, `island-runtime.mjs:296` |
| `input-coverage` | Every seeded input is shown in more than one shape: an array prop is seeded empty at least once; a boolean takes both values. Needs no browser and runs under `--fast`. Explicitly does **not** catch per-pair gaps. | ok, warn | neither (reads evidence) | `verify/island-runtime.mjs:341`, `island-runtime.mjs:347` |
| `data-flow` | Opt-in at two or more declared `scenarios`: distinct seeds produce **distinct rendered output**, so data flows past the seam rather than merely type-checking. A scenario that rendered nothing is an error with its own message — unless it declares `blank: '<why>'`, which makes the empty render its expected answer and ASSERTS it (a `blank` scenario that renders something is an error, so the declaration cannot go stale). Several `blank` scenarios count as one expected render, not as duplicates. Duplicate renders warn. A scenario's seeded keys are PINNED in the lagoon: the region's sources may not overwrite them, so `seed: {}` means "whatever the sources answer" and an explicit `null` means "nothing here". A value that must ARRIVE after the island is on screen — a component that treats what it mounted with as already handled — goes in `afterMount: { … }`: provided once the island has mounted and settled, in every lane (browser, `--fast`, and the `?scenario=` address), and pinned like the seed. "Rendered" is the island's subtree **plus what its own mount portaled to `<body>`** (a Radix/vaul dialog), attributed by React ancestry — never lagoon chrome (`data-motu-chrome`), pre-existing nodes or another mount's portal; the seen-count says so (`· 4 portals in 2 of 2 scenario(s)`, and `data-flow (incl. portal)` when collapsed). Same reading for `remount-stable`, `responsive`, `a11y` and the snapshot shot (`packages/cli/src/lib/island-render.mjs`). | ok, warn, error, inconclusive | both | `verify/reach.mjs:142`, `reach.mjs:153`, `reach.mjs:159`, `reach.mjs:170`, `reach.mjs:177` |
| `responsive` | The island fits every declared viewport, in every scenario. Horizontal overflow is an **error** (a page the member must pan sideways is broken); rendering nothing at any viewport is a warning. | ok, warn, error | browser, `--audit` only | `verify/island.mjs:24`–`island.mjs:44` |
| `a11y` | axe finds no violation, per declared scenario, scoped to the island's subtree. The fail bar is `lagoon.config.json` → `a11y.fail`, **default `never`** — so by default every violation is a warning. | ok, warn, error, inconclusive | browser, `--audit` only | `verify/report.mjs:155`, `report.mjs:161`, `island-runtime.mjs:261`, `island-runtime.mjs:262` |
| `stubs-sealed` | Is this island standing on its stubs? **Three** halves under one id: every request the fake fetch saw matched a declared table or fixture; nothing got past the stubs to a real host; and nothing the fake *delegated* was answered by the dev server instead of a stub. Each is an error, named with its method, path and reason. Their preconditions differ — the escape half applies to every runtime run, including a project still on module-alias stubs — so each reports only when it has something to say and the `ok` names whichever held. The `ok` counts the fake-fetch requests, not the escapes: zero escapes over zero requests proves nothing. | ok, error | browser | `verify/reach.mjs:107-161` |
| `data-reach` | Reports which tables, RPCs, functions and routes the island actually touched. A readout rather than a gate — it is what makes "where did this island's data come from" answerable without reading the component. | ok | browser | `verify/reach.mjs:47-50` |
| `interaction-effective` | Every scripted `Scenario.interactions` step moved the render or caused a request. A step that changed nothing observable **warns**: either it is decorative, or what it moved is not captured — "a seed describing the same end state is the honest form". | ok, warn | browser | `verify/island-runtime.mjs:38`, `island-runtime.mjs:42-49` |
| `audit` | Meta: says out loud that `responsive` and `a11y` were **not** run, because this was not an `--audit` run. | skip | — | `verify/island-runtime.mjs:235` |

### 4.6 Region checks — static config

`archipelagoConfigChecks` (`verify/region-flows.mjs:300`), plus the static region checks called from `runArchipelagoVerify` (`verify/region-config.mjs:120`). All run without a browser, in the fast loop.

| Check id | Proves | Severities | Run by | Line |
|---|---|---|---|---|
| `registered` | The archipelago file exists and is wired into `ARCHIPELAGOS`. | ok, error | AV, C | `verify/region-flows.mjs:303`, `report.mjs:258`, `report.mjs:260` |
| `region-type` | The region's shared vocabulary is a **type extracted from the app** (`archipelago<TRegion, …>()` or `satisfies ArchipelagoConfig<R, …>`), so `bind` keys cannot drift from it and a rename is a compile error. Skipped on an ocean host (region state is motu's). A region with no islands yet warns instead of erroring — the scaffolder's own output must not open red. | ok, warn, error, skip | AV, C | `verify/region-flows.mjs:316`, `region-flows.mjs:322`, `region-flows.mjs:328`, `region-flows.mjs:334` |
| `coupling` | Which members actually share state. Reports island-written ∩ island-read; falls back to keys read by more than one island and written by none (**coupled through the host**); otherwise states independence explicitly. Warns on a key written here and read by no island — the coupling **escapes** the archipelago. | ok, warn | AV, C | `verify/region-flows.mjs:402`, `region-flows.mjs:410`, `region-flows.mjs:416`, `region-flows.mjs:425` |
| `composition` | Every slot filled by a nested island is a slot this region declares. | ok, error | AV, C | `verify/region-flows.mjs:449`, `region-flows.mjs:454` |
| `ownership` | Every key an island reads has **exactly one** declared owner. Errors: a key written by two different *elements* (two slots may share a producer, two implementations may not). Warns: a key written from a handler body rather than declared `writes` — opaque, undrawable, unejectable. The `provides`/unowned branches are gone: both were empty by construction. | ok, warn, error | AV, C | `verify/region-flows.mjs:484`, `region-flows.mjs:497`, `region-flows.mjs:507`, `region-flows.mjs:515`, `region-flows.mjs:526` |
| `region-ref` | A root prop declared `{ region: '<id>' }` names a region that exists, does not lead back to this one (no cycle, no self-reference), and sits on a region with a `root`. Each is an **error** — refused, never rendered as a default — from `regionRefProblems`, the function the lagoon uses to refuse the placeholder. `ok` names the references (the child's islands and keys are not counted here) and, on the child, the slot it fills. Silent on a region that neither references nor is referenced. | ok, warn, error | AV, C | `verify.mjs` `regionRefCheck`, `lib/region-refs.mjs` |
| `exclusive` | An `exclusive` group is a declaration that can hold: two or more distinct ROOT PROPS, none of them in a second group, on a region with a `root`, written as string literals (a group that cannot be read is an error, not a skip — it would otherwise go unchecked). **Warns** on a `when: 'k'` / `unless: 'k'` slot pair no group covers: the lagoon follows that either/or and nothing holds the page to it. The guarantee itself is the compiler's — `RootPropsOf` refuses two members — so this checks only the declaration. Says nothing on a region with no group and no such pair. | ok, warn, error | AV, C | `verify/region-sources.mjs` `exclusiveCheck`, `lib/lagoon-declares.mjs` `exclusiveDeclared`, core `exclusiveProblems` |
| `host-stubs` | The lagoon's stand-ins still stand in: every export the islands reach for is exported by the stub, and every stub specifier resolves. | ok, error | AV, C | `verify/region-flows.mjs:541`, `region-flows.mjs:543`, `report.mjs:248` |
| `planned` | The survey flag is honest. Errors when a `planned: true` island **is** registered — the flag removes itself, or a survey silently becomes a list of things nobody built. Warns to keep the pending ones visible. | warn, error | AV, C | `verify/report.mjs:277`, `report.mjs:285` |
| `islands-registered` | Every `element:` tag the config references is a registered island tag, excluding `planned` ones. Skips (rather than warning "declares no islands") when every declared island is still planned. | ok, warn, error, skip | AV, C | `verify/report.mjs:294` (computed level), `report.mjs:301`, `report.mjs:306` |
| `channel-source` | Every channel installed for this region was built by the tool — `channelFrom({ to, id, args })`, whose copy into the region comes from the archipelago's `sources`, or the excused `rawChannel('<why>', fn)`. Hand-written channels forget keys, rename them in transit and re-derive what the page already derives. Reads **both** authoring shapes: the per-region `<lagoon>/src/regions/<id>.tsx` module and the shared `src/lagoon.tsx` map. A region with no channels is a **skip**, said out loud — it used to return silently, which is indistinguishable from the check being broken. | ok, error, skip | AV, C | `verify/region-composition.mjs:362`, `region-config.mjs:27`, `region-config.mjs:38` |
| `render-coverage` | Every declared slot is asserted by some flow's `expectRender`. A slot no flow looks at can be wired to anything and stay green — this is the gap that let a merge make one island render another's data. Warning by design, so pre-existing regions do not go red wholesale. | ok, warn | AV, C | `verify/report.mjs:214`, `report.mjs:217` |
| `writes-covered` | Every declared write is driven by some flow's `emit`. Narrow on purpose: it proves the coupling is exercised **at all**, not that the component still emits it (that is `emitted-live`). | ok, warn | AV, C | `verify/island-runtime.mjs:394`, `island-runtime.mjs:400` |
| `catalogue` | For `membership: 'catalogue'` regions: the declared member types are the ones the data actually produces, read from the app's own captured payloads and its own enum. Errors on a member type in the capture that no island declares, and on one absent from the app's enum (unreachable, not merely unexercised). Warns on a declared type absent from the capture, and on a missing `capture` export. | ok, warn, error | AV, C | `verify/island.mjs:90`, `island.mjs:95`, `island.mjs:118`, `island.mjs:131`, `report.mjs:168`, `report.mjs:174`, `report.mjs:176` |
| `region-root` | The region has ONE description. Best case: the archipelago declares `root` — the page and the lagoon compose from the same declaration. Otherwise a hand-written frame is inspected: it may hold only the application's own components, fragments and `island(slot)` calls. Intrinsic elements, literal strings, or a host component no composing file renders are errors. A clean frame is an `ok` that names `root`, unless `regionRoot: "required"`, which makes it an error. | ok, warn, error | AV, C | `verify/region-flows.mjs:180`, `region-flows.mjs:187`, `region-flows.mjs:193`(computed), `region-flows.mjs:291`, `region-flows.mjs:292`, `region-flows.mjs:296`, `region-flows.mjs:297` |
| `island-composition` | The region is made of the **same islands** the application places — comparing the frame's `island(slot)` calls plus motu-filled nested slots against the host's `<X.Island slot="…">` placements. A slot only the frame mounts is shipped by nothing; a slot the app **always** places and the region never mounts has never been looked at. A conditionally-placed slot is a warning (a different *state* of the same page). Skipped under `root`, with no frame, or with no readable host file. | ok, warn, error, skip | AV, C | `verify/region-flows.mjs:84`, `region-flows.mjs:88`, `region-flows.mjs:113`, `region-flows.mjs:153`, `region-flows.mjs:157`, `region-flows.mjs:165`, `region-flows.mjs:193` |

### 4.7 Region checks — runtime (`--runtime` / `--audit`, browser only)

Skipped under `--fast`, which says so via `region-runtime`. Gated at `verify/region-config.mjs:149-163`.

| Check id | Proves | Severities | Line |
|---|---|---|---|
| `region-runtime` | Meta: flows, mutation and the region render need a browser and were **not** run because `--fast` was passed. | skip | `verify/region-config.mjs:156` |
| `lagoon-render` (region) | The region frame renders and every declared, non-planned slot mounts its island. Warns when a declared slot is not placed by this arrangement (behind an overlay or a conditional branch). Warns and skips when the region is layout-less — islands placed individually across the host. | ok, warn, error, inconclusive | `verify/region-config.mjs:174`, `region-config.mjs:182`, `region-config.mjs:195`, `region-config.mjs:200`, `region-config.mjs:208`, `region-config.mjs:211`, `region-config.mjs:218`–`region-config.mjs:222` |
| `page-render` (region) | **EXPERIMENTAL.** Renders the APPLICATION'S OWN PAGE (the `page` override) rather than the region, and asks three things: it mounted without throwing, every declared slot is present in the DOM, and each rendered something. This is the only check that can see a slot the page NAMES but never REACHES — one inside `{isOpen && …}`, a ternary or a `.map()` whose branch does not run. A member of an `exclusive` group the page did not reach is an alternative it did not take, not a miss; two islands of one group reached at once is an **error**. Skips (`0 examined`) when the region declares no `page`. | ok, skip, error | browser | `playwright-lagoon.mjs` `pageRenderLagoon`, `verify.mjs` `page-render` |
| `region-flow` | Every declared flow step ends as declared. Absent evidence, unreadable evidence and step-less evidence each get their own warning rather than a silent pass. A `ReferenceError`/`TypeError` is rethrown — that is a bug in motu, not a region that could not be driven. | ok, warn, error, inconclusive | `verify/island-runtime.mjs:577`, `reach.mjs:231`, `reach.mjs:236`, `reach.mjs:261`, `reach.mjs:279`, `reach.mjs:283` |
| `flow-mutation` | A step that cannot fail is not a check. **By construction**: a step whose `expect` names only keys it just `provide`d asserts the lagoon stored what it was handed (error). **By mutation**: the stimulus is changed crudely and re-run; an assertion that still holds is asserting a constant (error). A mutant that *broke* the region proves nothing and is a warning, not a kill. Counts what came back, not what was sent. | ok, warn, error, skip, inconclusive | `verify/island-runtime.mjs:455`, `island-runtime.mjs:516`, `island-runtime.mjs:538`, `island-runtime.mjs:546`, `island-runtime.mjs:553`, `island-runtime.mjs:560` |
| `flow-calls` | Every backend call a flow step caused (counted by the live feed's `seq` since the previous step; step 1 includes the seed and the mount) was answered by a declaration. A call nothing answered — no fixture, no table, no route — is an error naming the step, the call, who asked and what to declare. A failure a fixture DECLARED (`status: 500`) never counts. No calls at all is a skip, not a pass. Measured on Peps: the four tables its screens 404'd passed every other check. | ok, error, skip | `lib/flow-calls.mjs`, `playwright-lagoon.mjs` (`runRegionFlows`) |
| `wiring-live` | Firing each declared write actually moves the key it claims to write. Precise about its limit: it fires the event **itself**, through the lagoon's emit seam, so it cannot tell you the component still produces it. | ok, error, skip, inconclusive | `verify/reach.mjs:315`, `reach.mjs:319`, `reach.mjs:322`, `reach.mjs:328` |
| `emitted-live` | The other half: an output the component invokes **from an effect** actually fired while the region merely rendered. Narrow by construction — only provably effect-driven outputs are checked, because a click-handler output legitimately never fires in a render-only pass. | ok, warn | `verify/region-composition.mjs:264`, `region-composition.mjs:270` |
| `store-guard` | motu's own runtime ownership guard ("key X is produced by island A, but written by B") did not complain while the region was driven. Surfaced here because the guard fires into a console nobody reads. | error | `verify/region-composition.mjs:46` |
| `laundering` | The host did not write a key shortly after an island emitted — a value derived from what an island did, fed back through the page instead of declared as an output. | warn | `verify/reach.mjs:268` |
| `provenance` | What the region actually **asked for**, through all three doors — a `contract` call, a `traced(...)` host module, a `wire` reach — grouped by door, counted, and followed by WHO asked (`island:<tag>` / `source:<id>`), from one ledger in `@motu/core` (`recordOutbound`/`outboundCalls`). Same grouping the lens shows, deliberately. It used to read the traced-stub list alone, so a region talking only through the contract reported as one that fetched nothing. Warns on an ask attributed to nobody. Skips when nothing was observed. | ok, warn, skip | `verify/island.mjs:63`, `island.mjs:76` |
| `operation-reach` | Whether the thing the region asked for **exists**. `provenance` above records every ask and validates none; given the backend's own list of operations (`operations` in `motu.config.json` — a path, read for its NAMES only) this resolves the two doors that carry an identifier — the wire's `route:<METHOD> <path>` and `fn:<name>` — against it. An ask resolving to no operation is an **error**: either the path is wrong, or the backend has an operation nothing declares. An operation the region *declares it reaches* (`reaches` / `contract.effects`) that no flow asked for is a warning, narrowed that way on purpose — the universe is the whole backend, and reporting it per region would be wrong dozens of times on day one. Asks that name no operation (contract, host module, table, rpc) are counted and named, never dropped. Skips when unconfigured; `inconclusive` when the file is missing, malformed or empty. | ok, warn, error, skip, inconclusive | `verify.mjs` `operationReachCheck`, `lib/operations.mjs` |
| `sources-live` | The runtime half of `sources`. A channel writing a key no declared source claims is an **error**. A declared source that produced nothing is a warning, split by whether its keys hold anything: *seeded, not installed* (the page's own derivation is never exercised) versus *fed by neither channel nor seed*. | ok, warn, error | `verify/region-composition.mjs:367`, `region-config.mjs:11`, `region-config.mjs:19`, `region-config.mjs:27` |
| `what-if-reach` | Which island what-ifs a FLOW reaches. The lane replays the region's flows once more (same page, after every ledger above is read) and reads the store after each step: a what-if is *reached* when a step holds its **situation** — the keys some flow moves that are not lists (`selectedEventId`, `rsvp`, `filter`) — and the flow moved one of them to get there. Context (keys no flow moves, `me`) may differ and is reported. Warns on a what-if **no flow reaches** (named with the nearest step and the keys that still differ) and on one reached only where context it leaves **empty** is set ("a guest": `me` is null, every flow runs as a member). Lists never count as situation: every what-if carries its own copy of the data, so comparing them compares fixtures. Same function as the dock's **Chart** (`chartRegion`, `lagoon-player.ts`); the rule is unit-tested in `packages/react/test/lagoon-chart.test.mjs`. | ok, warn, skip | `verify/region-flows.mjs:447` |
| `region-responsive` | The **composed page** fits every declared viewport. Every island fits alone and the arrangement still overflows — a fixed-rail grid fits nothing on a phone and no island is at fault. Reports `inconclusive` when the region rendered **without the island stylesheet**, because an unstyled page cannot overflow by construction. | ok, error, inconclusive | `verify/region-composition.mjs:302`, `region-composition.mjs:311`, `region-composition.mjs:321`, `region-composition.mjs:328` |
| `region-a11y` | axe over the composed page, in the states the flows establish. Serious/critical violations warn; a page with only minor findings is reported as such. | ok, warn | `verify/region-composition.mjs:338`, `region-composition.mjs:340`, `region-composition.mjs:341` |
| `world-differs` | A flow that names a WORLD depends on it: the flow is replayed without its `world`, and if every step still holds, none of its assertions depends on what the world answers (warn — assert what the world changes, or drop the world). Skipped when the flow does not hold in its own world, since a failing flow fails without it too. | ok, warn, skip | `verify/region-flows.mjs` |
| `no-console-errors`, `remount-stable` | As §4.5, applied to the region mount. | ok, error | `verify/island-static.mjs:573`–`island-static.mjs:581` |

### 4.7b Screen checks — runtime (`motu screen verify [id]`, and `motu check --runtime`)

Each declared screen opens alone, in a fresh page, from its own address (`/?screen=<id>`). A fresh page
per screen because a screen's layout stays mounted across navigation by design, so a re-aimed page would
credit one screen's calls to the next. Screen flows come from `src/screens/screens.evidence.ts`
(`export const scenarios = [{ name, screen, steps }]`).

| Check | Holds when | Levels | Source |
| --- | --- | --- | --- |
| `screen-render` | every screen opens from its own address (`__motuLagoonState.ok`) | ok, error | `verify/screens-runtime.mjs` |
| `flow-calls` | every call a screen or a screen-flow step made was answered by a declaration. One finding per call, naming every screen that makes it (a layout's call is on all of them) | ok, error, skip | `verify/screens-runtime.mjs` |
| `screen-flow` | each step's `click` (the app's own link, by accessible name) or `navigate` (a path, through the app's screen router) ends where the step says: `expectScreen` (the screen open), `expectRender` (text in a slot). No screen flows is a warning. A flow starting on an undeclared screen is an error | ok, warn, error | `verify/screens-runtime.mjs` |

A screen flow is the one place a coupling ACROSS regions is asserted: the shell's sidebar is one region,
the page another, and only the app's own link joins them.

### 4.8 Host-integration checks — `motu integrate check`

`packages/cli/src/commands/integration.mjs`. **100% static**: text over comment-blanked host source, plus ts-morph for prop reconciliation. It never executes host code. Also runs as the last section of `motu check` (`check.mjs:122`).

| Check id | Proves | Severities | Line |
|---|---|---|---|
| `host-sources` | Meta, and printed rather than reported: the scan examined **0 files** under the host root, so nothing is proved about the host either way. **Exits 2 immediately**, before any JSON. | (exit 2) | `integration.mjs:810`–`:816` |
| `composed` | Some host file calls `createRegion(<Id>Archipelago)`. Without it the region verifies green and the app never composes it — and this error **returns early**, since nothing below is answerable. | ok, error | `integration.mjs:174`, `:182` |
| `mounted` | Some host JSX wraps content in `<binding.Region>` (or an alias). Composed but never mounted means the store exists and no island ever renders. | ok, error | `integration.mjs:217`, `:219` |
| `root` | Where the archipelago declares `root:`, a `<binding.Root>` is actually rendered — otherwise the page ignores the region's one description. | ok, error | `integration.mjs:278`, `:280` |
| `placed` | Every declared, live, non-catalogue slot appears as `<X.Island slot="…">` in host JSX, and every placed slot is declared. Warns when a slot sits inside a ternary, `&&` guard or `.map/filter/flatMap/forEach` callback — **placed is not reached** — and when the page never passes props the island binds. | ok, warn, error | `integration.mjs:298`, `:320`, `:519`, `:527`, `:530` |
| `region-ref` | A root prop another region fills is filled with it: `<X.Root>` passes the prop, and it holds the child's `<Y.Region>`/`<Y.Root>` (or an alias) — directly, or through an app component whose own file renders it. Prop never passed, or child never composed (`createRegion`), is an **error**; a prop holding something else is a warning (the composition may be further than this scan follows). | ok, warn, error | `integration.mjs` `regionRefPlacement` |
| `fed` | Every host-fed key (bound, written by no island) is established by something: `seed`, a passed prop, `provide`, or a declared source. | ok, warn | `integration.mjs:373`, `:382` |
| `flow-shape` | The flows seed every key the page seeds on a real load — otherwise the lagoon previews a differently *shaped* region than users get. Skips when flows or page seeds are unreadable. | ok, warn, skip | `integration.mjs:400`, `:402`, `:406`, `:415` |
| `source-owned` | The host does not call `binding.provide('k')` for a key a declared source produces — page and lagoon would answer the same coupling differently. Downgrades to a warning when the source's `produces` could not be read. | ok, warn, error | `integration.mjs:432`, `:442`, `:452` |
| `island-props` | What the page passes on an island element and what the lagoon supplies for that slot are the same set. The page passing environment props the lagoon supplies nothing for is an **error** (previewed and approved without what the page gives it); the lagoon supplying more than the page does is a warning. | ok, warn, error | `integration.mjs:468`, `:487`, `:499`, `:507` |
| `read` | Some host file calls `binding.useRegion(...)` — otherwise the host feeds the region and never reads it back. | ok, warn | `integration.mjs:536`, `:537` |
| `source` | A file that uses the binding actually imports the declared source module (resolved, not text-compared). | ok, error | `integration.mjs:555`, `:557` |
| `duplicated` | The page keeps no `useState` copy of a key an island produces — two copies of one value drift, and the user sees whichever the page renders. | warn | `integration.mjs:571` |
| `contract` | A catalogue member declares no `writes` — it may own nothing, or ownership may simply be undeclared. | warn | `integration.mjs:153` |
| `catalogue` | Informational, never fails: the region is `membership: 'catalogue'`, and this many members are data-summoned rather than source-placed. | ok | `integration.mjs:144` |

**What "sealed" covers, exactly.** The escape half watches for requests leaving to a **non-loopback**
host (`playwright-lagoon.mjs:355`), so a same-origin app route was invisible to it: it goes to the dev
server, which answers an unknown path with its SPA fallback — **200, and `index.html`** — and the
caller then fails trying to read JSON out of a web page. Neither a 404 nor an escape, so nothing
reported it. The third half closes that at the one seam that knows a request was unclaimed:
`installFakeFetch` delegates it, watches the answer, and records it when the reply is an error *or*
HTML. The dev server's own traffic (modules, CSS, source maps) is never HTML, which is what makes the
signal narrow enough to be an error rather than a warning.

**Boundary, stated in `.github/host-rules.md` "Placed is not the same as rendered":** `integrate check` reads the host's source. It can see `<X.Island slot="y">`; it cannot see whether the branch containing it ever runs. The lagoon renders every declared slot unconditionally, so it cannot see it either. The lagoon proves the island works, `integrate check` proves the page names it, and **nothing proves the page reaches it** — that needs the page rendered, in the host's own test runner.

### 4.9 `motu check`'s own rows

`packages/cli/src/commands/check.mjs`. These are printed rows, not report findings.

| Row | Proves | Severity | Affects `pass`? | Line |
|---|---|---|---|---|
| `strict-boundaries` | The host tsconfig enables `noUncheckedIndexedAccess` — `list[0].x` on a possibly-empty list compiles under plain `strict` and throws in the browser. The mechanical half of `default-props`. **Audited, never enforced**; unknown tsconfig prints nothing. | `✓` / `!` | No | `check.mjs:164`, `:172` |
| `generated` | `islands/contracts.generated.ts` exists and matches every component. Fix with `motu sync`. | `✓` / `✗` | Yes | `check.mjs:177` |
| `region-generated` | `coverage.generated.ts` matches `motu.config.json`. A stale one still compiles, still imports, and configures the wrong thing — the symptom is coverage that never records, which looks exactly like a region nobody visited. | `✓` / `✗` | Yes | `check.mjs:186` |
| `skipped` | removal-check did not run because structure checks failed first. | `–` | (already failing) | `check.mjs:216` |
| `removable` | The host compiles with motu removed. Prints `N deleted, N unwrapped, N ejected`, and `· unchanged since the last proof` when the verdict came from the fingerprint cache. | `✓` / `–` | Yes | `check.mjs:221`, `:225` |
| `load-bearing` | The host does **not** compile without motu; prints the first five errors. | `✗` | Yes | `check.mjs:236` |
| `world-declared` | Every name a world or a flow uses resolves: a flow's `world`, a world's `extends`, its regions, its source ids (only sources a channel installs — one declared by module name is re-answered through `seed`), its slots. Printed only when the lagoon declares `defineWorlds`. | `✓` / `✗` | Yes | `lib/worlds.mjs` |
| `world-pins` | No world's seed, and no flow in a world, seeds a key one of the region's RUNNING sources produces — a seeded key is pinned and the world's answer could never show. | `✓` / `✗` | Yes | `lib/worlds.mjs` |
| `world-used` | A world no flow names (and no world extends) is a removal candidate. | `!` | No | `lib/worlds.mjs` |
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

A `<X.Root>` is rewritten to the region's own root component, and which region it is comes from its BINDING (`X = createRegion(<arch>)`, in the file or the module `X` is imported from) before falling back to scoring the props it passes — a region nested in another's slot (`<Equipage.Root />`) often passes none, and was replaced with `null` rather than ejected.

Two exemptions narrow the claim honestly: `@motu/types` is type-only and erases at compile time, so it is **not** stripped (`:118`–`:128`) — the claim is "no *runtime* trace". `@motu/chrome` tags are never unwrapped (`:208`, `:217`), so an app painting with `@motu/chrome/react` legitimately reports load-bearing.

### 4.11 Coverage — `motu archipelago coverage <id>`

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

The measured account from `.github/host-rules.md`: on this project, mid-session, **16 changed files were unattributable, so it ran everything**. After ignoring files that cannot reach a render and mapping the lagoon's per-region module to its region, that dropped to **14 — and it still ran everything**, because `acme:app/dashboard/profile/page.tsx` and four app-side files remained. What does not map is most of a real session: the page, the screen that installs a source, the app-side region type, `roots/lagoon/src/lagoon.tsx`, a shared evidence module, the generated barrels.

So: `--changed` is worth passing, and it is **not a substitute for naming the region**. And a `--changed` run that narrowed to nothing exits **2** with `NOTHING TO CHECK` rather than green (`check.mjs:107-115`).

### `--fast` vs `--runtime` vs `--audit`

| Flag | Engine | Sees | Cannot see |
|---|---|---|---|
| *(none)* | none — AST and file reads | Drift between declarations, source and registry: §4.1–4.4, §4.6, §4.8 | Anything about behaviour |
| `--fast` | in-process **happy-dom** in node (`verify/reach.mjs:34`) | Island mount, console errors, remount stability, `data-flow` via the harness, `input-coverage` | Layout, paint, axe, error-resilience, seed transport, **and every region runtime check** — flows, mutation and the region render are browser-only and are skipped and said (`region-runtime`, `verify/region-config.mjs:156`) |
| `--runtime` | real browser (Playwright/Chromium) | Everything in §4.5 except `responsive`/`a11y`, plus everything in §4.7 | `responsive`, `a11y`, `region-responsive`, `region-a11y` — which say so via `– audit` (`verify/island-runtime.mjs:235`) |
| `--audit` | real browser; **implies `--runtime`** (`check.mjs:68`) | Adds `responsive`, `a11y`, `region-responsive`, `region-a11y` | — |

`--fast` has one honest limit of its own: it is plain node, so the project's `react` and the framework's `react` can meet in one tree and a hook sees a null dispatcher. That is reported as `inconclusive`, not as a defect (`verify/reach.mjs:60-67`) — the browser lagoon dedupes and the same island passes there.

`--audit` is a gate, not a loop: `responsive` and `a11y` are the two most expensive per-island checks, and their answer changes when the **rendering** changes, not when a key moves.

The runtime lane opens the lagoon **once** — one dev server, one browser, one page — and re-aims it. In a real project the first island pays the Vite boot (~15s) and every island after it is under a second per check. Chromium is a one-time install: `cd packages/cli && npx playwright install chromium`.

**Where that install cannot reach the CDN**, point motu at a browser the machine already has:

```bash
MOTU_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome motu check --runtime
```

A hardened CI image, a distro- or nix-packaged chromium, an air-gapped build box and a sandbox whose
egress policy does not list `cdn.playwright.dev` all HAVE a browser; `chromium.launch()` insists on
the exact build the pinned Playwright expects and ignores it. The override is opt-in and **never
silent** — a run that used one carries a `browser` warning, because a build motu did not pin can
render and behave differently from the one it did, and a green `--runtime` that used one is claiming
slightly more than it checked:

```
! browser  not the pinned Chromium — launched `…/chrome` via MOTU_CHROMIUM_PATH —
           the runtime findings below hold for THAT build; a pinned run can still differ
```

---

## 7. Escape hatches

Every documented way to downgrade or excuse a check. Each costs something; the cost is the point.

| Hatch | Declared in | Downgrades | To | Cost |
|---|---|---|---|---|
| `inventedArrangement('why', node)` | the lagoon frame; `packages/react/src/lagoon-overrides.ts:171` | `region-root` error on a frame that draws its own elements or strings | **warn**, with the reason printed beside it (`verify/region-flows.mjs:296`) | A sentence, in the file. Throws if the reason is empty (`lagoon-overrides.ts:172`). It excuses a stand-in, never a copy of the page — the copy drifts. |
| `rawChannel('why', fn)` | `packages/core/src/archipelago.ts:852` | `channel-source` error on a channel not built by the tool | **vouched**, counted as ok (`verify/region-composition.mjs:92`) | A sentence; throws without one. The channel then belongs to no archipelago, so the region-mismatch guard cannot check it (`lagoon-overrides.ts:140`). |
| `planned: true` | an island entry in the archipelago | Existence, mount and placement checks for that island | **skipped** — `islands-registered` skip (`verify/report.mjs:294`), excluded from `render-coverage` (`verify/report.mjs:203`), from the region render's declared list (`verify/region-config.mjs:192`), and from `integrate check`'s live islands (`integration.mjs:139`) | Ownership is **still enforced** — a second claim on its keys fails. And **the flag removes itself**: once the island is registered, `planned: true` is an `error` (`verify/report.mjs:277`). |
| `standalone: true` (island file) or `--standalone` | `element.ts`; `verify/island-static.mjs:362` | `archipelago` warn ("not in an archipelago") | **ok** — "standalone island — couples with nothing" (`verify/island-static.mjs:366`) | Declared on the island, not passed to verify, because it is a property of the island rather than of how you invoked the check. |
| `removable: false` | `motu.config.json`; `packages/cli/src/lib/config.mjs:265` | The whole removal-check | **skip**, `pass: true, skipped: true` (`removal-check.mjs:296`) | The `motu check` PASS line **stops claiming removability** (`check.mjs:264`), and the row prints `–`, never `✓` (`check.mjs:221-224`). |
| `regionRoot: "required"` | `motu.config.json`; `config.mjs:229` | *(inverse)* — it **upgrades** | A clean hand-written frame goes from `ok` to **error** (`verify/region-flows.mjs:291`) | For a project that has finished migrating. The default is `encouraged`. |
| `root:` on the archipelago | the archipelago file | `region-root` and `island-composition` comparison | **ok** / **skip** — one declaration, nothing to compare (`verify/region-flows.mjs:177-193`) | Not a hatch so much as the answer: a real refactor of the host's own JSX. |
| `membership: 'catalogue'` | the archipelago file | The `placed` requirement for data-summoned members (`integration.mjs:141`); the declared-slot list in the region render (`verify/region-config.mjs:189-192`) | members are excluded | The `catalogue` check takes over: declared member types are compared against the app's own capture and enum (`verify/island.mjs:87`). |
| `a11y.fail` / `a11y.ignore` | `lagoon.config.json`; `packages/cli/src/lib/util.mjs:271` | axe violations | `fail` defaults to **`never`** — every violation is a warning; `ignore` drops named rules entirely | The default is the hatch: a check that turns an existing codebase red on the day it ships gets switched off, not acted on. Ignored rules are counted in the `ok` message. |
| `--fast` | flag | Every browser-only check | **skip**, said out loud (`region-runtime`, `verify/region-config.mjs:156`) | Regions are not checked at all. Re-run without it before handing over. |
| `--force` | `motu removal-check --force`; `removal-check.mjs:489` | The fingerprint cache | forces a real `tsc` | Time. |
| `--accept <id>` | `motu archipelago coverage`; `region-coverage.mjs:417` | An uncovered production state | accepted, no longer triaged | One of three answers; the other two are "write a scenario" and "fix the application" (`region-coverage.mjs:530`). |
| `hostSources: [...]` | `motu.config.json`; read at `lib/host-sources.mjs:98`, whitelisted at `config.mjs:217` | *(widens, does not excuse)* the roots both host scans use | — | Read by `removal-check` **and** `integrate check`, which share one resolver. It is the last resort: with it unset, the roots come from the host's own `tsconfig.json`, and only then from the five-directory guess. |
| `@motu/types` import | — | The removal surgery | not stripped (`removal-check.mjs:118-128`) | The claim narrows to "no **runtime** trace of motu". |
| Comments | everywhere | — | *(not a hatch — the opposite)* | `blankComments` runs before nearly every text match (`verify/region-flows.mjs:362-364`, `integration.mjs:67`), so a commented-out `<X.Island>` never counts as a placement and a scaffolded `// bind: {…}` never counts as coupling. Commenting things out removes evidence; it does not excuse a check. |

There is **no comment pragma** — no `motu-ignore`, no inline suppression — anywhere in the checkers. Every hatch above is either a declaration in the code, a key in config, or a flag.

---

## 8. Reading the output

### A finding, on a terminal

`printReport` (`verify/reach.mjs:346`) renders one line per finding:

```
  ! props-match        prop 'compactMode' isn't registered in element.ts props — it can never be set
  ✗ region-root        roots/lagoon/src/regions/login.tsx: draws 3 element(s) of its own (<div>, <h2>, <p>)  (line 12)
  – audit              responsive + a11y not run — they are the `--audit` gate
  ? lagoon-render      Chromium not installed — run `npx playwright install chromium`
  ✓ passed             11 check(s)
    no-bare-fetch, no-history, no-doc-reachout, contract-only-io, ui-layering, default-props,
    no-island-import, registered, props-match, archipelago, render-coverage
```

**The passes collapse; nothing else does.** One island under `--runtime` printed 24 rows, 20 of them
green, and `motu check --runtime` does that once per island — so the findings worth reading were a
fifth of the output. Warnings, errors, skips and inconclusives each keep their own line, because each
is something to act on or to know was not run.

The passing ids are still **named**, not merely counted: a check that examined nothing is already a
`skip` (§1) and so is never inside that line, but a check that never *ran* would otherwise leave no
trace at all, and legible silence is the whole point of the seen-count. `--verbose` prints every row
in full, with its `· N examined`.

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

A sweep (`--all`, or `motu check`) collapses each clean member to one line and prints only its errors and warnings (`printSweep`, `verify/report.mjs:121-141`).

### What is new since your last run

`motu check` re-presents every finding, every time. Measured across three cold-start adoptions and 34
`check` invocations, **half of every finding an agent read was a repeat of one it had already seen** —
in the worst case the same coupling seven times across seven consecutive runs. The messages were not
the problem; the report having no memory was.

So findings are hashed and remembered, and a repeat is marked:

    ✗ rsc-boundary   reaches modules/ee/sso/actions.ts, which is a 'use server' module …  · unchanged

    FAIL  1 error(s), 0 warning(s) · all unchanged since your last run
    FAIL  5 error(s), 2 warning(s) · 4 unchanged, 3 new since your last run

The memory lives in `.motu/cache/last-findings.json` and is **scoped by command**: `motu island verify
<one>` reports a fraction of what `motu check` does, so comparing across them would mark almost
everything "new" and make the marker worthless. Each command remembers its own set. A run that printed
nothing does not overwrite — a command that died early has no opinion, and letting it clear the memory
would make the next delta a lie.

Nothing about the verdict changes: `unchanged` is a reading aid, not a lower standard. A finding that
has not moved is still a finding.

### `--json`

`motu island verify <name> --json` (`verify/island-runtime.mjs:149`):

```json
{ "island": "login-form", "tag": "x-login-form", "pass": true,
  "findings": [ { "level": "ok", "check": "no-bare-fetch", "msg": "…", "examined": 4, "examinedOf": "scenario(s)" },
                { "level": "error", "check": "props-match", "msg": "…", "line": 31 } ] }
```

`motu archipelago verify <id> --json` (`verify/region-composition.mjs:28`): `{ "archipelago": id, "pass": boolean, "findings": [...] }`.

Either verb with `--all` (`verify/island-runtime.mjs:141`, `region-composition.mjs:17`) wraps `summaryOf` (`verify/report.mjs:111`): `{ "islands": [ { name, tag, pass, findings } ] }` / `{ "archipelagos": [ … ] }`.

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

`motu archipelago coverage --json` (`region-coverage.mjs:474-507`) owns stdout entirely — the prose printer is disabled (`region-coverage.mjs:159`) so a parser cannot get half of each. Its payload carries `covered`, `systemic`, `uncovered[]` (each with `share`, `count`, `differsBy`, `fingerprint` and a paste-able `scenario` skeleton), `unreachable`, `keysDiffer`, `caveats` and `pass`.

`motu removal-check` has no `--json` of its own: its summary surfaces under `motu check --json` → `removal`.


## `page-render`: the gap static integration checking cannot close (experimental)

`integrate check` reads the host's SOURCE. It can see `<X.Island slot="list">` and it cannot see
whether the branch containing that JSX ever runs — a slot inside a conditional, a permission gate or a
`.map()` callback is reported as *conditionally placed*, which is a warning rather than an answer. The
lagoon cannot close it from the other side either: the region view renders every declared slot
unconditionally, because motu supplies the arrangement there.

So between the two of them, the lagoon proves the island works, `integrate check` proves the page
names it, and nothing proved the page reaches it.

`page-render` renders the application's own page module in the lagoon:

```ts
// roots/lagoon/src/regions/manage-servers.tsx
import { ManageServers } from '../../../../src/servers/ManageServers';

export const ManageServersPage = () => <ManageServers />;
```

```ts
regions: {
  'manage-servers': { seed, providers, layout: Frame, page: ManageServersPage },
}
```

The page brings its OWN region (its `createRegion`, its `<X.Region>`, its `<X.Island>`), so the lagoon
adds no provider of its own — it installs `providers` and the `wire`, then renders the page.

**`channels` do not fire in this view.** They are installed by motu's `ArchipelagoProvider`, which this
view does not mount. A region fed by a channel renders here with those keys unset, and `page-render`
can then report a slot as unreached when the truth is that nothing fed it. It is fixable — the store is
module state keyed by archipelago id — and it is not fixed, because the project this was built against
declares no channels, so the fix could not be failed on purpose before being believed.

The lagoon's own `seed` does not apply either, and that one IS by design: the page establishes its own
first paint through its binding's `seed` and its own providers, which is exactly what production does.
Open it at `?region=<id>&view=page`.

**Measured, on shlink.** Putting the `list` island behind a branch that never runs:

    motu check          PASS  2 island(s), 1 region(s), removable
    integrate check     PASS  1 region(s) integrated
    page-render         ✗     the page renders, but never reaches: list

And making the page throw on load gives the stack rather than a blank screen, because the view wraps
the page in an error boundary that marks the failure — a white screen and a slow page are otherwise
the same thing to a check.

### What it does not do, and where it does not work

It asserts *presence*, not content: no interaction, no flow replay, no text assertions. Those are the
region's flows, and making the same claim twice against a slower page buys nothing.

It needs the page module to be IMPORTABLE INTO A BROWSER BUNDLE. A React page on a Vite or plain-React
host qualifies. **A Next.js server component does not** — it is not a client module, and no amount of
lagoon makes it one. The custom-element mount path refuses `view=page` outright and says why, rather
than falling back to the region view and answering a different question.

It is EXPERIMENTAL: one region, one host shape, evidenced above. Treat the boundary as real until a
second host shape is on that list.
