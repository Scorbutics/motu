# The lagoon

The lagoon is the sandbox: the application's own components, mounted against the project's evidence
with no backend, no session and no host application around them. The evidence reaches them through one
of two mock layers — `MockTransport` at the contract seam, or a fake `fetch` beneath the app's own
client (see [the two stand-ins](#the-two-stand-ins-and-which-to-reach-for)). This page answers
how to open it, how to address one state inside it, how to serve or publish it, how to host it for
other people, and how its visual baselines work. Vocabulary is in
[01 — Concepts](01-concepts.md); the composition shapes it renders are in
[06 — Composition and adoption](06-composition-and-adoption.md).

---

## What it is, and what it is not

The lagoon proves **a component and its declared boundary**: one island or one page's islands, no
backend, fixtures, deterministic, headless, exit-coded, publishable as a page that opens on a phone
(`README.md`).

It does not prove **the system**. Cross-page behaviour — island A changing what island B shows on
another page — is mediated by the database, and the honest tools for it are the real app running
locally with auth bypassed, plus Playwright (`README.md`). Simulating that backend inside the
lagoon (a stateful fake, the schema in pglite) was investigated and declined: it reimplements business
logic that cannot be diffed against the original, and the moment the lagoon has a backend it loses
determinism, one-cause failures, speed, and the artifact with nothing behind it (`README.md`).

**It is always mock-backed, and there is no way to make it otherwise from the browser.** The two mock
layers are guaranteed differently, and it is worth knowing which is which. At the CONTRACT seam a
published or served artifact is built with `MOTU_TRANSPORT='mock'` unconditionally
(`packages/cli/src/commands/lagoon.mjs:81-84`), and every other build a person opens is mock because
nothing offers them a choice (`packages/react/src/transport-mode.ts`) — an env var the browser cannot
reach. At the WIRE, the fake is installed by the project's own region module, so nothing structural
stops a project handing its client a real one; what holds the line there is a CHECK rather than a
build flag. `stubs-sealed` fails the run when any request escaped to a real host, matched no declared
fixture, or was answered by the dev server instead of a stub
([07 — Checks and verification](07-checks-and-verification.md)).

The chip that used to offer one is gone, and the reason is the addressing contract rather than the
artifact. A lagoon address promises a DECLARED state, and a name that resolves to nothing refuses to
render precisely because being handed a different state while believing it is the one you named is
the failure worth engineering against. `?transport=http` was that failure through a side door: the
address still resolved, `window.__motuLagoonState.ok` stayed `true`, and what rendered was whatever
the backend held that second — different for two people opening the same URL, and useless as a
snapshot baseline. It was also a data path with no declaration, in a framework where scenarios,
`seed`, channels, `sources` and `capture` are all declared and therefore comparable; and it answered
a question the design assigns elsewhere, since the far side of the port belongs to the operations
ledger and to unit tests, not to the lagoon. The remembered `motu:transport` in localStorage made it
worse by outliving the intention: one peek turned every address opened afterwards undeclared.

`http` survives as a BUILD-TIME input with exactly one caller — `motu fixtures record <island>
--transport http`, which boots a headless lagoon against the real backend, drives the island's
declared scenarios and writes fixtures to disk (`packages/cli/src/commands/fixtures.mjs`). Nothing is
previewed and nothing is asserted against live data: its output is a declared artifact everything
downstream compares against, which is the capture-refresh shape rather than a live mode. `httpBase`
and `transportFor` exist to serve that one build; there is deliberately no `transport` key in
`lagoon.config.json`, because a committed `"transport": "http"` would be the mode again in
configuration form.

---

## Two entries, and which command builds which

| Entry | File | Chrome | Driven by |
|---|---|---|---|
| **gallery** | `index.html` → `src/main.tsx`, `startLagoon` | full — tide line, stations, view toggle, transport/fit chips, the lens | a human; `lagoon serve`, `lagoon publish` |
| **focused** | `lagoon.html` → `src/lagoon.tsx`, `bootstrapLagoon` | none, deliberately | `motu island verify`, `motu archipelago verify --runtime` |

Both are written by the framework into `.motu/cache/lagoon/` unless the project owns its own
`index.html`, which is the ownership marker (`packages/cli/src/lib/lagoon-materialize.mjs:45-48`,
`:91-96`). `motu lagoon eject` writes them into the project instead, after which motu stops
regenerating them (`packages/cli/src/commands/lagoon.mjs:681-695`).

`resolveTarget` picks the entry (`packages/cli/src/commands/lagoon.mjs:36-70`):

| Invocation | Entry built | `MOTU_TARGET` | slug |
|---|---|---|---|
| `motu lagoon publish` (no target) | gallery | `''` | `all` |
| `motu lagoon publish --archipelago <id>` | **gallery**, focused on that region | `archipelago:<id>` | `archipelago-<id>` |
| `motu lagoon publish <island>` | focused | `island:<tag>` | `island-<kebab>` |

A region publish deliberately uses the gallery entry, not the bare one: `serve` and `publish` are for
a human to look at, and the chrome is most of what makes the lagoon worth looking at
(`packages/cli/src/commands/lagoon.mjs:44-47`).

---

## Declaring a lagoon

A project **declares** its lagoon rather than coding it. What JSON can hold goes in
`roots/lagoon/lagoon.config.json` (`about`, `transport`, `defaultTheme`, `mount`, `chrome`,
`stations`, `viewports`, `alias`, `env`; see [04 — Configuration](04-configuration.md)). What JSON
cannot hold — functions and objects — goes in `roots/lagoon/src/lagoon.tsx` (or `.ts`), resolved at
`packages/cli/src/lib/lagoon-materialize.mjs:62-63` and imported by **both** entries
(`packages/cli/src/lib/scaffold.mjs:257-260`, `:380`).

### The override file is a MAP, not a page

> The lagoon override file is a MAP, not a page. `layout` points at the APPLICATION's own layout
> component — never a second JSX copy of the arrangement, which drifts for the same reason a second
> copy of the region's vocabulary does. `seed` is data. Anything that REACTS has one of TWO homes, and
> neither is the frame. A `channel` installs the application's own SOURCE over a port. The WIRE FAKE
> answers HTTP BENEATH the app's real service, so the service itself runs instead of being replaced.
> Both are installed for every view, which is the property that matters. Behaviour written inside the
> frame runs only in the region view, where those checks are not.
> — `.github/host-rules.md`

One line per region; each region's own seed, arrangement and stand-ins live beside it in `regions/`
(`host-app/motu/roots/lagoon/src/lagoon.tsx:1-16`).

### The two stand-ins, and which to reach for

A region module holds three kinds of thing, and only two of them are `RegionOverrides` fields:

| | What it is | Where it lives | What runs for real |
|---|---|---|---|
| `seed` | data | a field | nothing — it is a value |
| `channels` | the app's own SOURCE, over a port | a field | the source: its timeout, its generation guard, its error mapping |
| `wire` | a fake `fetch` under the app's real client | a field, via `wireFrom({ to, … })` | the source AND everything below it — the service, its URL building, its status handling, its error mapping |

```tsx
// roots/lagoon/src/regions/review.tsx — both, in one module
const wire = wireFrom({ to: reviewArchipelago, appRoutes: ['/api/baselines'], fixtures: [ … ] });

export const reviewRegion = overridesFor(reviewArchipelago, {
  seed: reviewSeed,
  wire,
  channels: [channelFrom({ to: reviewArchipelago, id: 'shots', args: [shotsWirePort] })],
});
```

Reach for the **wire** when the application's own client code is what you want exercised — a module
swap runs the source and stops there, so the service beneath it never executes and nobody notices,
because the swap is silent by construction. Reach for a **channel** when the region needs a key fed.
A region commonly has both, as the one above does.

The rule that has not changed is the one that matters: neither lives in the frame. Both are installed
for **every** view — which is what lets the checks that drive the region see the same answers a human
does.

The wire used to be a bare `installFakeFetch(...)` at the module's top level rather than a field, and
that cost three things, all of them now gone: `appRoutes` was written twice with nothing checking that
the two agreed (`createPostgrestFetch` stamps its own claim, and the installer reads it); the fake was
bound to no region, so nothing could compare the routes it answers against the `reaches` its sources
declare; and the installer latched on a global boolean, so a SECOND region with a wire was a silent
no-op — its routes went to the dev server, its islands rendered empty, and nothing said why. Fakes
register now, and one patch asks each in turn.

`installFakeFetch` is still exported and still works. One case genuinely needs it, or `armFakeFetch()`
at the top of `lagoon.tsx`: a client that captures `globalThis.fetch` at IMPORT time
(`createClient(url, key, { global: { fetch } })` evaluated at module scope) keeps whatever `fetch` was
when its module ran, so a patch installed later is talked past. Hand such a client `wire.fetch`
directly, or arm the patch before any application module is imported. What fired stays legible either way: the lens shows a channel, and `data-reach` /
`provenance` show what went over the wire. Transports, fixtures and the fake's supported surface are
[11 — Contract and backend](11-contract-and-backend.md).

### `overridesFor(archipelago, { … })`

The strongest form. Each entry carries the id it belongs to, so the region's name is written once — in
the archipelago — and nothing in the lagoon can disagree with it
(`packages/react/src/lagoon-overrides.ts:99-158`).

```tsx
// roots/lagoon/src/regions/signin.tsx
export const signinRegion = overridesFor(signinArchipelago, {
  seed: { authError: null },
  channels: [channelFrom({ to: signinArchipelago, id: 'signin', args: [LAGOON_SIGNIN] })],
});

// roots/lagoon/src/lagoon.tsx
export const regions: LagoonOverrides['regions'] = [signinRegion];
```

What the reference buys, all of it from the one argument
(`packages/react/src/lagoon-overrides.ts:108-117`): the id is derived so it cannot be misspelt; `seed`
is `Partial` of the region's OWN type, so a key the region does not declare is an error here rather
than a value the lagoon stores and no island reads; `layout` and `props` are keyed by the DECLARED
SLOTS; and a channel built against a different archipelago is refused with a message naming both
regions (`:138-148`).

### Every field of a region override

`RegionOverrides`, `packages/react/src/lagoon-overrides.ts:16-48`:

| Field | Meaning | Installed in |
|---|---|---|
| `seed` | initial store contents, so bound islands render meaningfully (`:19`) | both views |
| `channels` | inbound seams — host signals mirrored into the store, as the real composition roots do (`:21`) | **every** view |
| `wire` | the fake `fetch` beneath the app's own client, built by `wireFrom({ to, … })` | **every** view |
| `layout` | the region's ARRANGEMENT: the application's own layout component, called with islands in its slots (`:22-26`) | region view only |
| `providers` | the environment the islands cannot render without (`:27-31`) | **every** view, per island |
| `props` | per slot, the props the PAGE passes on the island element itself, for what is not region state (`:32-33`) | both views |
| `hostProps` | per ROOT PROP the islands do not fill: a `hostSlots` component's props, or a plain prop's value. DATA ONLY (`:34-47`) | region view (via `root`) |

Confusing `layout` with `providers` is invisible in the region view and fatal in the mountpoints view
(`packages/react/src/lagoon-overrides.ts:28-30`) — and mountpoints is the view the flow checks drive,
so it reads as "the region rendered nothing" rather than "no providers"
(`.github/host-rules.md:174-178`).

There is a second, older **kind-first** shape — `seed`, `layout`, `channels`, `providers`, `props`
each a `Record<regionId, …>` — still accepted and still meaning the same thing. Where both name a
field, the region-first one wins, because it is the more specific statement about that region
(`packages/react/src/lagoon-overrides.ts:8-11`, merge at `:80-94`). Prefer region-first: the kind-first
file is the one two parallel agents are guaranteed to collide in (`:3-6`).

The whole-lagoon fields sit alongside `regions` in `LagoonOverrides`
(`packages/react/src/lagoon-gallery.ts:68-79`): `host` (the outward seam, defaulting to logging
intents), `setup` (run before anything mounts), and `transportFor`.

### `inventedArrangement(reason, node)`

The escape hatch for a frame that genuinely cannot be the page's own code, and it costs a sentence.
The reason stays in the file, where the `region-root` check finds it and prints it beside a WARNING
instead of an error (`packages/react/src/lagoon-overrides.ts:160-173`); warnings do not fail
`motu check` (`.github/host-rules.md:438-439`). It is a HOLD, not an answer — a copy drifts, and this
project shipped a lagoon that said "On récupère ton accès" over a page that said "Mot de passe
oublié ?", which no check could see (`packages/react/src/lagoon-overrides.ts:168-170`).

---

## How a region mounts

Preference order in the region view, most faithful first
(`packages/react/src/lagoon-react-mount.tsx:242-251`):

1. the archipelago's **`root`** — the application's own component, the same one the page renders,
   composed from the same `slots` (`:247-248`);
2. its **`layout`** template — for an ocean, whose legacy page cannot hand React anything (`:250`);
3. **declared order** — the islands, one after another.

There is deliberately no hand-written frame in between any more: one existed, it was a second copy of
the page, and every copy drifted (`:245-246`). Which shape a region should be in, and the staged path
to `root`, is [06 — Composition and adoption](06-composition-and-adoption.md).

Two views, toggled from the tide line and persisted in `localStorage`
(`packages/react/src/tideline.ts:44`, `:927-938`; `packages/react/src/lagoon-gallery.ts:138`, `:327`):

| View | What it renders | What it is for |
|---|---|---|
| `region` | the arrangement above — what a person sees | looking at the page |
| `mountpoints` | one labelled `motu-frame` per slot, in a grid (`lagoon-react-mount.tsx:213-229`) | probing wires; the view the flow checks drive |

The mount also installs `window.__motuLagoon` — `provide`, `seed`, `emit`, `read`, `held`,
`hostCalls`, `outputs`, `channels`, `remount` — so the same checks run against the React mount path as
against the element path (`packages/react/src/lagoon-react-mount.tsx:261-267` and following).

---

## States are addresses

Every state a project has written down is reachable by URL. The failure this refuses is the quiet one:
ask for a scenario that does not exist, get the default state, and believe you are looking at the
state you named (`packages/react/src/lagoon-states.ts:25-27`).

### The URL scheme

| Address | Opens |
|---|---|
| `/?target=island:<tag>` | that island, ALONE, in the gallery's chrome |
| `/?target=island:<tag>&scenario=<name-or-slug>` | that island seeded with that scenario |
| `/?region=<id>` | that station, no state applied |
| `/?flow=<name>` | the region declaring that flow, replayed to its end |
| `/?region=<id>&flow=<name>&step=<n>` | that flow, stopped after `n` steps |

Read at `packages/react/src/lagoon-states.ts:111-123` (`scenario`, `flow`, `step`, `region`) and
`:134-139` (`target`). Printed by `motu lagoon states`
(`packages/cli/src/commands/lagoon.mjs:755`, `:782`) and by `motu --help`
(`packages/cli/src/run.mjs:117-124`).

**Both forms are the GALLERY's** — the entry `serve` and `publish` build, and the one a person opens
(`.github/host-rules.md:109-116`). Both are also honoured by the focused entry, because an address
only one of them honours is one a person pastes and watches render something else
(`packages/react/src/lagoon-states.ts:17-19`).

> **This changed.** An island scenario used to be addressed as `/lagoon.html?target=…&scenario=…`.
> That path landed on the gallery — which `serve` and `publish` serve at every path — with a `target`
> the gallery ignored: the first region rendered, no banner, and the URL looked like it had worked
> (`packages/cli/src/commands/lagoon.mjs:751-754`). The gallery now reads an `island:` target
> (`packages/react/src/lagoon-gallery.ts:282-325`) and is given `scenarios` as well as `flows`
> (`packages/cli/src/lib/scaffold.mjs:412-415`). Write `/?target=…`.

An addressed island mounts **alone**, through the same synthesised one-slot archipelago config that
`motu island verify` drives, inside the gallery's chrome — so what a human looks at is what was
verified (`packages/react/src/lagoon-gallery.ts:284-290`, `:368-393`). Deliberately not "the region
that declares it, seeded": an island can be standalone, in no region at all, and for one that IS in a
region a scenario is authored against the island's own prop names while the region binds different
ones (`:284-289`). Nothing in the station list is lit, and the tide line's bar carries the address
instead (`:394-398`, `packages/react/src/tideline.ts:95-101`). Picking a station leaves island mode
and strips `target`/`scenario` from the URL, so nobody is handed a link that reopens the island they
navigated away from (`packages/react/src/lagoon-gallery.ts:449-458`).

### `step=<n>` semantics

`step` is **1-based**, and absent means "the whole flow". `step=0` is the seed alone — the state the
flow STARTS from, which is a state worth looking at and one no check ever renders on its own
(`packages/react/src/lagoon-states.ts:296-298`). A step that only asserts (`expectRender`) still
counts, because skipping it silently would make `step=3` mean different things in the URL and in the
check (`:340-341`). `step=<n>` beyond the flow's length is an error naming the real count (`:326-328`).

Replay drives the SAME seam `runRegionFlows` drives — no assertions, no mutants, no verdict — so it
reaches the state the check asserts on and cannot reach a state the check could not (`:289-295`). It
waits for the region to mount and then for it to stop moving first: a flow used to seed its state into
a region whose source had not answered yet, the answer landed a moment later and overwrote it, and the
panel reported "applied 1/1" over a different screen (`:309-316`).

### A name that resolves to nothing REFUSES to render

Not a fallback, not the default state. `reportState` sets `window.__motuLagoonState` **and** paints a
fixed red `role="alert"` banner listing what the target does declare, **and** logs to the console
(`packages/react/src/lagoon-states.ts:212-240`). Both, deliberately: the machine flag is what a check
reads, the banner is what survives into a screenshot (`:213-216`).

On the gallery, the refusal also **mounts nothing** — `root.replaceChildren()`
(`packages/react/src/lagoon-gallery.ts:510-514`). The banner alone is not the refusal: leaving the
first region on screen under it is the substitution being refused, and a screenshot of that looks like
a working lagoon (`:293-294`).

Read `window.__motuLagoonState` before believing a screenshot (`.github/host-rules.md:119`). Its shape
is `{ ok, target, kind: 'scenario'|'flow'|'none', name?, applied?, of?, error?, available? }`
(`packages/react/src/lagoon-states.ts:54-67`). The whole catalogue is on the page too, as
`window.__motuLagoonStates` (`:242-246`).

The four refusals:

| Request | Outcome |
|---|---|
| `target=island:<tag>` not in this lagoon | `no island "<tag>" in this lagoon`, `available` = every tag (`lagoon-gallery.ts:296-304`) |
| `scenario=` naming nothing the island declares | `no scenario "<x>" in <tag>'s evidence`, `available` = declared names (`lagoon-states.ts:152-172`) |
| `scenario=` with no `target=island:…` | `?scenario= addresses an ISLAND's state — name the island …` (`lagoon-gallery.ts:316-323`) |
| `flow=` declared by two regions | `"<x>" is declared by N regions (…) — add &region=<id> to say which` (`lagoon-states.ts:202-205`) |

A bare `?flow=` picks the station only when it CAN: exactly one region declaring that name. Two, and
it says so and applies nothing — the alternative is opening a region nobody asked for, with a screen
that looks like the state they wanted (`packages/react/src/lagoon-states.ts:180-186`).

### `motu lagoon states [island|region]`

Prints every state this project's lagoon can be opened in, as a URL, from the same source the browser
gets (`packages/cli/src/commands/lagoon.mjs:698-707`).

| Flag | Meaning |
|---|---|
| `[island\|region]` | filter to one target (`:715`, `:739`, `:763`) |
| `--base <url>` | absolute URLs against a running lagoon instead of paths (`:714`) |
| `--json` | `{ islands, regions }` (`:789-791`) |

Paths, not absolute URLs, unless `--base` says otherwise: the port belongs to whichever lagoon is
running, and printing a guess that resolves to nothing is worse than printing the part that is always
true (`:704-707`). Each state is addressed by its **slug** where that is unambiguous and by its exact
name where it is not — the page resolves both, and printing the slug is what makes these URLs quotable
in a commit message (`:727-733`; slug and resolution order — `#2` position, exact name, slug — at
`packages/react/src/lagoon-states.ts:79-108`). A region URL always writes `region=` out even when the
flow name is unique, because flow names DO collide and a printed URL is what somebody pastes six
months later into a lagoon that has grown another region since
(`packages/cli/src/commands/lagoon.mjs:775-780`).

`step=` is not printed — append it yourself.

---

## `dev` vs `serve` vs `publish`

| | `lagoon dev` | `lagoon serve` | `lagoon publish` |
|---|---|---|---|
| Builds | a Vite dev server, in-process, with HMR (`lagoon.mjs:648-670`) | one self-contained page, held in memory | one self-contained page |
| Writes | nothing | nothing (unless `--no-build`, which reads) | `.motu/publish/lagoon-<slug>.html` (`:143-145`) |
| Transport | whatever `lagoon.config.json` says | forced `mock` (`:81-84`) | forced `mock` (`:81-84`) |
| Reload | HMR | `--watch` only (SSE, `:318-347`) | never — a published artifact that dials home is a lie about what the artifact is |
| Proves the artifact | no | **yes** | yes |

Use **`dev`** to iterate: it is the fastest loop and the only one with HMR. Use **`serve`** to look at
what you are about to publish, and as the only check that exercises the artifact rather than the
source — `dev` serves through Vite with the dev proxy, so it never proves the inlining worked or that
the page survives with no `/assets/` and no backend behind it. Use **`publish`**
for a link that outlives your process.

### `motu lagoon dev [island]`

| Flag | Meaning | Default |
|---|---|---|
| `[island]` / `--island <n>` / `--archipelago <id>` | sets `MOTU_TARGET`; prints "open /lagoon.html" (`lagoon.mjs:658`, `:668`) | none = the gallery |
| `--fit <native\|legacy>` | sets `MOTU_FIT` (`:659`) | unset |
| `--port <n>` | `config.server.port` (`:663`) | 5173 (`packages/cli/src/lib/lagoon-vite.mjs:320`) |
| `--allow-any-host` | accept any `Host` header; explicit because it lowers a real protection (`:661-662`) | off |

### `motu lagoon serve [island]`

| Flag | Meaning | Default |
|---|---|---|
| `--port <n>` | validated 1–65535 (`lagoon.mjs:410-414`) | 8817 |
| `--host` | also bind `0.0.0.0`, for a phone on the same wifi (`:416-417`) | loopback |
| `--no-build` | serve the last published artifact as-is (`:426-432`) | rebuilds |
| `--watch` | rebuild on save and live-reload open viewers; conflicts with `--no-build` (`:419-423`) | off |
| target flags, `--fit` | same as `publish` (`:399-408`) | |

It serves the same bytes at **every path**, `cache-control: no-store`
(`packages/cli/src/commands/lagoon.mjs:449-474`) — which is why an address that only worked on
`lagoon.html` used to appear to work here. It restores the `<!doctype>`/`<html>`/`<head>` skeleton
that `publish` strips (`:297-308`); without it the page gets no viewport meta and renders
desktop-width on a phone, which is the one device this is for. Rebuilds are
debounced 250 ms and keep the last good bytes on failure (`:570-599`).

For a phone that is not on your wifi the command prints an ssh one-liner
(`ssh -R 80:localhost:<port> nokey@localhost.run`, `:492-496`) — it deliberately does not run it for
you: that URL is public while it lives. If you already run tailscale, prefer it:
the tunnel is a property of the PORT, so whichever lagoon is serving on 8817 is what is exposed, and
pointing it at another project is just running `serve` there. There is no
`motu lagoon funnel` command.

### `motu lagoon publish [island]`

| Flag | Meaning | Default |
|---|---|---|
| `--archipelago <id>` | publish one region instead of an island (`lagoon.mjs:39`, `:42-43`) | — |
| `--fit <native\|legacy>` | legacy-fit strategy for a single-island target (`:168`) | `''` |
| `--out <path>` | write somewhere else (`:174`) | `.motu/publish/lagoon-<slug>.html` |
| `--title <text>` | name in the host's listing, truncated to 200 chars (`:166-167`) | derived from the target |
| `--remote [url]` | also upload; bare = `$MOTU_HOST_URL`, then `host.json` (`:184-185`) | off |
| `--token <secret>` | upload token (`:255`) | `$MOTU_HOST_TOKEN`, then `host.json` |
| `--json` | machine-readable report (`:187-190`) | off |

The build is forced to a single chunk (`MOTU_SINGLEFILE`) because nothing serves `/assets/*.js` behind
a static page; `inlineToArtifact` inlines every script and stylesheet, drops the document skeleton, and
**throws** if any `/assets/` reference survives, because that would show up as a silently blank page
rather than an error (`packages/cli/src/commands/lagoon.mjs:108-136`). The output path is stable per
target on purpose: republishing the same path redeploys the same URL, so a link already open on your
phone keeps working (`:138-142`).

---

## Publishing to a host

`motu lagoon publish` writes one self-contained page and `motu lagoon serve` puts it on a port, but
both need your laptop awake. A **lagoon host** (`motu-host`) is that URL without the laptop.

```bash
motu-host --token $(openssl rand -hex 24)      # serve on 127.0.0.1:8818
motu lagoon publish --remote                   # any project, any agent, same host
```

`--remote` **adds a destination**; it does not replace the artifact. The same bytes are written to
`.motu/publish/` first, so a host that is down or a token that is wrong costs you nothing, and there is
one build so local and hosted cannot drift
(`packages/cli/src/commands/lagoon.mjs:185`, `:203-209`).

### Where the host lives

Precedence is **flag → `$MOTU_HOST_URL` / `$MOTU_HOST_TOKEN` → `~/.config/motu/host.json`**
(`packages/cli/src/lib/remote.mjs:21`). The file is read from
`$MOTU_CONFIG_HOME || ~/.config/motu` and carries exactly two keys; anything missing or malformed
yields `{}` rather than an error (`packages/cli/src/lib/remote.mjs:23-33`):

```jsonc
{ "url": "http://127.0.0.1:8818", "token": "…" }   // mode 0600
```

That is the point of a long-running host: a fleet of agents across several repositories all publish
into one place without being configured.

The repository identity comes from the `origin` git remote parsed to `owner/name`, falling back to the
directory basename — the only name stable across machines and clones
(`packages/cli/src/lib/remote.mjs:50-68`).

### Two axes, because a link has two jobs

| URL | Meaning | Cached |
|---|---|---|
| `/<repo>/latest/<slug>` | the bookmark — follows every publish | `no-store` |
| `/<repo>/<branch>/<slug>` | the PR link | `no-store` |
| `/<repo>/<commit>/<slug>` | this build, immutable | one year |
| `/<repo>/<ref>/<slug>/__motu_frame` | the page's own bytes, for the shell to frame | as its ref |

**Every one of those serves a SHELL, and `__motu_frame` serves the artifact.** The shell is the rail,
the topbar and the dock — so the lens is on the URL a person bookmarks. It lists every lagoon this
viewer may see, with the one they opened selected, and each entry points at its own address rather
than an index into a list, so nothing has to agree with anything.

That replaced GROUPS. A group was a curated member list under `/g/<name>`, plus an immutable manifest
under `/m/<id>` to pin one — and it existed because the canonical lagoon URL served bare bytes, so
composing a group was the only way to get a rail, a dock or a lens at all. `b1719dd` had already
written down that "a group was never a thing to browse; it is a way of LOOKING at lagoons" and built
the half that mattered (an explicit per-lagoon `frameHref`), but never gave the canonical URL its
shell — so groups outlived the decision to remove them by months, listed on the host's own root index
while the motu-built index region had already dropped them. `/g/`, `/m/`, `/api/group`, `/api/groups`
and the manifest store are gone; every lagoon has the rail now, and an immutable address of its own
was always the honest way to pin one.

Templates at `packages/host/src/server.mjs:655-659`; cache headers at `:147-148`, decided by
`rec.mutable` which `resolveRef` sets true only for alias hits (`packages/host/src/store.mjs:188-202`).
Objects are content-addressed, so republishing an unchanged lagoon stores nothing new. A commit URL
from a **dirty tree** would be a lie — it would name a commit that does not contain what you are
looking at — so the CLI withholds the sha and the host falls back to the content hash, which is always
true (`packages/cli/src/lib/remote.mjs:70-78`,
`packages/host/src/store.mjs:165`). Ref lookups accept sha and content-hash prefixes, newest first
(`store.mjs:196-201`).

### Retention that cannot break a link

Two caps per repository, whichever binds first: `--max-records` (default **1000**,
`packages/host/src/store.mjs:30`) and `--max-bytes` (default **4 GB**, `:40`), also settable as
`MOTU_HOST_MAX_RECORDS` / `MOTU_HOST_MAX_BYTES` (`packages/host/src/cli.mjs:67`, `:72`). The byte cap
exists because records are not a proxy for size — a typical lagoon is ~430 kB, but Twenty's record page
inlines its whole front-end and publishes at 19.2 MB.

Eviction never touches a record a mutable alias points at (`packages/host/src/store.mjs:230-235`), and
orders by **last access** rather than publish date: a
six-week-old lagoon somebody bookmarked outranks ten builds from this morning (`:238`, `:210-215`).
Blobs are collected only once nothing references them, and two records sharing content are charged
once (`:258-260`, `:264-290`). A swept object answers **410**, not a blank page
(`packages/host/src/server.mjs:559`).

### Private repos

`motu-host access` writes a policy file (`access.json`, next to the store) read per request
(`packages/host/src/access.mjs:29`, `:50-59`). Unlisted repos are public
(`packages/host/src/access.mjs:74-76`); a repo marked `--private` is readable by the admin token, a
repo-scoped read secret, or the host-wide read secret, in that order (`:84-98`). Secrets are 32 random
bytes stored only as sha256 digests and compared in constant time (`packages/host/src/cli.mjs:134`,
`packages/host/src/access.mjs:32-47`); they are printed once (`cli.mjs:188`). `?k=<secret>` sets an
HttpOnly cookie and 302s the key out of the URL (`packages/host/src/server.mjs:228-237`).

A private repo answers **404, not 403**, with a body identical to a genuine miss
(`packages/host/src/server.mjs:524-533`). There is still no per-user account, so the read secret opens
every private repo, not just one.

Without a token the host accepts no uploads at all — every POST is `503`
(`packages/host/src/server.mjs:360`).

---

## Visual baselines

Two models. Pick one per project and do not mix them.

| | in-repo (`--update`) | on-host (`--remote`) |
|---|---|---|
| Baseline lives | `<islands>/<kebab>.snapshots/<scenario>@<viewport>.png` (`packages/cli/src/lib/snapshots.mjs:15-27`) | the host's store, as an accepted pointer per shot (`packages/host/src/store.mjs:314-318`) |
| Region baseline | `<archipelagos>/<id>.snapshots/…` (`packages/cli/src/commands/snapshot.mjs:301`) | island key `region-<id>` (`snapshot.mjs:316`, `:326`) |
| In git | the PNGs, committed (`snapshots.mjs:9-11`) | **nothing** (`packages/cli/src/lib/baselines.mjs:3-4`) |
| Failure artifacts | `.actual.png` / `.diff.png` beside the baseline (`snapshots.mjs:71-76`) | `.motu/snapshots/<island>/` — gitignored (`baselines.mjs:84-91`) |
| Blessing a change | `--update` overwrites | `--accept`, a separate command |

`<islands>` is the `islands` key of `motu.config.json`, default `src/islands`
(`packages/cli/src/lib/config.mjs:33`, `:327`). The scenario slug is lowercased with non-alphanumerics
collapsed to `-`, empty → `default`; the viewport is its NAME, not its width
(`packages/cli/src/lib/snapshots.mjs:20-27`; viewports default `{ mobile: 390, desktop: 1280 }`,
`packages/cli/src/lib/util.mjs:255-260`).

### Flags

`motu island snapshot <name|--all>` and `motu archipelago snapshot <id|--all>`
(`packages/cli/src/commands/snapshot.mjs:140`, `:354`; help at `packages/cli/src/run.mjs:150-159`):

| Flag | Meaning |
|---|---|
| `--update` | record baselines as FILES beside the evidence (the in-repo model) |
| `--remote [url]` | compare against the host's ACCEPTED baseline; nothing is written to git |
| `--accept [name]` | move the accepted pointer to what was last rendered |
| `--changed [base]` | only islands/regions this branch touched — widens back to everything, loudly, when a changed file belongs to no single one |
| `--all`, `--token <t>`, `--json` | (`snapshot.mjs:173`, `packages/cli/src/lib/baselines.mjs:22`) |

`--update` and `--remote` are mutually exclusive and say so:
`✗ --update writes files; --remote stores on the host. Use --remote then --accept.`
(`packages/cli/src/commands/snapshot.mjs:177-180`).

Comparison is `pixelmatch` over `pngjs` with a per-pixel threshold of `0.12` (absorbing antialiasing)
and an image-level fail line of **0.1 % of pixels**; a dimension change short-circuits to `resized`
because pixel comparison is meaningless across dimensions
(`packages/cli/src/lib/snapshots.mjs:45-59`, `:32-34`). Under `--remote` the host decides only the
STATUS — `new` / `match` / `changed` — from the content hash, and the CLI runs the same local
comparison against the fetched accepted bytes (`packages/host/src/store.mjs:340`;
`packages/cli/src/commands/snapshot.mjs:81-86`). `new` is not a failure; the verdict is `LOOK`, because
a new shot is a screen nobody has looked at (`snapshot.mjs:67-69`, `:235-244`).

### `--accept` is a deliberate separate act

> ACCEPT IS ITS OWN ACT. Not a flag on a checking run: "the UI should look like this now" is a
> decision, and running it as a side effect of a check is exactly what `--update` got wrong.
> — `packages/cli/src/commands/snapshot.mjs:149-150`

It moves the accepted pointer to the shot's last-seen hash and exits before rendering anything
(`packages/cli/src/commands/snapshot.mjs:151-171`; `packages/host/src/store.mjs:345-355`). With no
name it accepts everything the repo has pending (`packages/cli/src/lib/baselines.mjs:70-75`). Storing
and accepting are separate acts on the host side too — `--update` overwriting everything is why "the
baseline is stale" and "you broke something" are the same red (`packages/host/src/server.mjs:664-667`,
`packages/host/src/store.mjs:309-312`).

> **Never use `--update` on a project whose baselines are on the host — it starts a second, drifting
> copy.** — `.github/host-rules.md:104-107`

Nothing enforces that across runs. The CLI can only catch both flags in the same invocation
(`packages/cli/src/commands/snapshot.mjs:177-180`); a lone `--update` on a host-baselined project
succeeds silently.

### `motu archipelago snapshot` pictures the composed page

It screenshots the **region view**, full page, not the islands
(`packages/cli/src/playwright-lagoon.mjs:1055`; islands are element screenshots at `:898-902`).

> WHAT THIS CATCHES THAT AN ISLAND SHOT CANNOT: arrangement. The frame is not declared and therefore
> not checked, and this project has already shipped the consequence — two agents each extended the
> frame's slot lookup, the naive merge made one agent's widget render as the other's, and
> `archipelago verify --runtime` was BYTE-IDENTICAL between the correct and broken resolutions. Every
> island rendered correctly in isolation. Only the composition was wrong.
> — `packages/cli/src/playwright-lagoon.mjs:1005-1012`

Deliberately the region view, not mountpoints: the question is what a person sees
(`playwright-lagoon.mjs:1013-1016`). States come from the region's **flows' seeds**, deduped — a region
has no `scenarios` of its own, and one picture of one state would miss the case where the screen
changes SHAPE (`:1017-1021`; `packages/cli/src/commands/snapshot.mjs:264-295`).

Attribution is what makes a page-level diff usable rather than noise. Any island edit changes the
region picture, but the islands are separately baselined, so a region diff can be explained
(`packages/cli/src/commands/snapshot.mjs:345-353`). Three outcomes (`:429-444`):

- members that also changed → the region changed **because** they did;
- some members have no accepted baseline → `cannot attribute`, because an island nobody has ever
  compared can never report `changed` and claiming ARRANGEMENT on that would be the check reporting a
  conclusion it did not examine (`:396-399`);
- no member changed → **this is the ARRANGEMENT, which nothing else checks** (`:442`).

Attribution requires `--remote` and is best-effort — its absence must not fail the run (`:391`,
`:400-402`).

Motion is frozen at capture (`animation:none;transition:none;caret-color:transparent`) rather than
sampled and hoped for (`packages/cli/src/playwright-lagoon.mjs:882-884`, `:1035-1037`).

---

## The lens

**Ctrl/Cmd-K, then the `Seams` tab.** The lens is a tab of the DOCK, and the dock is drawn by whoever
HOSTS the lagoon (`@motu/chrome/dock`, mounted by `motu lagoon serve` / `lagoon dev`, and by the motu
host in the shell it wraps every lagoon in). So it is on the gallery and on any hosted lagoon URL, and
it is NOT on the focused standalone entry `motu island verify` drives, nor on `/__motu_frame`, which is
the artifact by itself. Its own keycap says which chord: `⌘K` / `Ctrl K`
(`packages/chrome/src/dock.mjs:1090`).

**Ctrl/Cmd-Shift-G is the other one** — `mountDebugOverlay`, the standalone debug overlay, matched
against `KeyboardEvent.code`, default `KeyG`, overridable with `shortcutCode`
(`packages/debug-overlay/src/overlay.ts:74-75`, `:168`, `:197`). The gallery does not mount it, so the
chord does nothing there; reaching for it on a page that has the dock is the usual way to conclude the
lens is broken. Both surfaces read the same data (`currentSheet`, `currentSeams`) and both are
read-only: it observes the mount registry, the shared stores, the island definitions and the
transport call log, and never writes a store, fires a channel or forces a render
(`packages/debug-overlay/src/overlay.ts:13-14`).

**The lens is two halves, and only one of them is still a panel.** As of `b386e84` the floating panel
is retired: what it drew now lives in the lagoon's own sidebar, drawn by whoever hosts the lagoon
rather than bundled into the artifact (`packages/debug-overlay/src/overlay.ts:351-362`). What could
NOT move is the PAGE layer — outlines, wires, hit-testing, the crosshair — because it measures the
host's live DOM sixty times a second and only means anything over the running region.

So the lens now EXPOSES data and the sidebar renders it. The tabs are `sheet`, `seams`, `islands`,
`coupling`, `coverage`, `findings`, plus fixture recording
(`packages/react/src/lagoon-gallery.ts:821-835`).

The **region sheet — one row per key**: who owns it, who reads it, what it holds, whether it has moved
(`currentSheet()`, `packages/debug-overlay/src/findings-view.ts:298-340`). Columns are the key, its
owner (a slot, or `host`), its readers, a value preview, and either `<slot> · <n>× · <ago>` or `seed`
— "the honest word for a key nothing has been seen to move: it holds what the page established, and no
declared write has fired" (`findings-view.ts:325-327`) — plus a flag where a declared write has never
fired or the host answered an island.

Read it before reading the archipelago; it is the same declaration, proved by the region that is
running (`.github/host-rules.md:120-123`). `MOTU_DEBUG=0` strips the lens entirely
(`packages/cli/src/lib/scaffold.mjs:458-459`).

---

## An island that cannot be bundled does not take the lagoon with it

The lagoon builds every archipelago as ONE chunk. So an island whose import graph cannot be bundled
for a browser — a Next server action reaching `node:async_hooks` five hops down, say — used to kill
the whole build: rollup died thousands of modules deep, and NO state in the project was openable. A
cold-start adoption ended with a fully green `motu check --runtime` and not one URL to hand over,
which is the worst state for a tool whose promise is that every declared state has an address.

Such islands are now left OUT of the build and their slots render a placeholder naming the reason:

    ! 1 island(s) left out of this build — they cannot be bundled, and the rest of the lagoon still works:
        · sso-options — reaches modules/ee/sso/actions.ts, which is a 'use server' module …

The island's own verdict is unchanged: `motu island verify <name>` still fails, and its preview is
still broken. What changes is the blast radius — every other island stays previewable. Exclusion is
decided by the same `rsc-boundary` analysis the island's own check reports, so the two cannot disagree.

`MOTU_NO_EXCLUDE=1` restores the old all-or-nothing behaviour, for when you want the raw bundler
failure.

## `latest` follows the DEV SERVER when one is running

`<host>/<repo>/latest/<slug>` is not "the last publish" — it is *the current answer*. When a dev
server has announced itself, the host proxies that URL to it and a viewer sees what you are editing;
when none has, it falls back to the last published bytes. Immutable commit URLs are never live, on
purpose: a URL keyed by content must keep meaning what it meant.

`motu lagoon dev` announces automatically:

    live at: http://<host>/<repo>/latest/<slug>
    the host will fetch it from: http://127.0.0.1:5173

`--no-live` opts out, for a dev server on a shared machine that should not become the address a team
is looking at. `motu lagoon serve --watch` also announces, and additionally offers `--live-url` (tell
the host a name it can reach, gated by `MOTU_LIVE_ALLOW` on the host) and `--live-push` (send bytes
instead of being fetched, for when the host cannot reach you at all).

A live member expires after 90 seconds and the CLI heartbeats every 30, so a dev server that dies
decays back to the last publish on its own rather than leaving a dead address. Stopping the server
deregisters immediately.

**Live is HOT.** The member's path is a PREFIX: `motu lagoon dev` sets Vite's `base` to it, so every
URL the dev server emits already carries it, and the host forwards everything under that prefix —
the page, the module graph, and the HMR WebSocket upgrade at `…/__motu_hmr`. A viewer sees your edits
without refreshing.

Three things about this are easy to get backwards, and each cost a debugging round:

- **The prefix belongs to the dev server, not the proxy.** With `base` set, it serves
  `/<repo>/latest/<slug>/@vite/client` and knows nothing about `/@vite/client`, so the host forwards
  the path WHOLE. Stripping it is the reverse-proxy reflex and it is wrong here.
- **Vite concatenates `base` with `server.hmr.path`**, so the path must be relative (`__motu_hmr`).
  Giving the full path doubles the prefix; the page and every asset still work and only the socket
  fails, which is visible nowhere except inside the served `@vite/client` module.
- **The live registry is in memory.** A host restart forgets every live member until the next
  heartbeat (30s), so a 404 straight after restarting the host means "not re-registered yet".

### Outliving the shell that started it

    motu lagoon dev --detach     # runs on, logs to .motu/cache/lagoon-dev.log
    motu lagoon dev --stop       # signals it and deregisters the member at once

An agent's dev server dies with its session, which is exactly when someone wants to keep watching.
`--detach` reparents it; `--stop` signals it AND tells the host directly, because a signal handler
racing an async POST against process exit is not reliable — measured, the process died and the host
listed the member for another 54 seconds. A second `--detach` refuses while one is running, and a
crash needs no cleanup: the member expires on its own after 90 seconds.

## Known traps

**Absolute asset paths.** `/images/…` works under `lagoon dev`, because Vite serves it, and 404s the
moment the page is hosted (`.github/host-rules.md:133-134`). Hosting is the
first place that difference is visible, so the host says it: an upload is **refused (422)** when the
fragment still references `/assets/` — that build's inlining did not happen — and anything else
absolute is a **warning**, printed by the CLI and returned in the JSON
(`packages/host/src/server.mjs:627-645`; `packages/cli/src/commands/lagoon.mjs:284`). The warning is a
finding.

**Invented data in a frame is a third copy nobody diffs.** Evidence lives in evidence files, and the
lagoon is not one (`.github/host-rules.md:86-93`). See
[10 — Evidence and testing](10-evidence-and-testing.md).

**Behaviour written inside a frame runs only in the region view** — where the flow checks are not. Make
it a `channel`, or answer it at the wire (`.github/host-rules.md`). Both are installed for every view;
a frame is not.

**`mount` must match the host application.** `"mount": "react"` in `lagoon.config.json`, and the same
value on both entries, or the lagoon shows a mount path the project does not ship
(`packages/cli/src/lib/scaffold.mjs:401-403`). Replaying a flow needs the React mount path and says so
(`packages/react/src/lagoon-states.ts:303-307`).

**`--no-build` serves what `publish` last wrote**, not your working tree
(`packages/cli/src/commands/lagoon.mjs:426-432`).

**The lagoon cannot reproduce host CSS collisions or auth expiry.** A small integration test alongside
it stays necessary.

---

## See also

[01 — Concepts](01-concepts.md) ·
[02 — Getting started](02-getting-started.md) ·
[03 — CLI reference](03-cli-reference.md) ·
[04 — Configuration](04-configuration.md) ·
[05 — Archipelagos and regions](05-archipelagos-and-regions.md) ·
[06 — Composition and adoption](06-composition-and-adoption.md) ·
[07 — Checks and verification](07-checks-and-verification.md) ·
[09 — Coverage](09-coverage.md) ·
[10 — Evidence and testing](10-evidence-and-testing.md) ·
[11 — Contract and backend](11-contract-and-backend.md) ·
[12 — Hosts and adapters](12-hosts-and-adapters.md) ·
[13 — Agents and skills](13-agents-and-skills.md).
