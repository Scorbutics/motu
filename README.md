# motu

motu is a closed verification loop for building UI against a legacy application that has no loop
of its own. A new component is built and tested in isolation — no legacy app running, no session,
against recorded fixtures — and only integrated into the legacy page once it passes there. Applied
to a Jakarta EE + AngularJS app, the same loop happens to let you migrate the UI incrementally,
reusing the legacy backend's database, business logic and authorization without reimplementing any
of them. Incremental migration is the consequence of the loop, not the point of it. Proven against
a real Jakarta EE + AngularJS ocean app (`~/dev/ocean`).

motu is built agents-first. Generating a React component is cheap; what's scarce is a fast,
deterministic loop an agent can close on its own, without a human eyeballing whether it broke the
host. Every constraint below exists to keep an island's output mechanically verifiable.

## Terminology

- **Island** — a component embedded in a legacy page (an established term this project didn't
  invent).
- **Ocean** — the legacy application the islands sit in.
- **Archipelago** — the islands of ONE PAGE, referenced by slot and scattered wherever the page puts
  them, sharing a store (`Store` in `@motu/core`) instead of talking to each other directly. It is a
  declared grouping, never a DOM container: scoping one to a subtree puts a boundary through the
  middle of any coupling that crosses it. A page is a MIX — most islands couple with nothing, being
  fed by props or reading the backend themselves, and that is normal. You declare the grouping;
  `motu contract check` derives the coupling graph from the bindings.
- **Lagoon** — isolated mode: an island rendered with no ocean present, against fixtures
  (`MockTransport` in `@motu/runtime`). Where the loop closes. Realized by the `demo-app/roots/lagoon`
  app: `main.tsx` shows every archipelago with a switcher, and a `lagoon.html` entry focuses one
  island/archipelago in isolation (what `motu island verify` drives).
- **Mainland** — the standalone destination the code migrates toward once the ocean recedes.
- **Channel** — the link between the ocean and the islands.
- **Motu** — the name of this project: a *motu* is one of the low islets forming the rim of
  an atoll — the island that holds the ocean back and makes the lagoon possible. Which is the
  whole trick: no calm water to verify in, no loop.

These terms stay in the prose. They do not appear in imports or type names — those stay literal
(`Store`, `Transport`, `HttpTransport`, `MockTransport`).

## The loop

1. **Build** the island as a plain, mode-agnostic component (`demo-app/src/ui/`) that calls the
   generated contract and emits events — nothing else.
2. **Verify in the lagoon**: mount it with `MockTransport` fixtures, no session, no legacy CSS, no
   AngularJS digest cycle. The feedback loop here is closed and fast, so an agent can iterate
   against it without asking a human to check the real page.
3. **Integrate**: declare the island (`demo-app/src/islands/<kebab>.island.ts` — a thin
   custom-element wrapper over the ui component), add it to an archipelago, and drop a
   `<motu-island slot="…">` marker into the legacy template.

The ordering matters because of what it rules out. Verify in the lagoon first and a failure has one
cause: the component is wrong. Drop an unverified component straight into the ocean and a failure
is ambiguous between "my component is wrong" and "the host did something" — legacy CSS bleeding
in, a stale digest, a session that expired mid-test. The lagoon exists to remove that ambiguity
before integration, not to replace integration testing entirely.

## One artifact, one deploy, one version

> Islands are a compile-time composition mechanism, not a runtime one.

There is one `bridge.js` build, one `lagoon` build, one contract, one version — the backend's.
Most of the pain associated with micro-frontends — duplicated framework payloads, version skew
between independently deployed fragments, debugging across bundle boundaries, fragmented auth,
integration-only test coverage — comes from assembling independently built artifacts at runtime.
motu refuses that composition model outright, so those problems have nowhere to occur rather than
needing to be mitigated after the fact.

## Scope: the lagoon has no backend

The lagoon proves **a component and its declared boundary**: one island or one page's islands, no
backend, fixtures, deterministic, headless, exit-coded, publishable as a page that opens on a phone.

It does not prove **the system**. Cross-page behaviour — island A changes what island B shows on
another page — is mediated by the database, and the honest tools for it are the real app running
locally with auth bypassed, plus Playwright. Simulating that backend inside the lagoon (a stateful
fake, or the schema in pglite) was investigated and declined: it reimplements business logic that
cannot be diffed against the original, and the moment the lagoon has a backend it loses determinism,
one-cause failures, speed, and the artifact with nothing behind it. What is left is a worse local
environment.

So motu does not compete with integration tests. It makes them unnecessary for the FIRST class of bug.

## What motu is for in a healthy project

Not a test runner — a **boundary instrument**. A component's inputs, outputs, ambient needs and
couplings are declared and mechanically checked, and the lagoon is the PROOF OBLIGATION that keeps the
declarations honest: a component that cannot render alone against fixtures has a wrong boundary.

That forcing function is the point. Declarations without one rot — this repo has watched scaffolded
fixture files sit empty for months, and a `legacy` field be declared on every island while nothing read
it. The value scales with how much implicit coupling an app has accumulated; a small, prop-driven
codebase with no coupling pain gets little beyond the contract seam.

## Non-goals

These are declined by design, not gaps on a roadmap. Requests for any of them will be turned down:

- No runtime module loading, no federation, no import maps.
- No per-island versioning — one version, the backend's.
- No island registry mutable at runtime, no plugin API.
- No island-to-island direct imports — the store (`@motu/core`) and DOM events only.
- No orchestrator: the ocean's existing templates decide where islands mount via
  `<motu-island slot="…">`. motu has no shell because the legacy app *is* the shell.
- No SSR, no cross-origin production deployment.
- No generic ORM-to-REST exposure — only methods explicitly annotated `@BrowserCallable` are ever
  reachable; everything else is invisible by default.

## The rules that make islands verifiable

Most of these are now mechanically enforced by `motu island verify` (see *The motu CLI* below); the
rest remain convention, upheld by code review and by the fact that violating them makes the lagoon a lie:

