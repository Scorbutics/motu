---
description: Make UI the app ALREADY HAS into a motu island — on a React host the island wraps the component the app owns (no component is written); on an AngularJS ocean host the legacy source is rewritten as a mode-agnostic React component. Loop against `motu island verify` until PASS, then integrate into an archipelago.
tools: ['codebase', 'editFiles', 'search', 'runCommands', 'problems', 'usages', 'changes']
---

# Make an existing component a motu island

Take one piece of UI the application already has and make it a **motu island**. The `motu` CLI does
the deterministic work; you do the judgement. **Close the loop on `motu island verify`, not on your
own judgement.** This is the workflow the
[`island-extract` agent](../agents/island-extract.agent.md) drives; read that agent file and the
repo `README.md` for the full rules — do not duplicate them here.

**Step 0 — read `motu.config.json`'s `host`, it decides the whole shape.** `next`/`vite`/`none` → WRAP:
the island points at the component the app owns and you write no component; copying it into `ui/`
forks it. `angularjs` → REWRITE: there is no React component to wrap, so author one under `ui/`.
`isolation` is NOT this discriminator — it is shadow vs light DOM, and every reference project is
`light`, the AngularJS one included.

Ask the developer for the component (or legacy source path) and the target archipelago/page if they
are not obvious.

## Workflow

1. **Read what exists.** WRAP: find the component and the specifier the app imports it by, then list
   what it cannot render without — providers, its own fetching, router/session, required props with no
   default. REWRITE: controller/JS + template/partial + the REST/service it calls; note what it
   renders, the actions it emits, and every server call.
2. **Scaffold.** WRAP: `motu island create <name> --from '<the app's own specifier>' [--export <Name>]`.
   REWRITE: `motu island create <name>`.
3. **Data access.** WRAP: the component keeps the app's; a `channel` answers what reacts and the app's
   own captured mock data answers what it reads. REWRITE: map every call to `@motu/contract` — if a
   method isn't `@BrowserCallable` yet, annotate it in the backend, rebuild, then `motu codegen`.
4. **The component.** WRAP: write NONE. What it cannot render without goes in `providers` (every view,
   idempotent — gate a `<Router>` on `useInRouterContext()`), arrangement in `layout`, data in `seed`.
   A wrapper that only installs providers is motu-only code in the app's repo. REWRITE: author
   `ui/<kebab>/<Pascal>.tsx` — props in / callbacks out, no fetch/history/document, all I/O via the
   contract, renders from default props alone.
5. **Evidence.** Both: scenarios whose outputs DIFFER, or `data-flow` fails. WRAP: point at the capture
   the app already keeps for its own tests — never hand-write a third copy — and import shared evidence
   with a RELATIVE specifier (`@/` does not resolve in the loaders, and the failure is silent).
   REWRITE: fill the evidence file (shapes match the contract returns; a function `response` gives
   reactive filtering) and set the required `legacy` strategy (`fill`/`inline`/`structural`).
6. **Verify:** `motu island verify <name>` — boots the focused lagoon in a real browser
   (Playwright/Chromium; one-time `cd packages/cli && npx playwright install chromium`). Fix every `✗`,
   re-run until **PASS**. `--fast` uses happy-dom for quick iteration; look at it with
   `motu lagoon dev`.
7. **Integrate:** `motu archipelago create <page-id>` (if needed) →
   `motu island integrate <name> --archipelago <page-id>`; fill the `TODO(motu:wiring)`
   bindings/handlers, place the region in the page (`createRegion` + `useRegion` on a React host, a
   `<motu-island slot="…">` marker in a legacy template), then `motu integrate check`.
8. **Finish:** `motu island verify <name>` (expect PASS) and the host's own build/typecheck.

For a BRAND-NEW island (nothing exists yet), use the `island-create` agent/prompt instead —
it adds the archipelago-first, sibling-connection, ocean-validation, and human-gate steps.

Never work around a verify failure, copy a component the app owns into `ui/` on a React host, widen
backend surface beyond the needed `@BrowserCallable` method, or add runtime module loading /
island-to-island imports (see README "Non-goals").
