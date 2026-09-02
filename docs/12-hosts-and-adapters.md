# Hosts and adapters

A *host* is the stack an island is embedded into. motu names it once, in `motu.config.json`'s `host`
key, and that single value selects the adapter, the lagoon's build contribution, the scaffolding, the
default isolation and whether the legacy-fit gate applies at all — so a project states its stack once
rather than restating it in every check. The promise on the other side of that is stronger and is the
subject of the second half of this page: whatever the host, motu must stay **removable**, and
`motu removal-check` performs the removal for real and runs the host's own typecheck on the result.

---

## The `host` key

Declared in `motu.config.json`, defaulting to `'angularjs'`
(`packages/cli/src/lib/config.mjs:105`), read once into `HOST` (`packages/cli/src/lib/util.mjs:23`).
`motu init --host <value>` accepts four (`packages/cli/src/commands/init.mjs:121`); three of them are
the ones the framework's own comments describe (`packages/cli/src/lib/config.mjs:101-105`).

| `host` | what it means | what it selects |
| --- | --- | --- |
| `angularjs` | the reference *ocean* — a foreign framework an island has to cross into | `@motu/adapter-angularjs` as a dependency (`init.mjs:232`) and as a lagoon alias (`init.mjs:64`); legacy fit ON (`config.mjs:136`); default isolation `shadow` (`init.mjs:169`); a `roots/bridge` root (`init.mjs:185`) |
| `next` | a Next.js app — already React | `@motu/adapter-next` (`init.mjs:232`, `init.mjs:65`); the lagoon inherits the host's `@/…` alias, `globals.css` and Tailwind (`init.mjs:281`, `init.mjs:269`, `packages/adapters/next/vite.mjs:47`); `"mount": "react"` in the scaffolded lagoon config (`init.mjs:279`); legacy fit OFF |
| `none` | plain React — nothing host-specific | no adapter dependency (`init.mjs:232`); no Vite contribution (`packages/cli/src/lib/lagoon-vite.mjs:219`); legacy fit OFF |
| `vite` | a Vite application, whose build *is* its `vite.config.ts` | no runtime adapter package — it contributes at BUILD time only (`init.mjs:231`), through `packages/adapters/vite/vite.mjs` |

`host` is the discriminator for a question the skills ask constantly: does a React component for this
region **already exist**? On `next` / `vite` / `none` it does, so an island wraps the app's own
component; on `angularjs` there is nothing to wrap and one has to be authored under `ui/`. See
[13 — Agents and skills](13-agents-and-skills.md).

### The Vite adapter states nothing

Every other adapter restates its framework. A Vite application is not conventional enough for that, so
`packages/adapters/vite/vite.mjs:1-18` loads the **host's own config** with Vite's own loader
(`vite.mjs:39`) and borrows two things from it: the plugins that transform the host's source and the
aliases that resolve it. Build reporters are dropped (`vite.mjs:23`) and motu's React plugin is skipped
when the host already has one (`vite.mjs:46`) — two React transforms in one pipeline is a duplicated
JSX runtime, which surfaces as hooks failing in ways nothing explains.

The framework's own aliases are **not** the host adapter's to supply. They used to be, which meant the
no-install promise held for exactly the two hosts that ship an adapter, and `host: "none"` booted the
lagoon with an empty alias list and died on "`@motu/react` could not be resolved"
(`packages/cli/src/lib/lagoon-vite.mjs:290-303`). They are now unconditional
(`lagoon-vite.mjs:302`).

---

## `legacyFit` — only meaningful when there IS a legacy skin

`legacyFit` defaults from the host: true for `angularjs`, false for everything else
(`packages/cli/src/lib/config.mjs:136`, `config.mjs:297`), and is overridable per project. It gates
three separate things:

- **The `legacy` strategy declaration.** With `legacyFit` on, an island that omits `legacy` is an
  **error**; with it off, the check reports `skip` — and declaring `legacy` anyway is a *warning*,
  because nothing reads it (`packages/cli/src/commands/verify.mjs:393-406`). The scaffolder writes the
  field only where it applies (`packages/cli/src/commands/create.mjs:50`).