- An island must render correctly from its default props alone, with no channels connected and no
  fixtures loaded. This is what makes the lagoon a real test rather than a demo (see
  `CompanyLookup`'s default `prefix = ''`). **Defaults belong in the component**, where they are an
  improvement to the app rather than a motu artifact — and a default that cannot be honest in
  production is not a default, it is missing evidence: put it in the island's `.evidence.ts` as a
  scenario seed. (`motu island defaults` classifies them.)
- Islands never touch `history` or `pushState`. The ocean owns the URL — outward navigation is an
  intent (`HostBridge.navigate`) that only the composition root turns into a real navigation
  (AngularJS `$location`, `window.location.hash`, …).
- Islands never reach outside themselves — no `document.querySelector` into the host. That reach-out
  is confined to composition-root / framework code (`archipelago-element.ts`, `island-element.ts` in
  `@motu/core`, the AngularJS adapter's channels), which is allowed to touch the DOM because it *is*
  the seam, not the island.
- All I/O goes through the generated contract (`@motu/contract`) and the single `call()` seam in
  `@motu/runtime`. No bare `fetch` in a component.
- Shared UI state is declared in one place: the archipelago's `Store`. Server data doesn't belong
  there — this repo has no shared query-client yet, so today "server data" simply isn't cached in
  the store; a component refetches through the contract instead.
- Channels are wired at the composition root (`defineArchipelago`, `installChannels`). Islands read
  the store via `bind`; they never subscribe to the ocean directly.
- An island declares its **ambient**: the host capabilities it reaches for without being handed them —
  a React context, a session hook, a feature gate, a service module it imports directly. This is the
  coupling most likely to make an island unmountable somewhere else, and it used to hide in the
  lagoon's `alias` table, where standing a module down looks like build configuration.
- Under a React host the page owns the **arrangement** and the **vocabulary**: the layout is a
  component in the app (motu renders the same one in the lagoon), and the region's shared keys are a
  TYPE in the app that the archipelago's `bind` is checked against. motu references both; it restates
  neither. Removing motu leaves both behind, working.

## Exit

An island is a plain component (`demo-app/src/ui/`) plus a thin custom-element wrapper
(`defineReactElement`, in the island file). Ship it to the mainland by dropping the
wrapper and mounting the same component directly. The `ui/` layer is designed to be that survivor —
it depends only on `@motu/*` + the contract, so it lifts out cleanly. There
is no measured diff size for this in the repo yet — treat "near-trivial diff to de-wrap" as a design
target, not a verified number.

## Backend

`motu-apt` is an annotation processor that scans for `@BrowserCallable` on existing CDI service
beans/methods and emits `motu-manifest.json` at compile time (Java type → TypeScript type
mapping, `@Roles` extraction). `@motu/codegen` turns that manifest into the typed `@motu/contract`
package. `motu-runtime`'s `MotuEndpoint` dispatches browser calls to the exact same CDI
contextual reference the rest of the app would use, so the host's existing `@Roles`
interceptor fires unchanged — motu never reimplements authorization, it only translates the
outcome to an HTTP status.

Enforcement is deny-by-default at the annotation level: a method is reachable only if it (or its
class) carries `@BrowserCallable`; anything else returns 404, indistinguishable from unknown. There
is no separate deploy-time gate beyond that — the safety net is that a backend signature change
regenerates the contract, which then fails `tsc` wherever the old shape was used, rather than
failing silently at runtime.

## What motu is not

motu is not a micro-frontend framework, not an orchestrator, and not a way to split a healthy
application into independently deployed pieces. It is a transitional tool with an explicit end
state: the ocean recedes, the mainland is what's left, and motu's wrappers come off. Honest
limits: CSS isolation is containable (shadow DOM, scoped stylesheets) but not solved — the lagoon
cannot reproduce legacy stylesheet collisions, AngularJS digest timing, or session expiry, so a
small integration suite alongside the lagoon remains necessary. The archipelago — the shared store
an island's siblings read and write — is the most likely place for coupling to accrete back in.

## The chrome palette

> Where it lives: `packages/chrome` (`@motu/chrome`) — tokens, the stylesheet built from them, and the
> few server-rendered shapes. It was carved out of `@motu/core/toolbar.ts`, whose own comment claimed
> the palette was in "one place, so the tooling cannot drift into a second brand colour". That was
> true for everything a bundler compiles and false for everything else: the lagoon host renders pages
> from bare node, could not import a single token, and grew its own dark-slate palette — the second
> brand the comment forbids. Plain ESM with no dependencies is the only form Vite and node both read,
> so the tokens moved down to where both can reach them. `@motu/core` re-exports `MOTU_CHROME`, so
> every existing import is unchanged.


motu's tooling is themed by CSS tokens (`MOTU_CHROME` in `@motu/core`), and the teal default is only a
default. Inside a lagoon it is usually the wrong colour: the page below belongs to a real application
with its own primary, and tooling in an unrelated hue reads as something that wandered in. So a project
points motu's chrome at its own colours in `lagoon.config.json`:

```jsonc
"chrome": {
  "primary": "hsl(var(--primary))",              // the host's OWN token, by reference
  "onPrimary": "hsl(var(--primary-foreground))"  // required whenever primary is light
}
```

Referencing the host's token rather than copying a hex means a rebrand in the app moves the tooling
with it, with nothing to keep in sync. `--host next` scaffolds exactly this, since a shadcn app already
exposes both. `onPrimary` matters more than it looks: the chips hardcoded white text, which is
unreadable the moment a host's primary is a bright yellow.

A brand primary is often tuned for a small accent and is too loud once it covers the water and every
chip. Three ways down, in order of preference:

```jsonc
"primary": "hsl(var(--primary-control))"                       // a darker token the app already has
"primary": "color-mix(in srgb, hsl(var(--primary)) 70%, #000)" // derived, still follows a rebrand
"primary": "#8a7f12"                                           // a literal, when nothing else fits
```

Both lagoon entries read the same `chrome` from `lagoon.config.json`, so the gallery and the focused
target cannot disagree. `bootstrapLagoon` also takes `chrome` directly, for a value the JSON should not
carry — override it inline in `lagoon.tsx`:

```ts
chrome: { ...config.chrome, primary: 'color-mix(in srgb, hsl(var(--primary)) 70%, #000)' },
```

Two things deliberately do **not** follow the brand, because they are readouts rather than decoration:

- The **water** keeps its shape — calm for mock, brighter and faster for a live backend, flooded amber
  under the legacy fit. `applyMotuChrome` re-derives the deep→shallow ramp around the host's hue and
  leaves the state variations alone.
- The lens's **semantic** colours: the input / output / coupling triad, and ok / warn / broken. Give a
  yellow-branded app a yellow "ok" and it sits indistinguishably beside an amber "warn"; make INPUT
  follow the brand and it collides with OUTPUT's amber. `caution` and `idle` are semantic for the same
  reason.

## Layout

```
motu-runtime/   Backend adapter JAR (deployed in the EAR): @BrowserCallable annotation,
                 MotuRegistry, MotuEndpoint dispatcher, MotuAssetEndpoint (serves bridge.js).
                 Invokes existing CDI beans through the container so @Roles/RolesInterceptor fire.
motu-apt/       Annotation processor emitting motu-manifest.json for @BrowserCallable methods
                 (Java -> TS type mapping, @Roles extraction).
packages/                 # the framework (published @motu/* packages)
  runtime/       Transport seam: configure(), call(), HttpTransport, MockTransport (+ recorder).
  core/          Store, <motu-island> + <motu-archipelago> custom elements, defineIsland, channels,
                 provide() seam, theme axes.
  react/         defineReactElement + registerElements + defineMotuApp + defineLagoon.
  adapters/
    angularjs/   AngularJS adapter (defineAngularElement, channels, host bridge) + verify contribution.
    next/        Next.js adapter (nextHostBridge, <Archipelago>) + RSC-boundary verify contribution.
  codegen/       manifest.json -> TypeScript contract CLI.
  cli/           `motu` CLI: island create / verify (the loop) / integrate, archipelago create/verify,
                 fixtures record, codegen.
  chrome/        motu's OWN design language — tokens, the stylesheet built from them, and the few
                 server-rendered shapes. Plain ESM, no dependencies, so Vite (which compiles core)
                 and bare node (which serves the host) can both read it. Anything painting motu's
                 chrome reads from here; a second palette anywhere is the bug it prevents.
  host/          `motu-host`: the lagoon host. Content-addressed store, two-axis URLs, retention,
                 and the composed multi-repo view. No browser, no bundler.
  debug-overlay/ dev-only seam lens (outlines, input/output/coupling panel, record button).
demo-app/               # the app (proven against a real ocean app) — copy-pasteable into the ocean repo
  src/ui/<kebab>/         Mode-agnostic components (the "mainland"). May import contract/shared/other ui.
  src/islands/<kebab>.island.ts   The island: tag -> component + its declared boundary (input,
                          output, ambient). Evidence, when it has any, sits beside it in
                          <kebab>.evidence.ts — kept OUT of the island so the registry (which the
                          host app imports) cannot pull fixtures into a production bundle.
                          NO component here (structural
                          "islands can't import each other"). islands/registry.ts = ELEMENT_REGISTRY.
  src/archipelagos/<id>/  Region compositions (slots + layout + store wiring). archipelagos/registry.ts.
  src/shared/             Shared types + the one island stylesheet.
  contract/               Generated @motu/contract (codegen output).
  roots/bridge/           bridge.js (Vite IIFE) — embedded composition root (AngularJS adapter, channels).
  roots/lagoon/           Standalone lagoon: main.tsx (all archipelagos + a switcher) and a lagoon.html
                          entry that focuses one island/archipelago in isolation (MOTU_TARGET).
```

## Build

```
pnpm install
pnpm build:bridge      # produces demo-app/roots/bridge/dist/bridge.js (the embedded IIFE)
pnpm dev:lagoon        # standalone lagoon for design iteration (mock data, no backend)
```

`motu-runtime` / `motu-apt` build with Maven (`mvn install`) and are consumed by the host app.

## The motu CLI (agentic workflow)

`packages/cli` (`@motu/cli`, bin `motu`) is the deterministic surface an agent drives to build islands
without a human eyeballing the host. It scaffolds the island artifacts, edits the registry/archipelago
config via AST, and — the point of it — **verifies** that a component is actually a valid island.

```
pnpm motu init [dir] --host next|angularjs|none       # scaffold config + registries + a working lagoon
pnpm motu island create <name>                        # one island file (+ component if motu owns it)
pnpm motu island sync                                 # regenerate the registry from the files on disk
pnpm motu island defaults [name]                      # classify declared defaults: component, or evidence?
pnpm motu island verify <name>                        # the loop: drift rules, static (PASS/FAIL + exit code)
pnpm motu island verify <name> --runtime              # the browser lane — punctual: a gate, CI, nightly
pnpm motu island integrate <name> --archipelago <id>  # AST membership + layout marker
pnpm motu archipelago create <id>                     # scaffold + register a new archipelago
pnpm motu archipelago verify <id>                     # config + shared-CSS lint + whole-region lagoon mount
pnpm motu contract check [--update]                   # the app's boundary + coupling graph, as one artifact
pnpm motu removal-check                               # prove motu is removable from the host app
pnpm motu lagoon dev [target]                         # the lagoon, served with HMR
pnpm motu lagoon eject                                # write the framework's lagoon entries into the project
pnpm motu codegen [manifest] [outDir]                 # regenerate @motu/contract (wraps @motu/codegen)
```

`motu island verify` turns the prose in *The rules that make islands verifiable* into a machine-checked
gate. It has three layers — **static** and **config** run by default, **runtime** only with `--runtime`:

The split is about cost, and about what each layer answers. Static and config answer *has this drifted
from what it declares?* — a question about source, answered in about a second, which is why it is the
dev loop. Runtime answers *does it still behave?* by driving a real browser once per scenario ×
viewport: seconds per island, minutes across a project. Run it as a gate before handing work over, in
CI, or nightly — not on every save. `--verbose` names each runtime step with what it cost.

- **static** (AST over the ui component): no bare `fetch`/`XMLHttpRequest`, no `history`/`location`, no
  `document` reach-out, server I/O only via `@motu/contract`, no reach into `islands/`/`archipelagos/`
  (a ui component must stay liftable — `ui`→`ui` composition is fine), every `@motu/contract` call
  resolves to a real contract method, and the component renders from default props alone.
- **config** (AST over the island file + the registry): registered in `ELEMENT_REGISTRY`; the `legacy`
  fit strategy where the host HAS a legacy skin — under a modern host that rule is *skipped*, not
  blank, and declaring it there is a warning; the island's **ambient** (host contexts, session hooks,
  feature gates, service modules it imports directly) reconciled against what it actually reaches for; the island's `contract` (input/output) reconciles with the component's actual
  props (a stale entry errors, an unwired prop/callback warns); the mount point imports no sibling
  island; archipelago membership (a warning if standalone). For an AngularJS island, the adapter's own
  verify layer checks the declared host-scope `coupling`. If the island owns a `.css` file it is linted.
- **runtime** (the focused **lagoon**, `MOTU_TARGET=island:<tag>`, a real browser via Playwright/Chromium
  in both `native` and `legacy` fit): the island mounts and paints; no console errors or unhandled
  rejections; re-mounting produces identical output (catches accidental module-level state); it survives a
  failing backend (a forced 500); and — when the fixtures declare `scenarios` (two+ store seeds) — a
  **data-flow** check drives them through the archipelago `provide()` seam and asserts distinct inputs
  produce distinct output, proving *reactive* behaviour, not just that the wiring type-checks. (A fixture
  `response` may be a function of the call args, a client-side stub that filters a dataset so any input
  works offline.) An island that legitimately renders nothing from defaults is a warning, not a failure.

Props may be declared as `{ name, default, required }` in the island file, not just a bare name: the wrapper
fills declared defaults at mount (so "renders from defaults" holds) and flags a missing required prop.

`motu archipelago verify <id>` applies the same idea to a whole region — every island tag in the config is
registered, the shared stylesheet passes the CSS rules, and the region boots in the lagoon with every
declared slot mounting its island (a slot orphaned by config/layout drift is caught). A layout-less
archipelago (islands placed individually across the host) skips the region render.

The CSS lint (over the region's shared sheet, and over any island-owned `.css`) enforces two rules: host
selectors use the dual-mode `:where(:host, .motu-root)` / `:host([attr]), .motu-root[attr]` form so they
work in both shadow and light isolation (a bare `:host` is inert in light DOM); and colours come from
`--x-*`/`--_*` tokens rather than raw literals (a warning).

Both verbs exit non-zero on any error and take `--json` for a machine-readable report — so an agent loops on
them directly. `--fast` swaps the real-browser mount for a quicker (weaker) in-process `happy-dom` check.
The runtime lane opens the lagoon ONCE — one dev server, one browser, one page — and re-aims it: each
check asks the page already standing to show a different island, a whole region, or the same island
with a failing backend, then feeds it data and fires the declared outputs. That is the lagoon's own
advantage over a browser-per-spec suite: there is nothing to re-mock and nothing to log into, so a
scenario costs a store write rather than a page load. In peps the first island pays the Vite boot
(~15s) and every island after it is under a second per check. Iterate visually with `MOTU_NO_SSL=1 pnpm dev:lagoon`. The real-browser
check needs Chromium once: `cd packages/cli && npx playwright install chromium`.

`motu fixtures record <island> [--transport http|mock]` captures a session's contract responses AND
host-fed store values (channels + `provide()`) into request-keyed fixtures, so a real backend session can
seed the lagoon offline (the debug overlay has a matching record button for ad-hoc human capture).

`motu lagoon publish [island]` (or `--archipelago <id>`; no target = every archipelago with the
switcher) builds the lagoon as ONE self-contained HTML file under `.motu/publish/`, which an agent then
publishes as an Artifact — a hosted page. That gives a link you can open on a phone with no dev server,
no tunnel and no backend running: the same React components, still interactive, driven by fixtures.
The build is forced to `MOTU_TRANSPORT=mock` because nothing serves `/api` behind a static page, and to
a single chunk (`MOTU_SINGLEFILE`, see the lagoon's `vite.config.ts`) because nothing serves
`/assets/*.js` either. Republishing the same file path redeploys the same URL, so a link already open
on your phone keeps working. It is a checkpoint mechanism, not a dev loop — there is no HMR; rebuild
and republish (~2s) to see new work.

`motu lagoon serve [island]` builds that same artifact and serves it over http instead of writing it —
the way to LOOK at what you are about to publish when the Artifact tool is not available. It takes the
same target and `--fit` flags, plus `--port <n>` (default 8817), `--host` to also bind your LAN so a
phone on the same wifi can open it, and `--no-build` to serve the last published artifact as-is. It
restores the `<!doctype>`/`<html>`/`<head>` skeleton that `publish` strips (the artifact host supplies
its own) — without it the page gets no viewport meta and renders desktop-width on a phone, which is the
one device this is for. It is also the only check that exercises the artifact rather than the source:
`pnpm dev:lagoon` serves through vite with the dev proxy, so it never proves the inlining worked or that
the page survives with no `/assets/` and no backend behind it. For a phone that is NOT on your wifi, the
command prints an ssh one-liner (`ssh -R 80:localhost:8817 nokey@localhost.run`) — it deliberately does
not run it for you: that URL is public while it lives.

**Tailscale.** If you already run tailscale, prefer it: the tunnel is a property of the PORT, not of a
project, so whichever lagoon is serving on 8817 is what the tunnel exposes. Point it at a different
project by running `motu lagoon serve` from that project — no tunnel reconfiguration:

```bash
tailscale serve --bg 8817     # tailnet-only: just your devices. The private default.
tailscale funnel --bg 8817    # PUBLIC on the internet — anyone with the URL, no login.
tailscale serve status        # what is currently exposed, and whether Funnel is on
```

Prefer `serve` over `funnel` unless you actually need to show someone outside your tailnet: the lagoon
carries your fixtures, and Funnel puts them on the open internet for as long as the server runs. (With
`tailscaled --tun=userspace-networking`, pass `--socket=/run/user/$UID/tailscaled.sock` if the CLI
cannot find the daemon.)

The judgement half comes in two skills: `island-extract`
([`.github/agents/island-extract.agent.md`](.github/agents/island-extract.agent.md), `/island-extract`)
lifts an existing *ocean* component into an island; `island-create`
([`.github/agents/island-create.agent.md`](.github/agents/island-create.agent.md), `/island-create`)
builds a brand-new island (archipelago-first → lagoon → verify → integrate → ocean tests → human gate).
Both orchestrate the CLI verbs, keeping legacy-stack knowledge in the skill so the CLI stays
stack-agnostic.

## Adopting motu in an existing project

motu does not need to own the repo. `motu init` scaffolds into a **subfolder** of an app you already
have, and nothing outside that folder changes until you choose to mount an archipelago.

```bash
cd ~/dev/my-app
motu init motu --host next --hostRoot .. --appPackage my-islands
```

No install step: the framework owns the lagoon's build deps (vite, the React plugin, Tailwind) and
resolves them from its own checkout, so the scaffolded project has no `package.json` of its own to
install. A greenfield `motu init` → `archipelago create` → `island create` → `island verify --runtime`
passes in a real browser with nothing installed at all.

That produces a project where the loop already closes:

```
my-app/
  motu/
    motu.config.json          layout + host declaration (the only file the CLI reads)
    src/islands/              islands  (<kebab>.island.ts, and <kebab>.evidence.ts where there is evidence)
    src/ui/                   the components — the part that survives to the mainland
    src/archipelagos/         region compositions + the shared Store
    src/shared/styles.css     the island stylesheet
    roots/lagoon/             where `motu island verify` mounts things
  app/  components/  lib/     ...your application, untouched
```

`--host` picks the stack the islands embed **into**, which is what decides the gates and the wiring:

| `--host` | legacy fit | adapter | lagoon speaks |
| --- | --- | --- | --- |
| `angularjs` | required (`native` + `legacy` mounts) | `@motu/adapter-angularjs` | AngularJS host scope, `$http` channels |
| `next` | off | `@motu/adapter-next` | the host's `@/…` alias, its Tailwind + global stylesheet, inert `next/*` stubs |
| `none` | off | — | plain React, nothing host-specific |

Fitting an island to a legacy skin is only meaningful when the host has one, so `next`/`none` skip
the `legacy` strategy gate and the second runtime mount. `--host next` also defaults isolation to
`light`: shadow DOM would cut islands off from the host's own stylesheet, Tailwind included.

### No install of the framework itself

`@motu/*` ship COMPILED (`node scripts/build-packages.mjs`, which `./install.sh` runs), so an app can
depend on them normally. That matters for one reason beyond convenience: an installed package sits
inside the host's own `node_modules`, so `import 'react'` from inside `@motu/react` resolves to the
HOST's React and the `peerDependency` means what it says. Consumed as raw TypeScript through a symlink
into the checkout, it could not: Node resolution walks up from a module's REAL path, which leaves the
host's tree entirely and finds whatever sits next to motu — a React 18 against a host's React 19 gives
`Objects are not valid as a React child` and every island renders nothing, with no error naming motu.

The LAGOON is a different consumer and still reads the checkout's sources directly: it is a Vite app,
it transpiles TS anyway, and it **works out where that checkout is by itself** from the binary you just
ran. There is no machine-specific path to commit:

```jsonc
// motu.config.json — no motuRoot. $MOTU_ROOT, then a `motuRoot` key, override it if you need to.
```

It used to be written into every project as "the only machine-specific path", which is the one line
that breaks on a second machine and in CI. It was always derivable: `lagoon-vite.mjs` had computed the
same value from its own location all along, to find vite. Consequences worth knowing:

- The lagoon installs **no React**. It resolves the host application's copy and pins it with
  `resolve.dedupe`, because two Reacts break hooks the moment an island renders a component from the
  host's own library. A project that has no React at all — a freshly `motu init`-ed one, before any
  install — falls back to the framework's copy, so the lagoon renders from the first minute. The
  fallback is inert wherever a host copy exists.
- Aliases are anchored regexes, not the object form: Vite's alias matcher is exact-or-prefix-with-a-
  slash, which never matches `pkg/styles.css?inline` and lets `@motu/runtime` swallow
  `@motu/runtime/mock`.
- Only the lagoon's own build tools need installing (`vite`, `@vitejs/plugin-react`, plus
  `tailwindcss`/`autoprefixer` for a Next host).

The gallery — the **tide line** (archipelago switcher, Region/Mountpoints view, the adopted transport
and fit chips, a Cmd/Ctrl+K palette), the **seam lens** opened from the tab on its own panel, and the injection
of recorded callsite frames — is framework behaviour and lives in `@motu/react` (`startLagoon`). It is
not scaffolded, so improvements to it arrive with a `git pull` rather than by regenerating a file. Both
surfaces stay submerged until you reach for them, so the archipelago owns the first screenful. The
focused `lagoon.html` entry deliberately has none of it: that is what `verify` drives, and chrome there
would be noise.

A project therefore **declares** its lagoon rather than coding it:

```jsonc
// roots/lagoon/lagoon.config.json
{
  "about": "…shown by the palette",
  "transport": "mock",          // build-time default; MOTU_TRANSPORT and the chip override it
  "httpBase": "/api/motu",      // only if this project has a dispatcher to talk to
  "defaultTheme": "motu",
  "stations": { "directory": { "label": "Directory", "order": 1 } },
  "exclude": []
}
```

An archipelago missing from `stations` still appears — configuring one is for renaming and ordering,
never for visibility, so a newly created archipelago can never be invisible because someone forgot a
config edit.

What a declaration cannot hold — functions and objects — goes in `roots/lagoon/src/lagoon.ts`, which
is empty by default: `host` (the outward seam; the default logs intents, which is how you SEE that an
island emitted a navigation instead of performing one), `channels` and `seed` per archipelago id,
`setup` (run before anything mounts), and `transportFor` when `httpBase` cannot say enough.

`src/main.tsx` remains, but only as glue Vite requires in the app: the build-time defines,
`import.meta.glob`, the project's own registry, and the debug overlay — which `@motu/react` must not
depend on, so the app hands it in.

A Next lagoon also inherits the app's **styling**, which is what makes it worth looking at: the entries
import the host's `globals.css`, and the scaffolded `roots/lagoon/tailwind.config.ts` extends the app's
Tailwind config with its `content` globs re-anchored on the host root. That re-anchoring is the part
that is easy to get wrong and fails silently — Tailwind resolves `content` against the CWD, which here
is the lagoon, so the app's own `./components/**` globs would match nothing, no utilities would be
emitted, and every island would render unstyled while still passing `verify`. The config is extended
through Tailwind's own loader rather than imported into `vite.config.ts`, because an app config that
`require()`s a CJS plugin (`tailwindcss-animate`) cannot survive Vite's ESM config bundling.

### Migrating a component

On a React host an island is a **mount point over a component the app already owns** — not a copy of
it. The `ui/<kebab>/` layer exists for the foreign ocean case, where the original is not React and a
component has to be written; duplicating an existing React component there would fork it and let the
two drift, which is the opposite of what migrating incrementally means.

```bash
motu archipelago create directory
motu island create phone-display --from '@/components/phone-display'
motu island integrate phone-display --archipelago directory
motu island verify phone-display
```

`--from` takes the specifier **the app itself uses** — host tsconfig aliases included — and writes
only the mount point. The component stays where it is and every existing call site keeps working;
`motu island verify` follows the island file to wherever its component lives.

Requiring props is fine. The app's component was never written to render from nothing, so declare the
default on the island instead — the wrapper fills declared defaults at mount, leaving the component
exactly as the app wrote it:

```ts
contract: { input: [{ name: 'phone', default: '+33617866318' }] },
```

Start with a leaf — no I/O, no router, no host reach — so the first island exercises the wiring and
nothing else. Drift detection (`props-match`) needs a `<Pascal>Props` interface to compare against;
an app component that types its props inline gets a warning saying the check is off, rather than a
silent pass.

### Server data: the contract seam

Islands must not call a repository or a database client directly. All I/O goes through the generated
`contract`, because that single indirection is what lets the lagoon put `MockTransport` in its place
and replay fixtures offline. `motu island verify` enforces it.

On the Jakarta side the callable surface is discovered by an annotation processor and turned into a
generated contract. TypeScript needs neither: the surface is an object literal, and its *type* is the
contract. A signature change fails `tsc` at the island's call site immediately — there is no
generator to re-run and no window where the two disagree.

```ts
// motu/src/services/index.ts — the ONLY functions an island can reach. Deny-by-default is
// structural: nothing else in lib/ is exposed, and no convention can widen it accidentally.
export const services = defineServices({
  directory: { getSectors: fetchDirectorySectors, getTags: fetchDirectoryTags },
})
export type AppServices = typeof services

// motu/src/contract.ts — the island side. The type import is erased at build.
export const contract = createContract<AppServices>()
```

Then pick a transport at the composition root — the one decision islands never see:

| Transport | For |
| --- | --- |
| `DirectTransport(services)` | The app reads from the browser (Supabase + row-level security). The call goes straight to the app's own function; there is no network hop and no second client. |
| `HttpTransport('/api/motu')` + `createMotuRoute` | The work genuinely must run on the server (a service-role key, a secret). Mount the handler at `app/api/motu/[...call]/route.ts`. |
| `MockTransport(fixtures)` | The lagoon. Same components, no backend, no session. |

**motu does not reimplement authorization.** The registry's entries are the app's own functions, and
whatever they already use — a session-bound client, row-level security, an existing `@Roles`
interceptor — decides what the caller may see. motu adds no credential and can widen nothing. The
`authorize` hook on `createMotuRoute` is a coarse early exit, not the security boundary.

`DirectTransport` deserves its own note: HttpTransport exists because the Jakarta ocean keeps data
access on the server. That is not universal. What motu actually needs is not a network boundary but a
single seam every island call passes through, so the lagoon can stand in for it. Forcing an
RLS-based app through an HTTP tier it does not otherwise have would add a hop and a second place for
authorization to drift.

### Mounting islands in a Next app

There is no `bridge.js` and no injected markers — a Next host is already React, so a page renders the
archipelago directly:

```tsx
'use client';
import { configure, DirectTransport } from '@motu/runtime';
import { Archipelago, nextHostBridge } from '@motu/adapter-next';
import { ELEMENT_REGISTRY, getArchipelago } from 'my-islands';
import { services } from '@/motu/src/services';

configure(new DirectTransport(services));

export function Directory() {
  const router = useRouter();
  const host = useMemo(() => nextHostBridge(router), [router]);
  return <Archipelago config={getArchipelago('directory')!} elements={ELEMENT_REGISTRY} host={host} />;
}
```

Islands render **in the page's own React tree**. What the archipelago carries is unchanged — one
declared `Store` per region, declarative `bind` from store key to island prop, the host-intent seam,
and the seam lens's view of all three — but there is no custom element and no second React root.

That is a different axis from `isolation`, and deliberately so. Isolation decides whether the host's
CSS reaches an island; `mount` decides which tree it renders in:

| `mount` | |
| --- | --- |
| `"react"` (default) | Islands render in the host's tree. Context, error boundaries and Suspense from the page reach them; one root for the page; server rendering stays possible. |
| `"element"` | `<motu-island>` custom elements, one React root each. For a React host that does **not** own the DOM an island lands in — markup rendered by a CMS, a slot filled imperatively — where there is no tree to join. |

A root per island is right for an ocean, which has no React tree at all. Carried into a React host it
costs more than the roots: each root is its own **context** boundary, so a component calling
`useClock()` throws inside an island while working two lines above it on the same page.

**The lagoon must use the same `mount` as the host** (`"mount": "react"` in `lagoon.config.json`,
scaffolded for `--host next`), or `motu island verify` green-lights a mount path the project never
ships — and context, error boundaries and prop timing all differ between the two.

An archipelago needs a **layout** or it renders nothing — the single-island lagoon target synthesises
one, so `island verify` passes green while the real page stays empty:

```ts
layout: `<motu-island slot="phone-display"></motu-island>`,
```

`<Archipelago>` defaults to `isolation="light"`, the opposite of the framework default and on purpose.
A shadow root is right for an ocean whose stylesheet would bleed into the islands; here the app's
stylesheet is the point, and a shadow root leaves the app's own components unstyled inside their own
page.

**Bundler wiring.** The app resolves `@motu/*` by path, the same way the lagoon does — mirror the
aliases in `next.config.mjs` and in `tsconfig.json` `paths`, or the build type-checks against
something it is not bundling. Three things are needed beyond the aliases:

- `experimental.externalDir: true` — the checkout is outside the project root and Next declines to
  compile anything out there without it.
- `resolve.extensionAlias { '.js': ['.ts', '.tsx', '.js'] }` — motu's sources import each other with
  `.js` specifiers (the NodeNext idiom). Vite maps those back to source on its own; webpack does not.
- Exact-match alias keys (`'@motu/runtime$'`), or `@motu/runtime` swallows `@motu/runtime/mock`.

**Turbopack does not work yet** — use `next dev --webpack` / `next build --webpack`. Turbopack resolves
an absolute `resolveAlias` value as project-relative, and has no `extensionAlias` equivalent for the
`.js` specifiers. Both are fixable, neither is fixed.

### What `@motu/adapter-next` is (and is not)

Deliberately small — the AngularJS adapter is large because AngularJS is a *foreign* framework
needing channels and a custom-element definer to cross into. A Next host is already React, so the
adapter is only:

- **`nextHostBridge(router)`** — turns an island's `navigate` intent into `router.push()`. Islands
  are forbidden from touching `history`/`location` (that rule is what lets the same component mount
  in a lagoon with no router at all), so something has to do this at the composition root.
- **`Archipelago`** — the React component above.
- **`defineServices` / `createContract` / `createMotuRoute`** — the contract seam (see *Server data*).
- **`@motu/adapter-next/verify`** — the RSC boundary, which is Next's analogue of AngularJS's
  host-scope coupling. Both police the one way an island can silently bind to its host. It errors on
  server-only imports (`next/headers`, `server-only`, …) and `'use server'` actions, which would make
  a component the lagoon can never mount; errors on hooks without `'use client'` (fine as an island,
  broken the moment the component is imported directly — which is motu's exit path); and warns on
  `next/link`/`next/image`/`next/navigation`, which the lagoon stubs as inert.

There is no `defineNextElement` and no bridge root, by design.

### Known limits

- **`contract-only-io` still can't see a direct Supabase import.** The seam exists now
  (`defineServices` + `createContract`), but the static rule's blocked-client list is
  `axios/ky/superagent/node-fetch/got` — `@supabase/supabase-js` is not on it, so an island that
  imports the client directly passes a rule meant to prevent exactly that. The list should be
  configurable per project.
- **Turbopack** — see above; the Next host builds with `--webpack` only.
- The lagoon cannot reproduce host CSS collisions or auth expiry; an integration test alongside it
  is still necessary.

## Hosting lagoons (`motu-host`)

`motu lagoon publish` writes one self-contained page; `motu lagoon serve` puts it on a port, and an
ssh tunnel puts that port on the internet for as long as your laptop is awake. A **lagoon host** is
that URL, without the laptop:

```bash
motu-host --token $(openssl rand -hex 24)          # serve on 127.0.0.1:8818
motu lagoon publish --archipelago members \
  --remote http://localhost:8818 --token …          # build, write the file, AND upload it
```

```
✓ Members Lagoon — 490 kB (164 kB gzipped)
  http://…/acme/web/latest/archipelago-members       (the bookmark — always current)
  http://…/acme/web/65d1ee2a9f3f/archipelago-members (this build, forever)
```

`--remote` **adds a destination**; it does not replace the artifact. The same bytes are written to
`.motu/publish/` first, so a host that is down or a token that is wrong costs you nothing — the page
is still on disk and still publishable as an Artifact. There is one build, so local and hosted cannot
drift.

### Two axes, because a link has two jobs

| URL | Meaning | Cached |
| --- | --- | --- |
| `/<repo>/latest/<slug>` | the bookmark — follows every publish | `no-store` |
| `/<repo>/<branch>/<slug>` | the PR link | `no-store` |
| `/<repo>/<commit>/<slug>` | this build, immutable | one year |

Objects are content-addressed, so republishing an unchanged lagoon stores nothing new (`deduped`).
A commit URL from a **dirty tree** would be a lie — it would name a commit that does not contain what
you are looking at — so the CLI withholds the sha and the host falls back to the content hash, which
is always true.

### One host, and every agent already knows where it is

The point of a long-running host is that nobody has to be told where it is. Put the URL and token in
`~/.config/motu/host.json` (0600) and `--remote` needs no argument at all:

```jsonc
{ "url": "http://127.0.0.1:8818", "token": "…" }
```

```bash
motu lagoon publish --remote          # any project, any agent, same host
```

Precedence is flag → `$MOTU_HOST_URL` / `$MOTU_HOST_TOKEN` → that file. So a fleet of agents working
across several repositories all publish into one place without being configured, and a one-off
publish elsewhere is still a flag away.

That is the shape to keep: **one long-running host, plus occasional spawns.** `motu lagoon dev` and
`motu lagoon serve --watch` are the spawns — a dev loop with HMR, alive for as long as you are looking
at it. A second *permanent* preview server is what the host replaces.

### Retention that cannot break a link

Two caps, whichever binds first: `--max-records` publish records **per repository** (default 1000)
and `--max-bytes` per repository (default 4 GB). The second exists because records are not a proxy
for size — a typical lagoon is ~430 kB, but Twenty's record page inlines its whole front-end and
publishes at **19.2 MB**, so a thousand of those is 19 GB from a cap that reads as conservative.

Eviction never touches a record a mutable alias points at, or one a composed manifest names, and it
orders by **last access** rather than publish date: a six-week-old lagoon somebody bookmarked
outranks ten builds from this morning. Blobs are collected only once nothing references them, and
two records sharing content are charged once.

### A lagoon across several repositories

Declare a group; the host resolves each member's `latest` **at view time** and snapshots the resolved
hashes into an immutable manifest, so `/g/<name>` always means today while the manifest it redirects
to keeps rendering what today looked like. Identical resolution yields an identical manifest id, so
viewing a stable group repeatedly adds nothing to the store.

```bash
motu lagoon group product --all              # every repo the host knows, at its switcher entry
motu lagoon group product --add acme/admin:archipelago-billing --remove old/thing
motu lagoon groups                           # what galleries exist, and their URLs
# /g/product  →  302  /m/<manifest>/
```

`--all` is the one that answers "put every project in the gallery": the host already knows which
repositories have published, so the composition does not have to be maintained by hand. `--add` and
`--remove` EDIT an existing group rather than redefining it; the slug defaults to `all` (the switcher
entry, which is the whole project), and a bare `--remove acme/web` drops every slug of that repo.
Members are comma-separated in one flag, not a repeated flag — the CLI's argv parser overwrites
repeats, so `--add a --add b` would silently keep only `b`.

A member that has published nothing is stored but reported: the group counts the lagoons the view
actually has, and names the ones missing from it.

**Each member renders in its own iframe**, and that is a decision rather than a shortcut. Merging
pre-built archipelagos from different repositories into one document would put two Reacts in one page
(the lagoon dedupes onto the host app's copy precisely because that breaks hooks), collide two
light-DOM Tailwind layers *silently and visually*, and reintroduce the version skew that
[one artifact, one deploy, one version](#one-artifact-one-deploy-one-version) refuses. A frame gives
each archipelago its own React, stylesheet and document for free — and the intermediate representation
it needs is the page `publish` already emits, so there is no second build stage and no packager that
has to understand anyone's bundle. Frames are created on first selection and then kept, so a composed
lagoon does not load N × 430 kB up front and does not throw away the state you drove a region into.

The line this must not cross: **the composed lagoon is a viewing surface.** It is never a deploy
target and never what `motu island verify` drives — verify keeps driving `lagoon.html` directly, one
document, no frames.

### Visual baselines, off the repository

`motu island snapshot` compares against PNGs committed beside the evidence. That is what makes a
visual tier unmaintainable at size: re-recording is a binary diff nobody reviews, so baselines drift,
the check goes permanently red, and people stop generating them — measured on peps, which has
baselines for 2 of 20 islands and stale ones on the island that has them.

The host stores them instead:

```bash
motu island snapshot --all --remote      # render locally, compare against the ACCEPTED baseline
motu island snapshot --accept <island>   # move the accepted pointer, deliberately
```

Three properties, and each one is the answer to a specific failure:

- **Content-addressed.** A shot that does not change costs zero new bytes, forever. Storage grows with
  CHANGE, not with island count — a thousand runs over a hundred unchanged islands add nothing. That
  removes the reason not to baseline every island.
- **Accepting is a decision, not a file write.** `--update` overwriting everything is why "the baseline
  is stale" and "you broke something" are the same red today. An accepted pointer somebody moved
  separates them: a later diff means *changed since a human looked*.
- **Nothing in git.** No PNG churn, no binary review, and `*.snapshots` can be ignored.

**No CI is required.** Rendering already happens on the machine running `motu island snapshot`; the
host is a user service on that same machine. CI would only add automatic runs on push, and this is a
punctual gate an agent runs before handing work over. If you want it unattended, a systemd user timer
beside the host costs nothing.

The one honest risk: the store is one directory (`~/.local/share/motu-host`). Back it up, or a disk
failure takes the baselines with it.

### Picturing the composed page

`motu archipelago snapshot <id|--all> --remote` photographs the REGION VIEW — every island in its
arrangement, at each declared viewport.

This is the one thing an island shot cannot do, and the gap is not hypothetical. Two agents each
extended the lagoon frame's slot lookup; the naive merge made one agent's widget render as the other's,
and `archipelago verify --runtime` was BYTE-IDENTICAL between the correct and broken resolutions,
because the frame is arrangement — not declared, therefore not checked. Every island rendered
correctly in isolation. Only the composition was wrong.

States come from the region's FLOWS: each one opens by seeding the state it needs, so the flow list is
the honest answer to "which shapes does this page take". That matters because a page can change SHAPE,
not just values — an actions page with an empty week is a different page. A shape no flow seeds is an
evidence gap, and the fix is a flow, which is worth having anyway.

**Attribution is what makes a page-level diff usable.** Any island edit changes the region picture, so
on its own the signal churns and people stop accepting it. But the islands are separately baselined, so
the report says which members also changed:

```
✗ actions   3 changed
    members that also changed: week-actions — the region changed because they did
```

and when none did, the diff is an ARRANGEMENT regression — the class nothing else sees. It will not
make that claim about members it has not compared: an island with no accepted baseline can never report
`changed`, so the report says it cannot attribute rather than blaming the frame.

### What the host is not

- **It runs no browser.** Playwright stays on the publishing machine, where it already is. Snapshot
  diffs and `--runtime` findings are produced locally; the host stores pages.
- **Uploads are authenticated, reads are not.** A URL is *unlisted*, not access-controlled. The lagoon
  has no backend and no session — but its fixtures were recorded from somewhere, so this posture is
  right for one person and wrong for a team. Accounts are what gate opening it to external teams.
- **It has no live reload.** `serve --watch` injects a reload client; `publish` deliberately does not,
  because a published artifact that dials home is a lie about what the artifact is.

### What it can tell you that nothing else can

An upload is REFUSED when the fragment still references `/assets/` — that build's inlining did not
happen, and the page would render blank here exactly as under an artifact CSP. Anything else absolute
is a **warning**, printed by the CLI and returned in the JSON: Twenty's lagoon references
`/images/placeholders/*.png`, decorative art the bundler never inlines because it is an `<img src>`
rather than a CSS asset. Those resolve against the origin — they work under `lagoon dev`, because Vite
serves them, and 404 the moment the page is hosted. Hosting is the first place that difference is
visible, so the host says it rather than letting the page quietly lose its art.

## Install (one command)

Requires **node >= 20.11** and git. From a motu checkout:

```bash
git clone https://github.com/Scorbutics/motu.git
cd motu
./install.sh                 # deps + link `motu` onto PATH + install the skills into the current repo
./install.sh ~/dev/ocean     # ...installing the skills into that repo instead
```

`install.sh` installs **the checkout's own** dependencies first if they are missing (pnpm, bun or npm,
whichever you have). That step is the one thing the framework needs and your project does not: motu
resolves vite, tsx, ts-morph and playwright from here, which is exactly what lets an adopting project
install nothing. Running the CLI from a checkout with no `node_modules` fails immediately, and says so.

The script links `packages/cli/src/cli.mjs` into `~/.local/bin/motu` (override with `MOTU_BIN_DIR`),
adds that directory to `PATH` via one guarded block in your shell rc (`.zshrc` / `.bashrc` / fish
config / `.profile`, detected from `$SHELL`), and then runs `motu skills install`. It is idempotent —
re-run it after a `git pull`. `--no-path` skips the rc edit; `--no-skills` installs the CLI only.

Once `motu` is on PATH, the skills go into any repo on their own:

```bash
motu skills install [dir]    # default: the current directory
motu skills list             # what this checkout ships
```

`skills install` writes **one skill in two formats**, from a single source
(`.github/agents/<name>.agent.md`), so they cannot drift:

| Written file | Read by |
| --- | --- |
| `.github/agents/<name>.agent.md` | GitHub Copilot custom agent (`copilot --agent=island-create`) |
| `.github/prompts/<name>.prompt.md` | Copilot slash-prompt (`/island-create`) |
| `.claude/skills/<name>/SKILL.md` | Claude Code skill (`/island-create`) |

Files that already match are left alone; a file that differs is reported and **not** overwritten
(exit 1) unless you pass `--force`. `--only claude|copilot` writes just one format, `--json` gives a
machine-readable report.

## Develop with hot reload

Iterate on the frontend (islands, styles, archipelago wiring, channels, even the injected
`<motu-island>` markers) **without rebundling into the jar or redeploying the EAR**. The
web-console dev server rewrites the page's `/api/rest/motu/bridge.js` to a locally-served
`bridge.js` and SSE-reloads on change; the bridge watch rebuilds that file on every motu edit.

```
# Terminal A — console SPA dev server (serves :8084, proxies /api/rest -> WildFly)
cd ~/dev/ocean/web-console/src/main/webapp/devserver
npm install        # first time only
npm run dev-server

# Terminal B — rebuild bridge.js into the dev server's dist on every motu change
cd ~/dev/motu
pnpm dev:console
```

Keep WildFly running, log in once at `https://localhost:8443/api` so the session cookie flows to
the dev server, then use the dev-server URL. Edit motu TS/CSS → the page reloads automatically.

For a backend-free design preview, run the lagoon app instead: `pnpm dev:lagoon` (its `main.tsx` shows all
archipelagos with a switcher; the single-target `lagoon.html` is what `verify` drives via `MOTU_TARGET`).

**Lagoon transport (mock vs live):** the lagoon app can back its components with either
`MockTransport` (offline sample data, no login) or `HttpTransport` (the real backend via the
dev-proxy, using your own session cookie). It defaults to **mock** so agents get offline data with
no setup. Pick the transport in three layers, most specific first:

- `?transport=http` / `?transport=mock` in the URL — flips and remembers the choice for that browser.
- The floating pill in the corner toolbar — a one-click switch (persisted, reloads).
- `MOTU_TRANSPORT=http|mock pnpm dev:lagoon` — sets the dev/build default (unset = mock).

To browse live data, log in once at `https://localhost:8443/api`, then open the lagoon app
and switch the pill to HTTP (or start it with `MOTU_TRANSPORT=http`).

**When you still need an EAR redeploy:** only for **Java/backend** changes — `motu-runtime` (e.g.
the argument binder), `@BrowserCallable` annotations, or a regenerated contract. The member-list
seam even taps the legacy `/member/search` endpoint through a channel, so it needs no motu
dispatcher deployed to iterate.

