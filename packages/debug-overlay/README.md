# @motu/debug-overlay

A dev-only, **read-only** lens that makes island seams visible on the running page. It draws over any
page containing islands and surfaces what is normally invisible: which islands are mounted, what is
wired to them, and what flows across the boundaries. It never edits a store, fires a channel, or
forces a render.

It is driven entirely by data the framework already holds — the island definition registry, the mount
registry, the shared store, and the transport call log. There is **zero per-island cost**: no island
opts in or declares anything.

## Turning it on

The overlay is present only in **debug builds** (gated on the `__MOTU_DEBUG__` build constant, so it
tree-shakes out of production). Where present, it is **off by default**:

- **Keyboard shortcut:** `Cmd/Ctrl` + `Shift` + `G`.
- **Affordance:** a small `● seams` pill, bottom-left.

The open/closed choice persists in `localStorage` (`motu:debug`).

Builds where it is present:
- **Lagoon** — always (`MOTU_DEBUG=0` strips it).
- **Embedded bridge hot-reload** (`pnpm dev:console`) — on.
- **Production bridge** (`pnpm build:bridge`) — stripped.

## The two levels

1. **Outlines** (glanceable, low noise) — every mounted island is outlined and labelled with its
   component tag, registry slot, and isolation mode. The outline colour is the island's health verdict
   (below). This is the whole-page scan.
2. **Detail panel** — click an island (its label chip or its row in the panel list) to inspect it: its
   declared props with bound-vs-default state, the store keys it reads, the events it emits, and the
   contract calls attributed to it. A global call log with duplicate detection sits at the bottom.

Use the `▾` header button to collapse to outlines-only; `✕` (or the shortcut) closes it.

## What the states mean

### Island verdict (outline + list dot colour)

| Colour | Meaning |
|---|---|
| 🟢 green (`ok`) | Every declared prop is bound and flowing. |
| 🟠 amber (`warn`) | Some prop is bound to an empty store key, or sitting at its default. |
| 🔴 red, solid (`broken`) | **Every** declared prop is at its default — almost always broken wiring. |
| ⚪ grey (`neutral`) | The island declares no props to reason about. |

An island running entirely on defaults inside a real page is the single most valuable signal in this
tool. In the **lagoon**, where few channels are connected, this is expected and shows you exactly what
is *not* wired — the render-from-defaults rule made visible.

### Prop badges (detail panel)

| Badge | Meaning |
|---|---|
| `BOUND` | Bound to a store key that currently holds a value. Shows `key = value`. |
| `BOUND-EMPTY` | Bound to a store key, but the store value is `undefined` — wired to a dead key. |
| `STATIC` | Set once via the archipelago's static `props`. |
| `DEFAULT` | Declared on the element but never bound or set — the component's own default is in effect. |

### Isolation

`shadow` or `light`, read from the DOM (`el.shadowRoot`). This reflects the island's **runtime**
isolation, which can differ from how it was registered — a shadow-configured island renders `light`
when nested inside an archipelago region.

### Contract calls

Each call shows a status dot (blue = in flight, green = success, red = failed), the `service/method`
endpoint, the island it was attributed to, and its status/duration. `×dup` marks an endpoint+args
combination fetched more than once — often two islands asking for the same data.

### Channels

Each channel shows a status dot and its target store keys:

| Dot | Meaning |
|---|---|
| 🔴 red (`never fired`) | Installed but has never written the store. *Did the event never happen, or was the payload wrong?* — this answers the first half. |
| 🟠 amber (`orphan`) | Fired, but no island binds a key it writes — the data goes nowhere. |
| 🟢 green (`live`) | Fired **and** a mounted island reads a key it writes — connected on both sides. |

Live channels also show the write count, how long ago they last fired, and a preview of the last
payload (so you can check the *payload was wrong* half).

### Store coupling

Per archipelago store, each key shows `Nr/Mw` (reader islands / writer islands) and a flag:

| Flag | Meaning |
|---|---|
| `COUPLED` | Touched (read or written) by three or more islands — coupling accreting back into the shared store. |
| `DEMOTE?` | Read by exactly one island (and written by at most one) — a demotion candidate that could move out of the shared store into a prop. |

## Limitations

- **In-component event-driven calls** — a contract call fired from an event handler *inside* a React
  component (e.g. clicking "next page" within the island) runs outside the island's attribution window
  and is left unattributed. Mount- and prop-change-driven calls (the common self-fetch pattern) are
  attributed precisely.
- **Writer attribution** covers writes made in an archipelago's `on` handlers (tagged by slot); a key
  written only by a channel or the host `provide()` seam shows `0w` even though it changes.