- **The runtime mount matrix.** The island is mounted in both `native` and `legacy` fit where there is
  a skin, and in `native` alone where there is not — otherwise it verifies the same thing twice and
  doubles the wall clock (`verify.mjs:1130`).
- **`region-type`.** On an ocean, region state is motu's and there is no app-side type to reference, so
  the check is skipped; on a React host the archipelago must name the app's own region type
  (`verify.mjs:2273-2299`).

The order of that first test matters and was a real bug: testing for the *field* before the *posture*
made the skip branch unreachable for any project that declared it, and eight islands on a `next` host
each reported "declares a required legacy-fit strategy" — asserting a requirement that does not exist
there (`verify.mjs:389-392`). Read the posture first.

`motu init` says so out loud on a host with no skin: *"legacy fit is off for this host — islands mount
directly, there is no legacy skin to fit"* (`packages/cli/src/commands/init.mjs:348-349`). The
declaration itself is documented on the option type at
`packages/react/src/defineReactElement.ts:59-68`.

---

## `@motu/adapter-next`

Deliberately small, and the smallness is the claim: a Next host is already React, so an island mounts
directly and there is no framework boundary to cross
(`packages/adapters/next/src/index.ts:1-10`). The whole export surface is
`packages/adapters/next/src/index.ts:11-24`:

| Export | What it is |
| --- | --- |
| `nextHostBridge` / `collectingHostBridge` | the outward intent seam (`src/host-bridge.ts:43`, `:64`) |
| `Archipelago` | the React component that mounts a region in a page (`src/archipelago.tsx`) |
| `defineServices` / `createContract` | the contract seam (`src/services.ts`, `src/contract.ts`) |
| `createRegion`, `Island`, `useMotuStore` | re-exported from `@motu/react` so a page has one import site (`index.ts:15`, `:19`) |
| `@motu/adapter-next/server` | the server dispatcher, behind its own entry so a client bundle can never pull it in (`index.ts:10`, `package.json:12`) |
| `@motu/adapter-next/verify` | the adapter-owned verify layer (`package.json:16`) |

### What it is NOT

- **There is no `defineNextElement`** and no bridge root
  (`packages/adapters/next/src/host-bridge.ts:8-10`). The AngularJS adapter needs a custom-element
  definer and channels because AngularJS is foreign (`packages/adapters/angularjs/src/index.ts:1-9`);
  none of that applies here.
- **It is not an authorization layer.** The registry's entries are the app's own functions, and
  whatever they already use decides what a caller may see. See
  [11 — Contract and backend](11-contract-and-backend.md).
- **It is not a second React root.** Islands render in the page's own tree by default; see `mount`
  below.

### `nextHostBridge`

Islands are forbidden from touching `history` / `location` — that rule is what lets the same component
mount in a lagoon with no router at all — so something at the composition root has to turn an intent
into a navigation, and on a Next host that something is the App Router
(`packages/adapters/next/src/host-bridge.ts:1-6`).

```tsx
'use client';
const router = useRouter();
const host = useMemo(() => nextHostBridge(router), [router]);
return <Archipelago config={getArchipelago('directory')!} elements={ELEMENT_REGISTRY} host={host} />;
```

`navigate` becomes `router.push`, or `router.replace` under `{ replace: true }`
(`host-bridge.ts:46-49`). `action` dispatches a `motu:action` `CustomEvent` on `document` so host code
can listen without the island knowing who is listening — the same shape the AngularJS adapter uses, so
an island's outward contract does not change when the ocean recedes (`host-bridge.ts:39-41`,
`:50-55`). The router slice it needs is declared structurally (`NextRouterLike`,
`host-bridge.ts:15-19`), so the adapter never imports `next/navigation`.

Where there is no router — server rendering, a test, a page not yet wired — `collectingHostBridge()`
collects intents instead of performing them, so nothing silently no-ops (`host-bridge.ts:59-70`).

### `@motu/adapter-next/verify`

The RSC boundary is Next's analogue of AngularJS's host-scope coupling: both police the one way an
island can silently bind itself to its host (`packages/adapters/next/verify.mjs:1-15`). The core
`motu island verify` runs the framework-neutral checks and hands this adapter the component's source
text plus the structured `mount` + `{ scope }` effects it extracted by AST — the CLI owns parsing, the adapter owns
semantics (`verify.mjs:12-15`).

