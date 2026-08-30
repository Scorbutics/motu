# Survey: the lagoon VIEW

The page at `/<repo>/<ref>/<slug>` — the one that frames a published artifact and draws the controls
around it. Written before any island exists, per the rule that a page is surveyed before it gets
them, so every owner is declared once and a second claim on a key fails statically.

## Why this page, and why it was missed

It is the largest UI in this repository — roughly 3,900 lines across `packages/chrome/src/dock.mjs`,
`packages/host/src/views.mjs` and `packages/react/src/tideline.ts` — and until now none of it was
declared: no islands, no evidence, no flows. `motu check` reported PASS over four regions while the
screen a person actually uses to look at a lagoon was outside motu entirely.

This is the same finding `index.archipelago.ts` records about itself one page earlier: that page was
rendered from `views.mjs` string concatenation, "byte-identical and not motu at all", and was caught
by looking at the screen and asking where it was in the lagoon. The viewer is that story again.

The structural reason is written in `host-app/app/[...path]/route.ts`: the viewer is served from a
route HANDLER, and "a route handler cannot render the region, because Next will not allow
`react-dom/server` inside one". That is why `dock.mjs` is vanilla JS in the first place, and why
declaring this page means making it a page.

## Does the page become an archipelago

Yes — `lagoon-view`. It has genuine shared state that more than one control reads and writes
(`region`, `flow`, `view`), which is the thing an archipelago exists to declare. Every bug in this
surface this month has been a coupling one: the sidebar lighting "As seeded" whatever you pressed,
the phone strip and the panel list disagreeing about which state is showing, a switch leaving the
address claiming an island you had left.

## What is an island, and what stays host

An island SHOWS or ACTS ON the region. What merely arranges it does not.

| slot | element | owns (writes) | reads |
|---|---|---|---|
| `stations` | `x-dock-regions` | `region` | `regions`, `region` |
| `states` | `x-dock-states` | `flow` | `states`, `flow` |
| `rail` | `x-dock-rail` | `open`, `picking` | `open`, `picking` |
| `rig` | `x-dock-rig` | `view`, `lensOn`, `couplingOn`, `recording` | those four |
| `tabs` | `x-dock-tabs` | `tab` | `tab` |
| `filter` | `x-dock-filter` | `filter` | `filter` |
| `seams` | `x-dock-seams` | — | `seams` |
| `islandsPane` | `x-dock-islands` | — | `islandRows` |
| `coverage` | `x-dock-coverage` | — | `coverage` |
| `palette` | `x-dock-palette` | `paletteOpen`, `paletteQuery` | both, `regions`, `states` |

**`x-dock-states` is ONE island placed in TWO slots** — the panel's list on desktop and the strip on
the phone bar. Not two islands: "either of these writes `flow`" is not a producer, and the ownership
guard is right to refuse it. This is the peps precedent exactly (one filter panel, desktop and mobile
drawer, one producer). The two renderings differ by CSS and by which slot the layout fills.

**Host, not islands:**

- the artifact `<iframe>` — it is the thing being viewed, not a view of the region
- the scrim, the grab handle and the drag-to-dismiss gesture — an overlay anchored to the dock, which
  the rules keep as host chrome
- the bay's title and subtitle — text the page computes, showing nothing the region owns
- the page inset (`html[data-motu-dock]`) and `--motu-dock-handle` — layout bookkeeping about where
  the dock stands, not region state

## Ownership

Host-fed, DERIVED, and therefore declared by nobody's `writes`: `regions`, `states`, `seams`,
`islandRows`, `coverage`, `title`, `subtitle`. They come from the artifact's catalogue and its lens,
which is a seam no island can reach.

Produced: `region`, `flow`, `view`, `open`, `picking`, `tab`, `filter`, `lensOn`, `couplingOn`,
`recording`, `paletteOpen`, `paletteQuery`.

The one that needs saying out loud: **`flow` is written by `x-dock-states` and by nothing else.** The
rig does not write it, the palette does not write it — the palette RUNS a state by asking the region,
which is the same key travelling, not a second producer.

## Order of work

`region` and `flow` are what this was asked for, and they are also the two the dock keeps getting
wrong, so `x-dock-regions` and `x-dock-states` are built first with evidence and flows. Every other
island above is declared `planned: true` in the same commit: ownership counts a planned island, so
the registry is complete from the start and nobody can claim `view` or `tab` twice while they are
being built.

The vanilla dock keeps drawing the screen until the islands replace it slot by slot. It is retired on
the host path once the page renders the region — not before, because an artifact published before the
control surface existed still has no other chrome.

## What this does NOT close

The six Playwright cases in `packages/cli/test/lagoon-gallery.test.mjs` assert things a region flow
cannot reach: that returning to "As seeded" RELOADS the document, and that a switch rewrites the
address. Those are facts about a document and its URL, not about a region's keys, so they stay until
a declared flow genuinely covers the same case.
