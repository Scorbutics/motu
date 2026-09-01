# Migrating an ocean

How to take a legacy application — an **ocean** — and replace it a piece at a time, with the old and
the new rendering on the same page while you do it.

This is motu's founding case, and it is a different problem from
[composition and adoption](06-composition-and-adoption.md). That page is about a React app that
already exists and asks *who owns the arrangement*. This page is about an application motu will
eventually **replace**, and asks *how do the two coexist while it happens*.

Read [01 — Concepts](01-concepts.md) first: ocean, island, lagoon, mainland.

## The shape of the migration

```
  ocean                 →   ocean with islands       →   mainland
  the legacy app            both render, per slot,       the components, standalone,
  renders everything        toggled per user             the ocean gone
```

Three properties make this survivable, and all three are mechanisms rather than intentions:

| | |
|---|---|
| **Nothing switches by default** | `legacy-toggle="true"` wraps the ORIGINAL fragment. Production keeps rendering legacy until somebody flips it, per slot, in their own browser. |
| **The old path keeps feeding the new one** | An inbound `channel` mirrors the legacy app's own traffic into the region's store, so using the OLD control still updates the NEW view. |
| **The islands are the destination** | What survives to the mainland is `src/ui/` — plain components that depend only on the contract. Nothing has to be rewritten a second time. |

## 1 — The bridge: one `<script>`, and nothing else changes

An ocean loads a single artifact. `roots/bridge` builds `bridge.js` as a self-contained IIFE with
React bundled in — it assumes no globals beyond the browser and an optional AngularJS
(`demo-app/roots/bridge/vite.config.ts:22-24`).

The bridge is the ocean's composition root. Everything mode-specific lives there; the components and
the archipelagos stay mode-agnostic, which is what lets the same islands mount in the lagoon
(`demo-app/roots/bridge/src/main.ts:1-3`).

```ts
configure(
  new HttpTransport('/api/rest/motu', {
    xsrfCookieName: 'M-XSRF-TOKEN',
    xsrfHeaderName: 'X-M-XSRF-TOKEN',
  }),
);
```
— `demo-app/roots/bridge/src/main.ts:22-27`. The dispatcher is mounted *inside* the legacy JAX-RS
app, so island calls travel the host's existing session and its module-specific XSRF pair. See
[11 — Contract and backend](11-contract-and-backend.md) for the seam, and the `java/` modules that
serve both the dispatcher and `bridge.js` itself from the classpath.

## 2 — Placement: `<motu-island>` in the legacy template

The placement marker relies only on the custom-element lifecycle — no directive, no digest — so the
same markup works in an AngularJS template, a JSP, or a plain DOM page
(`packages/core/src/island-element.ts:1-3`).

```html
<motu-island slot="member-results"></motu-island>
```

For a whole page, the archipelago's `layout` is an HTML template of these markers — the ocean's form
of arrangement, and the third shape alongside `X.Root` and `X.Island`:

```ts
export const MEMBERS_LAYOUT = `
<div class="gm-arch">
  <motu-island slot="member-header" theme="motu" fit="native"></motu-island>
  <div class="gm-arch__toolbar">
    <motu-island slot="member-search-ng" theme="motu" fit="native"></motu-island>
    <motu-island slot="member-chips" theme="motu" fit="native" class="gm-arch__grow"></motu-island>
  </div>
  <motu-island slot="member-results" theme="motu" fit="native"></motu-island>
</div>`;
```
— `demo-app/src/archipelagos/members/members.layout.ts`. A React host has no `layout`: its
arrangement is the page's JSX or the archipelago's `root`.

## 3 — Coexistence: `legacy-toggle`, and why nothing switches by default

**This is the mechanism the whole migration rests on.** Wrap the original fragment rather than
deleting it:

```html
<motu-island slot="member-results" legacy-toggle="true">
  …the legacy html, untouched…
</motu-island>
```

Nothing shows by default. On hover (desktop) or tap (mobile) a card shadow highlights the element and
an on/off switch appears; toggling swaps the wrapped legacy fragment for the island. It **defaults
OFF, so production shows legacy**, and the choice persists in `localStorage` per slot
(`packages/core/src/island-element.ts:5-10`, `:137-139`).

So a slot can ship to production before anyone has decided it is ready, and the decision is made by
each person looking at it rather than by a deploy.

The demo's users page is mid-migration and says so:

> only the Search box is extracted so far. It's default-OFF via legacy-toggle, so prod still shows the
> legacy search until someone flips it. NOTE: the Users *results* list is still legacy AngularJS —
> driving it from this island needs an outbound channel (or extracting the results island too);
> today the toggled-on search island writes the motu store only.

— `demo-app/roots/bridge/src/main.ts:67-71`. Read that as the honest state of a half-migrated page:
the new search writes the store, and nothing legacy reads it back yet.

## 4 — Keeping both halves alive: inbound channels

While the old control still exists, using it must not leave the new view stale. A **channel** mirrors
the ocean's own traffic into the region's store:

```ts
channels: [
  angularHttpChannel({
    match: /\/rest\/member\/(?:search|summarize)\/\d+/,
    onRequest: (req, store) => store.set('criteria', (req.body as Record<string, unknown>) ?? {}),
  }),
],
```
— `demo-app/roots/bridge/src/main.ts:77-88`. The comment on it is the part to copy:

> Coexistence sync (inbound, optional): the LEGACY search's criteria flow into the store so using the
> OLD search also refreshes the motu list (which then self-fetches via the contract). Generic — it
> only taps `$http` by URL. **Drop it once the legacy search is gone.**

A coexistence channel is scaffolding with a stated demolition date. Three are shipped
(`packages/adapters/angularjs/src/channels.ts`):

| channel | taps |
|---|---|
| `angularHttpChannel` | the host's `$http` traffic, matched by URL |
| `angularScopeChannel` | a scope expression |
| `angularHostScopeChannel` | the host scope the island is mounted in |

Seeding from the legacy app's own persisted state is the same idea at first paint —
`readStickySearch()` reads the ocean's `localStorage` so the island renders the right data before the
user runs a fresh search (`main.ts:43-50`, used at `:76`).

The other direction — host data pushed *in* — is the `motu-provide` directive, registered on the
legacy module before it bootstraps so a JSP can feed a boundary element with the host's own scope
(`main.ts:52-58`, `packages/adapters/angularjs/src/provide.ts`):

```html
<motu-island slot="member-search-ng" motu-provide="searchConfig: hostSearchConfig">
```

## 5 — Looking like the ocean: `fit` and `absorbHostTheme`

An island dropped into a legacy page that does not match it reads as broken, however correct it is.

`fit` is `'legacy' | 'native'` (`packages/core/src/theme.ts:14`). Embedded mode sets
`defaultTheme: 'legacy'` deliberately — *"islands match the host — no gradients or preview fonts"*
(`main.ts:63-64`). `legacyFit` in `motu.config.json` gates a second runtime mount that checks the
legacy strategy, and it is only meaningful when there IS a legacy skin: `next` and `none` turn it off.
See [04 — Configuration](04-configuration.md) and [12 — Hosts and adapters](12-hosts-and-adapters.md).

`absorbHostTheme` reads the host's real computed values out of its own markup and publishes them as
`--x-*` tokens:

```ts
absorbHostTheme({
  primary: { selector: '#sectionInner .section-content > h1' },
  border:  { selector: '#sectionInner .section-content input', property: 'border-top-color',        into: '--x-border' },
  radius:  { selector: '#sectionInner .section-content input', property: 'border-top-left-radius', into: '--x-radius' },
});
```
— `main.ts:35-39`, implemented at `packages/core/src/host-theme.ts:36`. Any token whose source is not
on the page keeps its stylesheet fallback.

Note where that knowledge lives: the SELECTORS are project knowledge and stay in the composition
root, not in the framework.

## 6 — Previewing real placement: `record-frame`

The lagoon has no ocean, so an island previewed there sits in a container the legacy page never gave
it. `motu archipelago record-frame <id> --url <embedded>` opens a headed, persistent browser — you log
in and navigate once — measures each `<motu-island slot>`'s container box and inherited typography,
and writes a frame stylesheet keyed by `[data-motu-arch][data-motu-slot]`
(`packages/cli/src/commands/record-frame.mjs:1-6`).

It is the record/replay analogue of `motu fixtures record`, but for **placement** instead of backend
responses, and it replaced hand-authored frame CSS. The login session persists across runs, so the
human authenticates once.

## 7 — The end: the ocean recedes

The **mainland** is what is left when the wrappers come off: the plain components under `src/ui/`,
depending only on the contract and each other (`README.md`). Nothing produces it — it is a
destination, not a build target.

You are done with a slot when:

- the `legacy-toggle` wrapper has no legacy fragment left inside it, and the attribute goes
- the coexistence channel that fed it has no old control left to listen to, and gets deleted
- `absorbHostTheme` no longer has a host to absorb from, and the island keeps its stylesheet values

Each of those is a deletion, which is the point: the migration ends by removing scaffolding, not by
rewriting the islands.

## What the ocean does NOT share with a React host

| | ocean | React host |
|---|---|---|
| arrangement | `layout` — an HTML template of `<motu-island slot>` | the page's JSX, or the archipelago's `root` |
| composition API | custom elements | `<X.Island>` / `<X.Root>` |
| a component | often has to be WRITTEN, under `src/ui/` | usually already exists — `island create --from` wraps it |
| `legacyFit` | required | off |
| coexistence | `legacy-toggle` + inbound channels | not applicable — there is no second implementation |

The `ui/<kebab>/` layer exists **for this case**. On a React host, copying an existing component there
would fork it (`README.md`) — which is why `--from` exists and why
[06 — Composition and adoption](06-composition-and-adoption.md) never mentions `ui/`.

## See also

- [01 — Concepts](01-concepts.md) — ocean, island, lagoon, mainland
- [06 — Composition and adoption](06-composition-and-adoption.md) — the React host's staged path
- [11 — Contract and backend](11-contract-and-backend.md) — the transport seam and the `java/` modules
- [12 — Hosts and adapters](12-hosts-and-adapters.md) — `host`, `legacyFit`, `@motu/adapter-angularjs`
- `demo-app/roots/bridge/src/main.ts` — the worked example, end to end