- **Errors** on server-only imports — `server-only`, `next/headers`, `next/server`, `next/cache`,
  `next/og` (`verify.mjs:17-24`) — and on `'use server'` actions. Such a component is one only Next
  can render, and the lagoon is a plain Vite SPA with no Next runtime at all.
- **Errors** on hooks without `'use client'`.
- **Warns** on `next/link` / `next/image` / `next/navigation`, which the lagoon stubs as inert
  (`verify.mjs:26-27`, stubs at `packages/adapters/next/lagoon/next-stubs.tsx`).

Type-only imports are stripped before judging, because importing the server's service-map *type* is
exactly how a typed contract is declared and judging it as a runtime import would make the correct
pattern unusable (`verify.mjs:41-45`).

---

## Mounting islands

### `mount` — which tree the island renders in

`<Archipelago mount>` (`packages/adapters/next/src/archipelago.tsx:54-55`, documented at
`archipelago.tsx:10-16`):

| `mount` | |
| --- | --- |
| `"react"` (default) | each island renders inside the page's own React tree. Page context, error boundaries and Suspense reach it; one React root for the whole page. |
| `"element"` | each island mounts as a `<motu-island>` custom element with its own React root — for a React host that does not own the DOM the island lands in (markup from a CMS, a slot filled imperatively). |

A root per island is right for an ocean, which has no React tree. Carried into a React host it costs
more than the roots: each root is its own **context** boundary, so a component calling a host hook
throws inside an island while working two lines above it on the same page. **The lagoon must use the
same `mount` as the host** (`"mount": "react"` in `lagoon.config.json`, scaffolded for `--host next`
at `packages/cli/src/commands/init.mjs:279`) or `motu island verify` green-lights a mount path the
project never ships.

**Region FLOWS work on both mounts, and for a long time they only worked on one.** Nothing about a
flow is React's — `emit` needs the archipelago's config, its store and the mounted-island registry,
and the custom element fills all three exactly as the React tree does — but the seam that exposes it
(`window.__motuLagoon`) was written inside `mountReactLagoon`, so every flow step on an `element` host
failed with *"no emit seam on this mount path"*. It is now `packages/react/src/lagoon-harness.ts`,
shared by both; only `remount` stays per-mount, because React needs its root unmounted while the
element path re-inserts the `<motu-island>` marker.

The same gap had a second half. The checks that drive a region open `?view=mountpoints` — one framed
cell per declared slot, so a slot the page's own arrangement would hide still mounts — and the element
has always understood `view="mountpoints"`, but nothing set it: `defineLagoon` dropped the option and
`bootstrapLagoon` never read the param. The region rendered its own layout, no `[data-motu-slot]` cell
existed, and every step failed with *"the region rendered nothing after this step"* — a true sentence
about a page nobody had asked for the right view. `bootstrapLagoon` now defaults `view` from the URL
when the entry did not say (at boot, not per render, so the harness can still re-aim the page), which
fixes hand-written entries predating the scaffold rather than one project's.

Worth knowing which failure you are looking at: the first says the seam is missing, the second says the
region is empty, and on an element host they were the same bug wearing two messages.

Without children, `<Archipelago>` renders every declared slot in config order; with children you place
`<Island slot="…">` yourself, anywhere in the page's own markup
(`archipelago.tsx:57-62`). Element registration is global and one-shot per tag, so it is guarded by
archipelago id — React StrictMode double-invokes effects and Next remounts across navigations
(`archipelago.tsx:65-71`).

### `tagPrefix` — the tag namespace

`tagPrefix` defaults to `'x-'` (`packages/cli/src/lib/config.mjs:77-85`, resolved at `config.mjs:206`).
Every island's custom-element tag is `${tagPrefix}${kebab}` — `week-actions` → `x-week-actions`
(`packages/cli/src/lib/util.mjs:335`). It is a project-wide namespace so an app's islands cannot
collide with another library's custom elements. The placement markers themselves — `<motu-island>`
(`packages/core/src/island-element.ts:1-7`) and `<motu-archipelago>`
(`packages/core/src/archipelago-element.ts:67`) — are framework-owned and unprefixed.

