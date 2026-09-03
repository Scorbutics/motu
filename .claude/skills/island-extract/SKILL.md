---
name: island-extract
description: Turn UI the application ALREADY HAS into a motu island, and iterate against `motu island verify` until it passes. Two shapes, chosen by the project's `host` — on a React host (next/vite/none) the island WRAPS the component the app owns, and no component is written; on an AngularJS ocean host there is nothing to wrap, so the legacy source (controller + template, JSP) is rewritten as a mode-agnostic React component. The CLI owns everything deterministic (scaffolding, config edits, verification); this agent owns the judgement. Invoke by asking to "make <component> an island", "extract <component> into a motu island", or `copilot --agent=island-extract`.
---

# island-extract — Custom Agent

You take one piece of UI the application **already has** and make it a **motu island**: something
that renders in the *lagoon* against fixtures, alone, and only later gets integrated into the real
page. You do the *judgement* work; the `motu` CLI does the *deterministic* work — scaffolding, config
edits, and verification. **Lean on `motu island verify`: it is the loop you close on, not your own
eyeballing.**

Which judgement that is depends on Step 0, and getting it wrong is the one mistake this agent can make
that no check will catch — a forked component drifts silently, and a rewritten one is a second copy
nobody diffs.

Iterate with `--fast` (happy-dom, no browser); spend the browser once at the end with `--runtime`, and
`--audit` before integrating. See "Which level, when" in `island-create.agent.md`.

Read `README.md` first (terminology, "The loop", "The rules that make islands verifiable", "Non-goals").
Do **not** invent rules — the authoritative, mechanical rule set is whatever `motu island verify`
enforces. Never work around a verify failure; fix the island.

## Step 0 — WRAP or REWRITE? Read it from the config, do not judge it

`motu.config.json`'s **`host`** decides, because it answers whether a React component for this region
already exists. Read it before anything else; the rest of this agent forks on the answer.

| `host` | shape | what you produce |
| --- | --- | --- |
| `next` / `vite` / `none` | **WRAP** | no component at all — the island points at the one the app owns |
| `angularjs` | **REWRITE** | a mode-agnostic React component under `ui/`, authored from legacy source |

**WRAP is the default on any React host, and copying is the error there.** `island('x-tag', Component)`
points at the application's own component; duplicating it into `ui/` forks it and lets the two drift,
which is the opposite of migrating incrementally. A wrapper that exists only to install providers or
draw chrome is motu-only code sitting in someone's repository — exactly what adopting motu is supposed
to avoid. If you believe a wrap genuinely needs a wrapper, say why in your report before writing one.

**REWRITE only applies where there is nothing to wrap.** An AngularJS controller plus a JSP partial is
not a React component, so one has to be authored. `demo-app/src/ui/` is what that looks like.

`isolation` is NOT this discriminator, however it reads: it selects shadow vs light DOM, a styling
decision, and all three reference projects are `light` — including the AngularJS one.

## The anatomy you are producing

An island is a **mount point** plus, only in REWRITE, a **ui component**:

1. `src/islands/<kebab>.island.ts` — the mount-point registry row: `tag` → component + the `contract`
   (input / output / coupling), plus the `legacy` fit strategy where the host has a legacy skin. In
   WRAP this is the ONLY code file you produce.
2. `src/ui/<kebab>/<Pascal>.tsx` — **REWRITE only.** The plain, mode-agnostic component (props in,
   callbacks out). Lives in `ui/` (the "mainland") so mount points can never import each other — `ui/`
   may import `@motu/contract`, `shared/`, and other `ui/`, but never `islands/` or `archipelagos/`.
3. `src/islands/<kebab>.evidence.ts` — the island's scenarios, and its fixtures where it fetches.
4. `src/archipelagos/<id>/<id>.archipelago.ts` — archipelago membership (only at integrate).

## Step 1 — Read what exists

### WRAP — find the component, and what it cannot render without

Locate the component the app owns and the specifier the app itself imports it by (`@/components/foo`,
a relative path) — that string is what the island will point at, so use the app's own spelling.

Then answer the question the lagoon will ask, which is the whole cost of this step: **what does it need
that a bare mount does not give it?** Walk the component and everything it renders for:

- **Providers** — a context, a theme, a query client, an i18n root, a store `<Provider>`. These are what
  it *cannot render without*.
- **Its own data access** — a fetch, a hook that fetches, a GraphQL query. In the lagoon that is answered
  by a channel or the mock transport, never by letting it reach the network.
- **Host ambient** — router, session, `document` reach-out, a store read with no prop.
- **Required props with no default.** An island must render from defaults alone; a required prop is a
  default you have to add or a value that belongs in `seed`.

Write these down as a list. It is the input to Step 5, and it is the honest answer to "how much does
adopting motu cost on this component" — usually a few lines, occasionally a reason not to start here.

