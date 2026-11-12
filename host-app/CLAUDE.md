@AGENTS.md

<!-- motu:rules -->
motu is an ARCHITECTURE framework: a page's regions are built one at a time and kept coherent by what is
DECLARED — who owns each key, which island fills which slot, what the region asks of a backend. The lagoon
renders every declared state at its own URL. These are the invariants; the detail is in the skills —
LOAD THE ONE THAT MATCHES YOUR TASK before you start it:

- `motu-regions` — declaring a region: islands vs host, ownership, sources/ports, adoption, parallel agents
- `motu-evidence` — scenarios, flows, worlds, the lagoon override, `motu lagoon try`, the final look
- `motu-checks` — which check when, exit codes, `integrate check`, the handover
- workflows: `island-locate` (survey a page) · `island-create` · `island-extract` · `archipelago-build`

Declaring
- What a region SHOWS or ACTS ON is an island; what merely ARRANGES it stays host. Survey the PAGE
  (`island-locate`) and write down owners before any island is built.
- Declare only what you DECIDED. Every key an island updates is in its `writes`; everything else bound is
  host-fed. One producer per key. Never compute in the page what one island did and pass it to another —
  declare the output. The page uses the binding's `useRegion()` / `seed(...)`, never a store.

Evidence
- New UI starts as an island with a scenario in `<name>.evidence.ts`, renders from defaults alone, and is
  looked at in the lagoon before it is placed. Changed UI starts with the scenario showing the state you
  will change.
- Evidence data comes from the app (fixtures it already has, typed with `import type`, imported by
  RELATIVE path) — never invented to make a frame render.
- Every declared state is an address (`motu lagoon states`); read `window.__motuLagoonState` before
  believing a screenshot. EXPLORE before you assert: `motu lagoon try <region> [step…]` (~5s) shows what
  each step moves; assertions are yours, never copied from its output.
- A flow step must be able to fail: end on what ANOTHER island renders. Adding an island means adding a
  step asserting its own render.
- The final look is a FRESH agent's, given only the state URLs, where the app's vocabulary lives, and
  the question "does anything render what this app never uses?" — never your diff or reasoning.

Checks
- Before saying UI work is done: the host's own typecheck and tests (motu checks neither), `motu check`,
  then `motu integrate check`. Runtime checks are a punctual gate: name the region you touched
  (`motu archipelago verify <id> --runtime`); `motu check --runtime` once, before handing over.
- Exit codes: 0 holds · 1 contradicted → repair · 2 could not run → retry, do NOT repair. A check that
  examined nothing has not passed.
- Several agents on one region: you own ONE slot; do not repair shared infrastructure (report exit 2);
  never symlink `node_modules` into a worktree.

Handover
- A person must be able to open it: `motu lagoon serve --watch --detach` (or `motu lagoon publish
  --remote`), and end your report with the URL and the state to look at.
<!-- /motu:rules -->