### `isolation: shadow | light`

Project-wide default in `motu.config.json`, normalised at `packages/cli/src/lib/config.mjs:207`
(`'light'` if literally `'light'`, otherwise `'shadow'`), set at a composition root through
`setDefaultIsolation` (`packages/core/src/island.ts:32-37`). `motu init` picks `shadow` for
`angularjs` and `light` for every React host, because islands mount directly there and a shadow root
would cut them off from the host's own stylesheet (`packages/cli/src/commands/init.mjs:167-169`).
An element may pin its own (`packages/react/src/defineReactElement.ts:77-81`), and a region may pin
one by attribute (`packages/core/src/archipelago-element.ts:100-103`).

**The consequence is entirely about styling, and it runs in both directions.**

- `shadow` — the island renders into a div inside a shadow root and its `css` is *adopted* as a
  `CSSStyleSheet` (`packages/core/src/island.ts:301`, `:387`). The host's stylesheet does not reach
  in. Right for an ocean whose legacy sheet would otherwise bleed into the islands; **wrong for a
  React host, where the app's stylesheet is the point** — a shadow root there leaves the app's own
  components unstyled inside their own page, which is why `<Archipelago>` defaults to `light`
  regardless of the framework default (`packages/adapters/next/src/archipelago.tsx:46-53`).
- `light` — the island renders into the element itself and inherits the host's styles, forms and
  events. There is no shadow to adopt into, so its `css` is injected once globally, deduped by exact
  content (`island.ts:252-264`), and motu installs a three-part scoped reset to reproduce what the
  shadow boundary gave for free: a predictable box model, a minimal preflight, and a neutralizer for
  *inbound* legacy tag selectors — a legacy `table td { padding }` still reaches your `<td>` in the
  same document (`island.ts:228-243`). The reset is scoped `:where(.motu-root)` for zero
  specificity, so the island's own classes always win; **a higher-specificity legacy id or class rule
  can still reach in, and that is the accepted light-DOM trade** (`island.ts:234-237`).

Because a light island has no `:host`, island CSS must be authored in the dual-mode
`:where(:host, .motu-root)` form — a bare `:host` is inert in light DOM — and `motu archipelago
verify`'s CSS lint enforces exactly that.

**Inside a region, the region owns the boundary.** A nested island defers to its archipelago: it
renders light and shares the region's one stylesheet rather than opening a shadow root of its own
(`packages/core/src/island.ts:264-270`, `:384-403`). At region level, `isolation="shadow"` is one
shadow root plus one adopted sheet for every member; `isolation="light"` is no shadow at all, with
region and island styles injected globally (`packages/core/src/archipelago-element.ts:63-66`,
`:208`).

`isolation` is **not** the wrap-or-rewrite discriminator, however it reads. It is a styling decision,
and all three reference projects are `light` — including the AngularJS one
(`.claude/skills/island-locate/SKILL.md:32-35`).

---

## No install of the framework itself

`@motu/*` ship compiled (`node scripts/build-packages.mjs`, which `./install.sh` runs), so an app can
depend on them normally — and an installed package sits inside the host's own `node_modules`, so
`import 'react'` from inside `@motu/react` resolves to the **host's** React and the peer dependency
means what it says. Consumed as raw TypeScript through a symlink it could not: Node resolution walks up
from a module's *real* path, leaving the host's tree entirely (`scripts/build-packages.mjs:6`).

The **lagoon** is a different consumer and still reads the checkout's sources directly — it is a Vite
app that transpiles TS anyway — and it works out where that checkout is by itself, from the binary you
just ran (`packages/cli/src/lib/config.mjs:112-133`). `$MOTU_ROOT` overrides it
(`config.mjs:308`). There is no machine-specific path to commit; there used to be, and it was the
one line that broke on a second machine and in CI.

Three mechanisms carry the framework into a project with no install:

1. **Vite aliases** for the lagoon, anchored regexes rather than the object form — Vite's alias matcher
   is exact-or-prefix-with-a-slash, which never matches `pkg/styles.css?inline` and lets
   `@motu/runtime` swallow `@motu/runtime/mock` (`packages/cli/src/lib/lagoon-vite.mjs:200-214`,
   `packages/cli/src/commands/init.mjs:83-86`).
