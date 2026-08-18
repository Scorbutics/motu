---
description: Create a brand-new motu island (not migrating legacy) — pick/create the archipelago, build + verify in the lagoon against mock fixtures (including reactive behaviour and sibling-island connections), raise integration concerns, integrate into the ocean, validate with the ocean's own build/tests, then hand off to a human.
tools: ['codebase', 'editFiles', 'search', 'runCommands', 'problems', 'usages', 'changes']
---

# Create a new motu island

Build a **new** UI capability as a motu island, designed fresh (not lifted from the ocean). Close the
loop in the **lagoon** first; integrate only once it passes. The `motu` CLI does the deterministic
work; you own the judgement and the sequence. This is the workflow the
[`island-create` agent](../agents/island-create.agent.md) drives — read that agent file and the repo
`README.md` for the full rules; do not duplicate them here.

## Workflow (in order)

1. **Archipelago first** — decide the page/region the island lives on. Reuse one under
   `demo-app/src/archipelagos/`, or `pnpm motu archipelago create <id>`. Know which store keys it
   reads/writes and which sibling islands it coordinates with.
2. **Build in the lagoon:** `pnpm motu island create <name>` (scaffolds `ui/<kebab>/` component +
   `islands/<kebab>/` mount point). Write the mode-agnostic component (no fetch/history/document, all
   I/O via `@motu/contract`, renders from default props), fill the `contract` (input/output), and the
   mock fixtures — use a **function `response`** for reactive filtering and declare `scenarios`.
3. **Test behaviour + sibling connections** offline: `MOTU_NO_SSL=1 pnpm dev:lagoon`; drive a store
   key and watch the reader island react.
4. **Verify:** `pnpm motu island verify <name>` (real-browser lagoon, native & legacy fit, data-flow).
   Fix every `✗` until **PASS**. Then WRITE DOWN the integration risks the lagoon can't cover
   (bound-empty inputs, unfired channels, host coupling, stub fixtures, legacy CSS/digest/session).
5. **Integrate:** `pnpm motu island integrate <name> --archipelago <id>`; fill the `bind`/`on` wiring
   (connect to siblings via the store), and add the `<motu-island slot="…">` marker to the legacy page
   (`legacy-toggle="true"` for progressive rollout).
6. **Validate with the ocean's own checks:** `pnpm typecheck` + `pnpm build:bridge`, then the host
   app's compilation + unit + integration/e2e suites (ask the human for commands if unknown).
7. **Hand off to a human** — present the verify PASS, the step-4 integration concerns, and the ocean
   suite result. The human is the final gate; do not mark done without their validation.

Never work around a verify failure, widen backend surface beyond the needed `@BrowserCallable` method,
or add island-to-island imports / runtime module loading (see README "Non-goals").