### REWRITE — read the legacy component

Locate the ocean source (ask the developer for the path if unclear). For an ocean-app AngularJS
screen that is typically:

- the controller/JS: `~/dev/ocean/web-console/src/main/webapp/**/<name>.js` (or `test-console/...`),
- the template/partial: `~/dev/ocean/web-console/src/main/webapp/dist/partials/**/<name>.html`,
- the backing REST/service Java it calls.

Identify: what the component renders, what user actions it emits, and **every server call** it makes
(`$http`, `$resource`, a REST endpoint). Write these down — they drive the contract mapping.

## Step 2 — Scaffold

```bash
# WRAP — point at the component the app owns; nothing is written under ui/
motu island create <name> --from '@/components/members/MemberNotes' [--export MemberNotes]

# REWRITE — scaffold a component stub under ui/ to author into
motu island create <name>               # kebab, e.g. member-notes
```

`--from` takes the specifier **the application itself uses**; `--export` names the component inside
that module when it is not the island's Pascal name. Either way this writes the registry row and the
evidence stub and prints the paths. If you find yourself scaffolding a `ui/` component on a React host
and then importing the app's component into it, stop: that is the fork, and `--from` is the answer.

## Step 3 — Data access

**WRAP:** the component keeps whatever data access the app gave it — you are not rewriting it. What
changes is who ANSWERS in the lagoon: a `channel` for anything that reacts, the app's own captured
mock data for what it reads. If the app's transport is not motu's, `observeForeignTransport` lets the
lens show what actually fired, and `unservedOperations()` catches the handler you forgot — the failure
that renders an empty page and looks like a working one. Skip the rest of this step; there is no
generated contract on a React host.

**REWRITE (ocean host):** islands never do bare `fetch`/`$http`. All server I/O goes through
`@motu/contract` (`contract/src/index.ts`). For each legacy call:

- If a matching `@BrowserCallable` method already exists in the contract, use it.
- If not, annotate the CDI service method in the backend with `@BrowserCallable` (and `@Roles` as
  appropriate — motu never reimplements authorization), rebuild the backend so `dev.motu:apt` emits a
  fresh `motu-manifest.json`, then regenerate:

  ```bash
  motu codegen                           # regenerates contract/src from the built manifest
  ```

  Prefer reusing an existing browser-callable method over exposing new surface. Only `@BrowserCallable`
  methods are ever reachable — everything else stays invisible by design.

## Step 4 — The component

### WRAP — write NO component

There is nothing to author here, and that is the point: the island IS the application's component.
What Step 1 catalogued does not go into a wrapper, it goes into the lagoon override, and each piece has
exactly one right home:

- what the component **cannot render without** → `providers` in the lagoon overrides, installed in
  EVERY view, per island;
- the **arrangement** of a region → the archipelago's `root` where the region has one, otherwise
  `layout` in the overrides, which points at the application's own layout component and is region-view
  only (see "Two ways a region composes" below — an extraction normally uses `layout`);
- the **data** — a widget row, props, a record → `seed`;
- anything that **reacts** — the stand-in for the page's fetch → a `channel`, installed in every view,
  so the checks that drive the region see the same answers a human does.

Get this split wrong and the failure is invisible in the region view and fatal in the mountpoints view
— the one the flow checks drive — so it reads as "the region rendered nothing" rather than "no
providers". If a region renders in one view and not the other, suspect this before anything else.

**Providers must be IDEMPOTENT.** The frame installs them for its own chrome and each island installs
them for itself, so they nest. Fine for context providers, fatal for a `<Router>` — React Router throws
and every card renders as "Invalid Configuration". Gate the ones that cannot nest
(`useInRouterContext()`).

Two things the component itself may still need, and they are edits to the APP, not to a copy of it:
a **default for every prop** (an island must render from defaults alone), and `reads: ['key']` on the
island when it subscribes to a host store with no prop — otherwise the key is written by an island,
read by nobody motu knows about, and `coupling` reports a real coupling as one that escapes.

### REWRITE — write the component body

Translate the legacy template + behaviour into `src/ui/<kebab>/<Pascal>.tsx`. It MUST obey
the island rules (verify enforces them):

- **Mode-agnostic:** no `fetch`/`XMLHttpRequest`, no `history`/`pushState`/`location`, no
  `document.querySelector` into the host. All server I/O via `@motu/contract`.
- **Props in, callbacks out.** Outward navigation/actions are *intents*: expose an `onXxx` callback
  (wired later to `host.navigate` / `host.action`), never touch the URL yourself.
- **Renders from default props alone** — give the props param a default (or destructure with defaults),
  so the lagoon can mount it with nothing. This is what makes the lagoon a real test.
- Handle the `403` (`MotuError`) case like `CompanyLookup` does when a `@Roles` method is denied.