2. **`tsconfig` paths**, mirrored from the same entry map (`init.mjs:52-62`).
3. **Real symlinks in the project's own gitignored `node_modules/@motu/`**, for plain node — the
   runtime harness and the evidence loaders `import()` the project's files, which import
   `@motu/react`, and node knows nothing about either alias
   (`packages/cli/src/lib/util.mjs:418-453`). Seven packages are linked: `core`, `react`, `runtime`,
   `types`, `debug-overlay`, `chrome`, `coverage` (`util.mjs:438`). `chrome` belongs there even though
   a host never imports it by name, because `@motu/core`'s toolbar does — and a host that aliases
   `@motu/*` to source resolves from its own tree and would get an unresolved import from inside a
   package it never named (`util.mjs:433-437`).

Node's aliases are then serialised for the loader, with the **project's React first** so nothing else
can claim the specifier (`packages/cli/src/lib/node-aliases.mjs:54-73`). That dedupe is node's answer
to Vite's `dedupe: ['react', 'react-dom']`: the framework's packages resolving their own copy while the
project resolves its own is a component meeting a null dispatcher, and it is the failure that made
`--fast` unusable for any island with state (`node-aliases.mjs:23-30`). The lagoon config declares
`env` for the browser through `define`; `lagoonEnv()` hands the same declaration to node, because an
island whose graph touches a client that reads env at import time died on a missing variable rather
than on anything about the island (`node-aliases.mjs:8-14`).

### The failure the re-linking was built against

`ensureNoInstallLinks` runs **first, on every CLI invocation**
(`packages/cli/src/run.mjs:181-193`), not once at `init`. The reason is recorded there:

> `motu init` symlinks `node_modules/@motu/*` into the checkout, which is what lets a project depend on
> nothing. `npm install` then deletes them as extraneous — measured on an Angular app, where the next
> build failed with `Cannot find module '@motu/react'`, an error pointing nowhere near the cause.
> (bun and pnpm left them alone, so this is invisible on the machines motu grew up on.)

Re-linking is a handful of `existsSync` calls and makes the mechanism survive the host's package
manager instead of losing to it. A read-only checkout or a real install already in place is a no-op —
the symlink is only created when nothing is there (`packages/cli/src/lib/util.mjs:444-451`).

---

## `removal-check` — proving motu stays removable

`motu removal-check [--force]` (`packages/cli/src/run.mjs:86`, `:97-100`). It is also folded into
`motu check` (`packages/cli/src/commands/check.mjs:135`).

### What it proves

> motu may appear in app code, but it must never be load-bearing. Delete the framework and the app must
> still compile and render.
> — `packages/cli/src/commands/removal-check.mjs:3-4`

Two allowed shapes: a file that is **100% motu** (a composition root, a dev page) is deletable whole;
a **wrapper** whose deletion leaves valid JSX is stripped and unwrapped
(`removal-check.mjs:6-8`). The command performs exactly that surgery on the real files and runs the
**host's own typecheck** on the result — `npx tsc --noEmit -p tsconfig.json`, run the way the host
would run it (`removal-check.mjs:24-32`). Everything is backed up first and restored in a `finally`
block, so the check can never leave a repo half-stripped, including when the typecheck throws
(`removal-check.mjs:513-525`).

Two motu specifiers survive the surgery on purpose:

- **`@motu/types`** — a type-only package with not a single value export
  (`packages/types/src/index.ts:1-12`), so an app file importing it emits nothing. The guarantee is
  about the *runtime* and is unchanged; stripping it would prove something weaker while looking
  stricter (`removal-check.mjs:117-128`).
- **`@motu/chrome`** — motu's design kit. Its tags are not unwrapped, because unwrapping means "keep
  the children, drop the wrapper", which is right for `<X.Island>` and wrong for a `<Panel>` that *is*
  the content. The import is still removed, which is what makes the honest diagnostic appear. It also
  states something real: an app that builds its UI out of `@motu/chrome/react` is load-bearing on motu
  for its *appearance* (`removal-check.mjs:196-217`).

### How it finds what to touch

