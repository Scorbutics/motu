<!-- motu:rules -->
UI work goes through motu (islands, archipelagos, the lagoon):
 - What the region SHOWS is an island; what merely ARRANGES it is not. A component that places islands
   (a layout, a navigator that holds slots) and an overlay anchored to a DOM id anywhere on the page
   stay host components. Content → island. Arrangement / overlay → host.
 - NEW UI content starts as an island with at least one scenario in its `*.evidence.ts`, and is looked
   at in the lagoon (`motu lagoon serve --watch`, or `motu island verify <name>`) BEFORE it is placed
   on a page. An island must render from defaults alone — every input optional, with a default.
 - CHANGED UI starts with the scenario that shows the state you are about to change. Then change it,
   look at it, and keep the scenario as the regression. A scenario set whose members render identically
   fails `data-flow` — that check exists because fake evidence is worse than none.
 - Region state is DECLARED, not emergent. A key an island updates is declared in that island's
   `writes` (event → key); a key the host feeds is in the region's `provides`. The page cannot assign a
   produced key — the host-side region type omits them, so it is a compile error. If you find yourself
   computing a value in the page from what one island did and passing it to another, that is the
   laundering the ownership rules exist to stop: declare the output instead.
 - The page reads region state with the binding's `useRegion()` and establishes it with `seed(...)`,
   both typed from the archipelago (`createRegion`). Never reach for a store directly.
 - Before saying UI work is done: `motu check` (island + archipelago verify over everything, plus
   removal-check), on top of the host's own build. It takes `--json`. Warnings are findings, not noise —
   `props-match` and `ownership` exist because each caught real coupling.
 - `motu check --runtime` adds what only a browser can answer: the island mounts, its scenarios differ,
   it fits every declared viewport, axe finds nothing in it, and every declared write reaches its key.
   Viewports and the a11y severity policy are declared once in `lagoon.config.json`.
 - A region declares its FLOWS in `<id>.evidence.ts` beside the archipelago: a seed, an island's
   declared `emit`, and the keys the region must hold afterwards. That is where a coupling becomes
   something that runs — `motu archipelago verify --runtime` fails when a flow no longer ends as
   declared. A flow may only fire a declared output; if you reach for a selector, you have left the
   harness and written a browser test.
 - `motu island snapshot --all` checks the visual baselines (one per scenario × viewport, committed
   beside the evidence). A difference writes `.actual.png` and `.diff.png` next to the baseline — LOOK
   at them; re-record with `--update` only when the change is what you intended.
 - `docs/plan-key-ownership.md` in the motu repo is the design record for ownership, eject and the
   verify checks; read it before changing how a region declares anything.
<!-- /motu:rules -->