Use the existing islands (`CompanyLookup`, `MemberResults`, `MemberSearch`) as the reference for style,
error handling, and the debounce/sequence pattern.

## Step 5 — Evidence (and, on an ocean host, the legacy fit)

Both shapes need **scenarios**: two or more seeds whose output DIFFERS, or `motu island verify`'s
data-flow check fails — that check exists because fake evidence is worse than none. An island with no
props at all still gets a scenario; drive it through a channel or a stubbed host module instead.

**WRAP: do not hand-write fixtures the app already has.** Its own tests and stories need the same data,
so a repo usually carries a capture plus a script that refreshes it (Twenty: `scripts/mock-data/` →
`testing/mock-data/generated/`). Point at THAT. Both sides are then the app's artifacts and motu only
compares; invented data in a lagoon frame is a third copy nobody diffs. Type any shared evidence module
against the app's own types with `import type`, and import it with a RELATIVE specifier — `@/` does not
resolve in the loaders that read evidence files, and that failure is silent.

On an ocean host, additionally:

- Fill `src/islands/<kebab>.evidence.ts` with responses whose **shape matches the
  contract return types** (see the method's `call<…>()` return in `@motu/contract`). Include the
  `roles` a caller needs so role-gated paths can be demoed offline.
- For REACTIVE behaviour (e.g. type a filter → results narrow), a fixture `response` may be a
  **function of the call args** — `response: (args) => filter(dataset, args[1])` — a client-side STUB
  (not backend fidelity) so ANY input works offline, not just recorded ones. Declare `scenarios` (two+
  seeds whose output differs) so `motu island verify`'s data-flow check proves the seam.
- The island's `contract` declares INPUT (`input` props), OUTPUT (`output` events), and COUPLING
  (`coupling.hostScope`/`hostScopeKey`/`adopt`/`inheritScope` — only for AngularJS islands reaching
  host scope). Set the required `legacy` strategy: `fill`/`inline` are CSS-only (most islands);
  `structural` means the component reads the injected `fit` prop and branches (see `MemberActions`).

## Step 6 — Close the loop in the lagoon

```bash
motu island verify <name>               # static + config + REAL-browser lagoon mount
```

The runtime layer boots the focused lagoon and mounts the island in **Playwright/Chromium**, so real
layout/CSS/paint are checked — not just an in-process DOM. One-time setup for the browser:
`cd packages/cli && npx playwright install chromium`. Use `--fast` for a quicker in-process happy-dom
mount when iterating, but let the real-browser check be the gate before you integrate.

Fix every `✗` and re-run until it prints **PASS**. For visual iteration, run the lagoon and open it:

```bash
motu lagoon dev                         # the gallery: every archipelago + a switcher, mock data
motu lagoon serve --watch --host        # ...as one self-contained page, reloading, openable on a phone
# the single-island focus (what verify drives) is lagoon.html with MOTU_TARGET=island:x-<name>
```

Do not proceed while verify is red. `--json` gives a machine-readable report if you are scripting.

## Step 7 — Integrate

Pick (or create) the archipelago for the page:

```bash
motu archipelago create <page-id>                   # if the page has no archipelago yet
motu island integrate <name> --archipelago <page-id> [--slot <slot>]
```

Then:

- Fill the `TODO(motu:wiring)` in the new `IslandSpec`: `bind` element props to shared store keys, and
  handle the island's events (`on`) by writing the store or firing a `host` intent.
- Place the island where the page should mount it — the one stack-specific edit the CLI does not do.
  On a React host the page composes the region with `createRegion`, places each declared slot and reads
  it back with `useRegion()`; on an ocean host it is a `<motu-island slot="…">` marker in the legacy
  template, and for progressive replacement you wrap the original fragment with `legacy-toggle="true"`
  so it defaults to legacy and can be toggled per slot.
- Then run `motu integrate check` — the last mile the lagoon cannot answer. The one that bites on a
  React host: has the page stopped keeping its own `useState` of a key the island now produces?
- If the archipelago layout is an imported constant, add the marker to that layout too (integrate prints
  the exact marker when it can't edit it automatically).

## Step 8 — Verify green + typecheck

```bash
motu island verify <name>               # expect PASS (membership now satisfied)
motu integrate check <region>           # does the HOST compose, place and read the region?
motu island snapshot --all --remote --changed        # did anything you touched MOVE? (~11s scoped)
motu archipelago snapshot --all --remote --changed   # did the composed page move? (~15s scoped)
```

The two snapshot runs are the last thing you do. Wrapping an existing component often touches shared
code on the way — a default, a class, a token — and that lands on islands you never opened. LOOK at any
`.motu/snapshots/*.diff.png`, then `--accept` only what you meant.

Then the host's OWN build or typecheck (`pnpm typecheck` in this monorepo). motu checks its own
declarations; only the app's build can tell you the app still compiles.

## Two ways a region composes, and which one an extraction uses

A region's arrangement lives in ONE of two places, and both are supported:

- **`root` on the archipelago** — the application's own layout component, with `slots` mapping its
  props to this region's islands. The page renders `<X.Root results={…} />` using its own prop names
  and never writes a slot; the lagoon renders the SAME component from the SAME map. There is no second
  description, so the two cannot differ. Safe by construction.
- **A hand-written lagoon frame** (`layout` in the overrides) — a second description of the page,
  checked but not eliminated: `island-composition` compares WHICH islands the region is made of
  against what the page places, and `region-root` refuses arrangement the frame invented. Nothing
  compares the ARRANGEMENT itself.

**An extraction uses the frame, and that is correct rather than a concession.** You are working on a
page that already exists and already expresses its own arrangement in JSX. Moving it to `root` is a
region-level refactor of the host's own code; doing it in the same step as pulling out one island
couples two changes and hides the risky one. Extract the island, look at it in the lagoon, then decide
about the region.

THAT DECISION IS A STAGE, NOT A VERDICT: adopt as a thin overlay (islands in the page's own JSX +
a frame), migrate one region to `root` when you already have a reason to open its page, then set
`"regionRoot": "required"` when the last one is done. The archipelago-build skill has the arc and
the two hazards a migration carries that no check sees. A frame that genuinely must draw says so
once with `inventedArrangement('why', <…/>)` — a warning, and warnings do not fail `motu check`.

`motu archipelago create` is the opposite case and scaffolds `root` first: a NEW region has no page to
restructure, so the safe shape is free there.

**If the region ALREADY declares a `root`**, `motu island integrate` adds the slot to `slots` for you
and prints the two things it cannot derive — the prop to add to the root component, and the line the
page must pass. Do both, or the island is declared and never placed.

`region-root` reports which shape a region is in on every run. A project that has finished migrating
sets `"regionRoot": "required"` in `motu.config.json`, and a frame becomes an error from then on.


## Guardrails

- **On a React host, never copy the component.** `--from` exists so the island points at what the app
  owns. A `ui/` copy forks it, and nothing checks that the two still agree.
- **Do not write a wrapper to install providers or draw chrome.** Providers go in the lagoon override,
  arrangement in the region's `root` or its `layout`, data in `seed`. A wrapper is motu-only code in
  the app's repository.
- **Never invent arrangement in a frame.** A frame may hold only the application's own components,
  fragments and `island(slot)`. `region-root` fails on an intrinsic element or a literal string,
  because a frame that draws its own version of the page drifts from it — acme shipped a lagoon saying
  "On récupère ton accès" over a page saying "Mot de passe oublié ?" for weeks, entirely green.
- Never add runtime module loading, federation, per-island versioning, or island-to-island imports
  (see README "Non-goals"). Islands coordinate only through the archipelago store and DOM events.
- Never widen backend surface beyond the specific `@BrowserCallable` method you need.
- Keep the motu terminology (island/ocean/archipelago/lagoon/mainland) in prose only — imports and
  type names stay literal.
- REWRITE only: the end state is the mainland — the component should de-wrap trivially, so keep it a
  plain component. In WRAP the component is already the app's own and there is nothing to de-wrap.

## Before you hand it over: motu did not test your logic

`motu check` is green when the region COMPOSES — islands placed, declared couplings carrying, every
state rendering. It runs no typecheck and no test runner. Two things are yours:

- **logic inside the component** (a filter that stops matching a field, `some` for `every`, an
  off-by-one) — renders fine, composes fine, passes everything here;
- **the path from a user's action to a declared output** — a flow that EMITS the island's declared
  event enters the region past the component's own handler, so a handler that drops its argument
  passes it. Write `{ click: '<accessible name>' }` instead when the control has one: the component
  fires its own output, by the path a person takes. Accessible name only — no selectors, no `fill`,
  no waits. Anything beyond one click is Playwright's job, not motu's.

Measured on a real screen: of eight injected regressions, the project's unit tests caught five and
motu's flows caught one — and that one was a render assertion the tests missed. Different
instruments. If the component you just wrote or wrapped carries logic, say in your handover that it
needs unit tests in the host's own runner, and do not present a green `motu check` as coverage.


## Before you hand this over

A person has to be able to OPEN what you built. Start (or confirm) the detached lagoon, which
announces itself to the shared host under a slug scoped to your branch:

    motu lagoon dev --detach
    motu lagoon states          # the address of each declared state

**End your report with the live URL and the one or two states you want looked at.** A passing check
describes files; the work is a rendered region, and until someone opens it nobody has seen it. Every
`motu check` verdict now prints the live URL, or how to start one if there is none.

And say plainly what motu did not check: the host's typecheck and its test runner, both of which are
yours to run.