An **import graph over source text**, not a ts-morph parse of the whole application — an import graph
is a regex, and only the files that matter are parsed properly afterwards
(`removal-check.mjs:36-42`). The file set comes from `hostSourceFiles()`
(`packages/cli/src/lib/host-sources.mjs`), shared with `integrate check`: `hostSources` from
`motu.config.json` if set, else the host's own `tsconfig.json` — the same declaration this check
already trusts when it runs `tsc --noEmit -p tsconfig.json` — else the five-directory guess. If you set
the key, it must also be in the config whitelist (`packages/cli/src/lib/config.mjs:209-217`).

"Motu-only" is then computed **to a fixpoint** (`removal-check.mjs:227-274`), because two things are
true that the first version missed: an import can reach motu without a motu specifier (an app-alias
path *into* the motu project directory), and it is transitive — a dev page whose only import is the
composition root is stranded when that root is deleted. Framework/runtime imports (`react`,
`react-dom`, `next/*`) say nothing about ownership and are ignored (`removal-check.mjs:225`).

### Both composition shapes

This is the part that makes the check work on a real page, because a region composes in one of two ways
(see [06 — Composition and adoption](06-composition-and-adoption.md)) and the naive surgery destroys
one of them.

- **`<X.Root>` is REWRITTEN, not unwrapped** (`removal-check.mjs:149-188`, called at `:384`). A root
  is self-closing, so the generic unwrap would replace it with `null` and take the whole page with it —
  which is exactly what it did, and the removal proof failed on a page that was perfectly fine
  (`removal-check.mjs:377-383`). Instead the tag becomes the application's own layout component from
  the archipelago's `root`, the closing tag with it, and the import is added (`:176-180`). A
  `hostSlots` prop carries a component's *props*, so it grows back into an element:
  `header={{ member }}` → `header={<Header {...{ member }} />}` (`:163-174`). Which region a root
  composes is decided by **scoring** the prop set against each region's vocabulary, not by the first
  region with a prop in common — that broke the moment two regions both declared a `header`
  (`packages/cli/src/lib/eject.mjs:60-70`).
- **`<X.Island>` is UNWRAPPED**, children kept — that is the whole property
  (`removal-check.mjs:386-415`). Two hazards are handled explicitly. JSX comments and whitespace are
  filtered out of the children, because joining them produced `{/* … */}<Thing/>`, which is not one
  expression and threw out of ts-morph (`:394-398`). And *where the wrapper stood decides what
  replaces it*: `{expr}` is a JSX child in one position and an object literal in every other, so
  `return <MotuRegion>{screen}</MotuRegion>` unwrapped verbatim gives `return {screen}` — valid
  TypeScript, a completely different program (`:401-414`).

Before either, **eject** runs while `<Island slot="…">` is still in place to say which element produces
what (`removal-check.mjs:374`, `packages/cli/src/lib/eject.mjs:1-17`): region reads become plain
`useState`, seeds become `set…` calls, and the producer's output prop is wired to its setters. It is a
codemod, not a refactor — it may leave state the page also keeps under another name, and a human can
tidy after (`eject.mjs:18-20`).

### The cache, and `--force`

The answer depends only on the files the surgery touches plus the declarations it generates from — the
islands and the archipelagos — so those are hashed into a fingerprint
(`removal-check.mjs:93-112`, `:475-488`). A matching fingerprint on a previously-passing proof skips
the expensive part, which is nearly all of the cost: a full application `tsc`
(`removal-check.mjs:489-511`). `--force` re-proves it anyway (`removal-check.mjs:489`,
`packages/cli/src/run.mjs:98-100`). An unreadable proof file is no proof (`removal-check.mjs:508`),
and a cache that cannot be written just means the next run re-proves it (`:592`).

### `removable: false` is an opt-out, reported as a SKIP

A project may declare `"removable": false` (`packages/cli/src/lib/config.mjs:252-265`). motu's own
surfaces do: the review console composes regions with `createRegion` and paints from
`@motu/chrome/react`, and motu is load-bearing there by choice — "does it compile without motu" is not
a question about its integration. It is reported as a **SKIP, never a pass**, because opting out proves
nothing and the verdict must not read like proof (`removal-check.mjs:285-297`). It is not a hatch for
an adopting app that finds removal inconvenient; for those the answer stays FAIL. Default is `true`: a
host must say so deliberately (`config.mjs:265`).

