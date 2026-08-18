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
- **Archipelago** — several islands on one page, coordinating through a shared store
  (`Store` in `@motu/core`) instead of talking to each other directly.
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
3. **Integrate**: register the mount point (`demo-app/src/islands/<kebab>/element.ts` — a thin
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
  `CompanyLookup`'s default `prefix = ''`).
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

## Exit

An island is a plain component (`demo-app/src/ui/`) plus a thin custom-element wrapper
(`defineReactElement`, in the mount point's `element.ts`). Ship it to the mainland by dropping the
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
  codegen/       manifest.json -> TypeScript contract CLI.
  cli/           `motu` CLI: island create / verify (the loop) / integrate, archipelago create/verify,
                 fixtures record, codegen.
  debug-overlay/ dev-only seam lens (outlines, input/output/coupling panel, record button).
demo-app/               # the app (proven against a real ocean app) — copy-pasteable into the ocean repo
  src/ui/<kebab>/         Mode-agnostic components (the "mainland"). May import contract/shared/other ui.
  src/islands/<kebab>/    Mount points: element.ts (tag -> ui component + contract + legacy fit),
                          fixtures.mock.ts (+ scenarios), index.ts. NO component here (structural
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
pnpm motu island create <name>                        # component + registry row + fixtures stub
pnpm motu island verify <name>                        # the loop: rules + lagoon mount (PASS/FAIL + exit code)
pnpm motu island integrate <name> --archipelago <id>  # AST membership + layout marker
pnpm motu archipelago create <id>                     # scaffold + register a new archipelago
pnpm motu archipelago verify <id>                     # config + shared-CSS lint + whole-region lagoon mount
pnpm motu codegen [manifest] [outDir]                 # regenerate @motu/contract (wraps @motu/codegen)
```

`motu island verify` turns the prose in *The rules that make islands verifiable* into a machine-checked
gate. It runs static, config and runtime layers:

- **static** (AST over the ui component): no bare `fetch`/`XMLHttpRequest`, no `history`/`location`, no
  `document` reach-out, server I/O only via `@motu/contract`, no reach into `islands/`/`archipelagos/`
  (a ui component must stay liftable — `ui`→`ui` composition is fine), every `@motu/contract` call
  resolves to a real contract method, and the component renders from default props alone.
- **config** (AST over `element.ts` + the registry): registered in `ELEMENT_REGISTRY` with the required
  `legacy` fit strategy; the island's `contract` (input/output) reconciles with the component's actual
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

Props may be declared as `{ name, default, required }` in `element.ts`, not just a bare name: the wrapper
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
them directly. `--fast` swaps the real-browser mount for a quicker (weaker) in-process `happy-dom` check;
`--no-runtime` skips the lagoon. Iterate visually with `MOTU_NO_SSL=1 pnpm dev:lagoon`. The real-browser
check needs Chromium once: `cd packages/cli && npx playwright install chromium`.

`motu fixtures record <island> [--transport http|mock]` captures a session's contract responses AND
host-fed store values (channels + `provide()`) into request-keyed fixtures, so a real backend session can
seed the lagoon offline (the debug overlay has a matching record button for ad-hoc human capture).

The judgement half comes in two skills: `island-extract`
([`.github/agents/island-extract.agent.md`](.github/agents/island-extract.agent.md), `/island-extract`)
lifts an existing *ocean* component into an island; `island-create`
([`.github/agents/island-create.agent.md`](.github/agents/island-create.agent.md), `/island-create`)
builds a brand-new island (archipelago-first → lagoon → verify → integrate → ocean tests → human gate).
Both orchestrate the CLI verbs, keeping legacy-stack knowledge in the skill so the CLI stays
stack-agnostic.

## Install (one command)

From a motu checkout:

```bash
./install.sh                 # link `motu` onto PATH + install the skills into the current repo
./install.sh ~/dev/ocean     # ...installing the skills into that repo instead
```

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
- The floating pill in the bottom-right of the page — a one-click switch (persisted, reloads).
- `MOTU_TRANSPORT=http|mock pnpm dev:lagoon` — sets the dev/build default (unset = mock).

To browse live data, log in once at `https://localhost:8443/api`, then open the lagoon app
and switch the pill to HTTP (or start it with `MOTU_TRANSPORT=http`).

**When you still need an EAR redeploy:** only for **Java/backend** changes — `motu-runtime` (e.g.
the argument binder), `@BrowserCallable` annotations, or a regenerated contract. The member-list
seam even taps the legacy `/member/search` endpoint through a channel, so it needs no motu
dispatcher deployed to iterate.

