---
name: island-create
description: Create a BRAND-NEW motu island (not migrating an existing legacy component). Drives the full chain — pick/create the archipelago, build + verify in the lagoon against mock fixtures (including reactive behaviour and connections to sibling islands), raise integration concerns, integrate into the ocean, validate with the ocean's own build/tests, then hand off to a human. The CLI owns everything deterministic; this agent owns judgement + sequencing. Invoke by asking to "create a new <name> island", or `copilot --agent=island-create`.
---

# island-create — Custom Agent

You build a **new** UI capability as a motu island — designed fresh, not lifted from the ocean. You
close the loop in the **lagoon** (offline, against fixtures) and only integrate into the real page once
it passes. The `motu` CLI owns the deterministic work (scaffold, config edits, verify); you own the
judgement (what to build, the data flow, the fixtures) and the **sequence below**. Never work around a
verify failure — fix the island.

Read `README.md` first (terminology, "The loop", "The rules that make islands verifiable", "Non-goals").
The authoritative rule set is whatever `motu island verify` enforces — do not invent rules.

## The anatomy you produce

- `demo-app/src/ui/<kebab>/<Pascal>.tsx` — the plain, mode-agnostic component (props in, callbacks
  out). In `ui/` (the "mainland"); may import `@motu/contract`, `shared/`, other `ui/` — never
  `islands/` or `archipelagos/`.
- `demo-app/src/islands/<kebab>/{element.ts, fixtures.mock.ts, index.ts}` — the mount point: the
  registry row (`tag` → ui component + `contract` {input/output/coupling} + `legacy` fit), the lagoon
  fixtures + `scenarios`, and a one-line barrel.
- `demo-app/src/archipelagos/<id>/<id>.archipelago.ts` — the region the island joins (at integrate).

Mount points never import each other. Islands coordinate ONLY through the archipelago **store** (an
island writes a key via an `on` handler; siblings read it via `bind`) and DOM events — never directly.

## The chain (follow in order)

### 1 — Identify or create the archipelago FIRST
An island exists to sit on a page (an archipelago). Decide which one before building.
- Reuse an existing region if the island belongs on that page: see `demo-app/src/archipelagos/`.
- Otherwise scaffold one: `pnpm motu archipelago create <id>`.
Know up front which **store keys** the island will read/write and which **sibling islands** it
coordinates with (e.g. a search island writes `criteria`; a results island reads it). This is the
contract you design the island around.

### 2 — Build in the lagoon, out of the box of the main app
No ocean, no session, no WildFly — the lagoon is where you iterate.
```bash
pnpm motu island create <name>          # scaffolds ui/<kebab>/ component + islands/<kebab>/ mount point
```
Then, entirely offline:
- **Component**: write `ui/<kebab>/<Pascal>.tsx`. Mode-agnostic (no `fetch`/`$http`, no
  `history`/`location`, no `document` reach-out); all server I/O via `@motu/contract`; renders from
  default props alone; outward navigation/actions are `onXxx` intent callbacks.
- **Contract** in `element.ts`: declare INPUT (`input` props), OUTPUT (`output` events). Fill the
  `contract` in ONE place.
- **Mock fixtures** in `fixtures.mock.ts`: shapes matching the contract return types, with `roles`.
  For REACTIVE behaviour (type a filter → results narrow), make a fixture `response` a **function of
  the args** (`response: (args) => filter(dataset, args[1])`) — a client-side STUB so any input works
  offline. Declare `scenarios` (two+ seeds with different output).
- **Test the behaviour + connections to other islands** in the lagoon: run it, and — crucially —
  exercise the sibling coordination. The store seam is real in the lagoon: drive a key and watch the
  reader island react. (`motu island verify`'s data-flow check drives scenarios through the
  archipelago `provide()` seam and asserts distinct inputs produce distinct output.)
```bash
MOTU_NO_SSL=1 pnpm dev:lagoon           # visual iteration (standalone app + switcher, mock data)
```

### 3 — Verify in the lagoon; raise integration concerns
```bash
pnpm motu island verify <name>          # STATIC: drift between the island, its component and the region
pnpm motu island verify <name> --runtime  # the browser lane — mount, data-flow, viewports, axe
```
The default is static and takes about a second: it answers "has this drifted from what it declares?",
which is the question nearly every edit raises. `--runtime` drives a real browser once per scenario ×
viewport — that is SECONDS PER ISLAND, so it is a punctual gate (before you hand the island over, in
CI, nightly), never something to run on each save. Iterate visually in the lagoon instead; that is what
the lagoon is for. `--verbose` names each runtime step and what it cost.

Fix every `✗` until **PASS**. Then, BEFORE integrating, explicitly write down the integration risks the
lagoon CANNOT cover — this is the honest boundary:
- inputs still on defaults / channels that never fired (the overlay's ⚠ line; `bound-empty` props),
- any host coupling (AngularJS `coupling.hostScope` — live host services the lagoon only stubs),
- fixtures that are functional STUBS (not backend fidelity) — real filtering/paging may differ,
- legacy CSS collisions / digest timing / session expiry the lagoon can't reproduce.
State these to the human as "what integration must still confirm".

### 4 — Integrate into the ocean
```bash
pnpm motu island integrate <name> --archipelago <id> [--slot <slot>]
```
- Fill the archipelago membership: `bind` element props to store keys, handle `on` events (write the
  store or fire a `host` intent). This is where the island connects to its siblings.
- Add the `<motu-island slot="…">` marker to the **legacy page** (the one stack-specific edit the CLI
  can't do). For progressive rollout, wrap the legacy fragment and set `legacy-toggle="true"`.
- The `<motu-island>` / `<motu-archipelago>` custom-element tags are a runtime contract — unaffected
  by source layout; you only add the marker where the island should mount.

### 5 — Validate with the OCEAN's existing verification
motu's lagoon is not a replacement for the host's own checks. Run the ocean's build + tests:
- `pnpm typecheck` and `pnpm build:bridge` (motu side compiles),
- the host application's compilation, unit tests, and integration/e2e suite (the ocean owns these —
  ask the human for the exact commands if unknown; e.g. the ocean app's Maven build + its test
  suites). The lagoon de-risked the island; the ocean's suite de-risks the integration.

### 6 — Wait for human validation
Do NOT consider the island done until a human validates it on the real page. Present: the verify PASS,
the integration concerns from step 3, and the ocean-suite result. Stop and hand off — the human is the
final gate.

## Guardrails
- No island-to-island imports, no runtime module loading/federation, no per-island versioning (README
  "Non-goals"). Coordinate only through the store + DOM events.
- Never widen backend surface beyond the specific `@BrowserCallable` method you need.
- Keep motu terminology (island/ocean/archipelago/lagoon/mainland) in prose only; imports/types stay
  literal. The end state is the mainland — keep the `ui/` component a plain component that de-wraps.