### The other outcomes, and why each is worded the way it is

| Outcome | Meaning |
| --- | --- |
| **PASS** | the host typechecks with motu removed (`removal-check.mjs:598-608`) |
| **scanned 0 files** | *exit 1.* Nothing was examined, so nothing is proved — with the fix named (`hostSources`). A green result from an empty search is the worst failure mode this tool has, and it happened: it scanned Next's directories, found none of Twenty's `src/`, and called the emptiness a clean bill of health (`removal-check.mjs:430-454`) |
| **no motu references** | scanned files, found none — genuinely nothing to remove, with the file count printed (`:455-461`) |
| **could not rewrite these files** | an **unanswered question**, not a verdict. The surgery threw, that file was left alone, and every error naming it is a consequence. Printed first, because the errors below may all be its children (`:356`, `:424-426`, `:612-629`) |
| **compose a region but are NOT deletable** | a composition root is deleted whole only when *every* import it makes is motu's. One application import and it is stripped instead, leaving `createRegion(...)` with its imports gone and errors on lines that look fine. The report names the offending imports (`:311-336`, `:646-659`) |
| **a dangling import of a deleted module** | never the line it points at — it is the previous case, one file earlier (`:636-643`) |

Two classes of noise are separated rather than dropped. **Generated route types** pointing at a deleted
route are build artifacts, not application code — ignored, and counted in the report, because a check
that silently discards errors is how a green result stops meaning anything
(`removal-check.mjs:540-546`). **Pre-existing errors** are not evidence that motu is load-bearing: a
host that did not typecheck to begin with still answers the question. The baseline typecheck runs only
when something failed, on the restored tree, so a clean removal still pays for exactly one `tsc`
(`removal-check.mjs:548-565`).

`motu removal-check` exits 0 or 1 for CI (`removal-check.mjs:666-670`).

---

## Known limits

The [README](../README.md) lists the headline ones; here they are verified against source:

- **`contract-only-io` still cannot see a direct Supabase import.** The seam exists, but the static
  rule's blocked-client list is `axios / ky / superagent / node-fetch / got`
  (`packages/cli/src/commands/verify.mjs:191`) — `@supabase/supabase-js` is not on it, so an island
  importing the client directly passes a rule meant to prevent exactly that. The list should be
  configurable per project; it is not.
- **Turbopack does not work.** Use `next dev --webpack` / `next build --webpack`. Turbopack resolves an
  absolute `resolveAlias` value as project-relative and has no `extensionAlias` equivalent for the
  `.js` specifiers motu's sources use (`README.md`). The workaround is visible in the
  generated code: the scaffolded barrel deliberately writes extensionless specifiers
  (`packages/cli/src/lib/scaffold.mjs:48`, `packages/cli/src/lib/islands.mjs:64`).
- **A Next host needs bundler wiring beyond the aliases:** `experimental.externalDir: true` (the
  checkout is outside the project root), `resolve.extensionAlias { '.js': ['.ts', '.tsx', '.js'] }`,
  and exact-match alias keys, or `@motu/runtime` swallows `@motu/runtime/mock`.
- **A Next host is not necessarily a Tailwind host.** The adapter used to assume it was and served a
  500 naming a generated file the project never wrote; it now looks for a config first
  (`packages/adapters/next/vite.mjs:30-44`).
- **The lagoon cannot reproduce host CSS collisions or auth expiry.** An integration test alongside it
  is still necessary. See also [07 — Checks and verification](07-checks-and-verification.md) on what
  `integrate check` can and cannot see.

---

## See also

- [04 — Configuration](04-configuration.md) — `host`, `isolation`, `tagPrefix`, `hostRoot`,
  `hostSources`, `removable`, key by key.
- [06 — Composition and adoption](06-composition-and-adoption.md) — `<X.Root>` vs `<X.Island>` and the
  staged adoption path. This page does not repeat it.
- [08 — The lagoon](08-lagoon.md) — the host's Vite contribution as the lagoon consumes it.
- [11 — Contract and backend](11-contract-and-backend.md) — `defineServices`, `createContract`,
  `createMotuRoute`, transports.
