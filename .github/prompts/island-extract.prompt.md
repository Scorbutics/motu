---
description: Extract a legacy ocean component into a motu island — scaffold with the motu CLI, rewrite it as a mode-agnostic React island, loop against `motu island verify` until PASS, then integrate into an archipelago.
tools: ['codebase', 'editFiles', 'search', 'runCommands', 'problems', 'usages', 'changes']
---

# Extract a legacy component into a motu island

Migrate one legacy *ocean* component (e.g. under `~/dev/ocean`) into a **motu island**. The `motu`
CLI does the deterministic work; you do the translation. **Close the loop on `motu island verify`,
not on your own judgement.** This is the workflow the
[`island-extract` agent](../agents/island-extract.agent.md) drives; read that agent file and the
repo `README.md` for the full rules — do not duplicate them here.

Ask the developer for the legacy source path and the target archipelago/page if they are not obvious.

## Workflow

1. **Read the legacy component** — controller/JS + template/partial + the REST/service it calls. Note
   what it renders, the actions it emits, and every server call.
2. **Scaffold:** `pnpm motu island create <name>`.
3. **Map data access** to `@motu/contract`. If a method isn't `@BrowserCallable` yet, annotate it in
   the backend, rebuild, then `pnpm motu codegen`.
4. **Write the component** in `demo-app/src/ui/<kebab>/<Pascal>.tsx`: props in / callbacks out, no
   fetch/history/document, all I/O via the contract, renders from default props alone.
5. **Fixtures + fit:** fill `demo-app/src/islands/<kebab>/fixtures.mock.ts` (shapes match the contract
   returns; a function `response` gives reactive filtering; declare `scenarios`) and set the island's
   `contract` (input/output/coupling) + required `legacy` strategy (`fill`/`inline`/`structural`).
6. **Verify:** `pnpm motu island verify <name>` — boots the focused lagoon in a real browser
   (Playwright/Chromium; one-time `cd packages/cli && npx playwright install chromium`). Fix every `✗`,
   re-run until **PASS**. `--fast` uses happy-dom for quick iteration; iterate visually with
   `MOTU_NO_SSL=1 pnpm dev:lagoon`.
7. **Integrate:** `pnpm motu archipelago create <page-id>` (if needed) →
   `pnpm motu island integrate <name> --archipelago <page-id>`; fill the `TODO(motu:wiring)`
   bindings/handlers and add the `<motu-island slot="…">` marker to the legacy page.
8. **Finish:** `pnpm motu island verify <name>` (expect PASS) and `pnpm typecheck`.

For a BRAND-NEW island (not migrating existing legacy), use the `island-create` agent/prompt instead —
it adds the archipelago-first, sibling-connection, ocean-validation, and human-gate steps.

Never work around a verify failure, widen backend surface beyond the needed `@BrowserCallable` method,
or add runtime module loading / island-to-island imports (see README "Non-goals").
