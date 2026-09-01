# Concepts and terminology

This page is the shared vocabulary. It answers what each motu word *means*, what it is *not*, and
where the word lives in source — metaphor terms (island, ocean, archipelago, lagoon, mainland) stay
in prose, while the mechanical terms (slot, key, element, bind, writes, seed, provide) are literal
identifiers you will type. Every other page in this set assumes these definitions, so where a term is
ambiguous the code is cited and the code wins.

---

## The map

One page, one region, its islands, its store, and the lagoon that previews it:

```
  HOST APPLICATION (the page — the app's own source)
  ┌───────────────────────────────────────────────────────────────────────────┐
  │  const Signin = createRegion(signinArchipelago, { elements, transport })   │
  │  <Signin.Region>                       ← provider: store + host bridge     │
  │     <Signin.Root form={…} />           ← the APP's root component, filled  │
  │  useRegion() / seed(k,v) / provide(k,v)                                    │
  └───────────────────────────────────────────────────────────────────────────┘
                 │ imports                                    ▲ reads back
                 ▼                                            │
  ARCHIPELAGO  —  one file, the region declared: <id>.archipelago.ts
  ┌───────────────────────────────────────────────────────────────────────────┐
  │  id · root · slots (rootProp → slot) · hostSlots · sources · islands[]     │
  │                                                                           │
  │  islands[i] = { slot: 'signin-form',        ← motu's name for a position   │
  │                 element: 'x-github-sign-in',← the TAG, from the registry   │
  │                 bind:   {prop → key},       ← what it READS               │
  │                 writes: {event → key},      ← what it OWNS                │
  │                 intents:{event → intent} }  ← what it ASKS the host for    │
  └───────────────────────────────────────────────────────────────────────────┘
        │ mounts                    │ reads/writes                │ escalates
        ▼                           ▼                             ▼
  ISLAND (a component)  ◄─────►  STORE (region keys)          HOST BRIDGE
   declared by islandElement       one producer per key        navigate / action
   contract: input/output/ambient  ▲            ▲
                                   │            │
                            seed()/provide()   CHANNEL (host signal in)
                                                SOURCE (app module that produces keys)

  LAGOON — the same archipelago, mounted with MockTransport and EVIDENCE
           (island scenarios, region flows) instead of the host and its backend.
```

The rule the diagram encodes: **the page composes nothing motu does not already declare, and the
lagoon composes nothing the page does not already have.** The prop→slot mapping exists once, in the
archipelago, so neither side can arrange the region differently from the other
(`packages/react/src/create-region.tsx:117-155`).

---

## The metaphor terms

These are prose only. They never appear in an import or a type name — those stay literal (`Store`,
`Transport`, `HttpTransport`, `MockTransport`) — see `README.md`.

| Term | Is | Is not |
|---|---|---|
| **Island** | A component embedded in a host page, behind a declared boundary: input props, output events, ambient host reach (`README.md`). | A micro-frontend. Islands are a compile-time composition mechanism: one build, one contract, one version (`README.md`). |
| **Ocean** | The legacy application the islands sit in (`README.md`). The reference one is a Jakarta EE + AngularJS app. | Required. A greenfield or Next host has no ocean; `--host none` and `--host next` are ocean-free. |
| **Archipelago** | The islands of ONE PAGE, referenced by slot, sharing a `Store` instead of talking to each other (`README.md`). A declared grouping. | A DOM container. Scoping one to a subtree puts a boundary through the middle of any coupling that crosses it (`.github/host-rules.md`, "the scope of a region is the PAGE, never a DOM subtree"). |
| **Region** | The same thing as an archipelago, named from the state side: the *keys* one archipelago owns, and the app-side TYPE those keys are declared against (`packages/core/src/archipelago.ts:201`, the `TRegion` parameter). | A second construct. `motu archipelago init` and `motu archipelago create` scaffold the same object at different scopes — see [Archipelagos and regions](05-archipelagos-and-regions.md). |
| **Lagoon** | Isolated mode: islands rendered with no ocean present, against fixtures (`MockTransport`), no session, no login, no backend (`README.md`). Where the loop closes. | A local environment. The lagoon proves a component and its declared boundary; it deliberately has no backend, so cross-page behaviour is out of scope (`README.md`). See [The lagoon](08-lagoon.md). |
| **Mainland** | The standalone destination the code migrates toward once the ocean recedes (`README.md`) — concretely, the plain components under `src/ui/`, which depend only on the contract and each other. | A build target. Nothing produces "the mainland"; it is what is left when the wrappers come off. |
| **Motu** | A low islet on an atoll's rim — the island that holds the ocean back and makes the lagoon possible (`README.md`). | — |

---

## The structural terms

### Element (and tag)

An **element** is one row of the project's registry: a tag, a component, and the island's declared
contract. It is written with `islandElement(...)`, which exists to keep the literals — `'x-week-actions'`,
`'week-progress'` — from widening to `string`, because an archipelago's wiring is only checkable
against literal event names (`packages/react/src/bootstrap.ts:56`).

```ts
export const element = islandElement({
  tag: 'x-github-sign-in',
  component: GithubSignIn,
  options: { contract: { input: ['error', 'authError', 'isSubmitting'], output: { onSignIn: 'sign-in-requested' }, ambient: [] } },
});
```
— `host-app/motu/src/islands/github-sign-in.island.ts`

The **tag** is the element's custom-element name, prefixed by `tagPrefix` from `motu.config.json`
(default `x-`). On an ocean it really is a custom element; on a React host the island renders in the
host's own tree and the DOM wrapper is dropped, because a per-island React root is its own context,
error and Suspense boundary (`packages/react/src/react-island.tsx:1-19`). The tag survives as the
island's identity either way — it is what an archipelago entry's `element` names
(`packages/core/src/archipelago.ts:45`), and narrowing it to `keyof ElementTypes` turns an unknown
tag into a compile error.

There are TWO spellings, and the one you will meet most often in a real project is the second:

| form | where it comes from | when |
|---|---|---|
| `islandElement({ tag, component, options })` | `@motu/react` (`packages/react/src/bootstrap.ts:56`) | the base form — the contract is written out in the island file |
| `island(tag, Component, { events })` | `./contracts.generated` — GENERATED by `motu island sync` | the contract is READ from the component and lives in the generated file, so the island file declares only what was DECIDED |

The generated `island()` is a thin wrapper: `contracts.generated.ts` imports `islandElement` from
`@motu/react` and closes over the contract it derived from the component's own props
(`packages/cli/src/lib/contracts.mjs:164`). So the two produce the same element; they differ in where
the contract's literals are written down.

```ts
import { island } from './contracts.generated';
export const element = island('x-week-actions', WeekActionsView, {
  events: { onProgress: 'week-progress', onLifetimeActionsDelta: 'lifetime-delta' },
});
```

In one adopting project's 32 island files, 20 use the generated `island()` and 12 use
`islandElement` directly. Both are current; neither is deprecated.

An element is *not* the component. The component lives in `src/ui/` (or in the app already, with
`--from`); the element file declares only how it is mounted.

### Contract (an island's boundary)

The whole boundary, declared in one place — `options.contract` on the island file:

| Axis | Field | Meaning |
|---|---|---|
| INPUT | `contract.input` | Props fed from the store or host. Bare names, or `{ name, default, required }` so the island renders from defaults alone (`packages/core/src/island.ts:47`, `:86`). |
| OUTPUT | `contract.output` | Callback prop → CustomEvent name, e.g. `{ onReset: 'reset' }`. The prop is `keyof P`, so a declared output that does not exist on the component is a build error, not a silent no-op (`packages/react/src/defineReactElement.ts:26-32`). |
| AMBIENT | `contract.ambient` | Host capabilities the island reaches for without being handed them: a React context, a session hook, a service module it imports (`packages/react/src/defineReactElement.ts:35-45`). The coupling most likely to make an island unmountable elsewhere. |
| COUPLING | `contract.coupling` | Dependencies beyond the store, and for AngularJS the *mechanism* — `hostScope`, `adopt`, `inheritScope` (`packages/core/src/island.ts:61`). Empty for a well-behaved island. |

Precision: `ambient` is declared on the React side (`DefineOptions`) but is absent from
`@motu/core`'s `IslandContract` (`packages/core/src/island.ts:86`). Author it in the island file.

**Isolation** is a separate, orthogonal axis: `'shadow'` cuts the island off from the host cascade
both ways, `'light'` renders into the element itself and inherits it
(`packages/core/src/island.ts:24`). It decides whether the host's CSS reaches the island, never which
tree the island renders in.

### Slot

A **slot** is motu's name for a position in a region — the string an archipelago entry declares
(`packages/core/src/archipelago.ts:36`) and the only name a flow may reference. It is the stable
handle: a renamed slot fails the flows that use it instead of silently matching nothing.

A slot is *not* a DOM node and *not* a selector. On an ocean the page drops a
`<motu-island slot="…">` marker; on a React host the page never writes a slot at all — it passes the
app's own prop name to `<X.Root>` and the archipelago's `slots` map decides which island wraps it
(`packages/core/src/archipelago.ts:266`, `packages/react/src/create-region.tsx:122-155`).

For a *catalogue* region (members decided at runtime from data), `member` is the app's own name for
the row that summons the island — `WidgetType.FIELDS` — kept separate from motu's slot because the
checks compare against captured rows and a codegen'd enum, neither of which has heard of a slot
(`packages/core/src/archipelago.ts:54`).

### Key

A **key** is one entry in the region's shared `Store` (`packages/core/src/store.ts:226`). Keys are
the region's vocabulary, and every key has exactly one of two origins:

| | Declared by | Derived as |
|---|---|---|
| **Island-produced** | `writes: { <event>: <key> }` on the archipelago entry (`packages/core/src/archipelago.ts:158`) | `ProducedKeys` (`:353`) |
| **Host-fed** | nothing — it is what is left | `HostFedKeys = BoundKeys − ProducedKeys` (`:380`) |

There is no third case, which is why `provides` (`:214`) is documented as declarable only for the one
thing derivation cannot see: a host-fed key no island binds.

Ownership is a **compile** failure, not a report: the required `ownership` property of the
declaration's second argument, typed `RegionOwnershipOk<A>`
(`packages/core/src/archipelago.ts:425`, `:570`), plus a runtime producer map that catches a write
from the wrong source (`packages/core/src/store.ts:136-147`). What it prevents: two islands wired to
each other through the page's own state. See
[Archipelagos and regions](05-archipelagos-and-regions.md).

A key is *not* server data. Shared UI state is declared in the store; a component refetches through
the contract instead.

### Bind, writes, reads, intents

The four declarations on one archipelago island entry:

| Field | Direction | Says |
|---|---|---|
| `bind` (`:115`) | key → prop | What the island READS. List form for the common case, map form only for renames — a rename is a decision, everything else was transcription (`packages/core/src/archipelago.ts:171-180`). |
| `writes` (`:158`) | event → key | What the island OWNS. Declaring it (rather than an `on` handler) is what makes ownership enforceable, the wiring readable without running it, and the coupling ejectable as a `useState` + callback prop. |
| `reads` (`:70`) | — | Keys consumed without a prop, because a *foreign* store hands them over directly. A CLAIM, not a wire: motu cannot enforce a store it does not own. |
| `intents` (`:135`) | event → intent name | What the island ASKS THE HOST for. The island cannot perform it; the result is whatever the host then says the state is. Unanswered intents fall through to the host bridge. |
| `on` (`:121`) | event → function | The escape hatch, kept only for outputs with no store effect. Anything that writes belongs in `writes`. |

### Seed and provide

Two ways a value enters the store from outside an island, and they are not interchangeable:

- **`seed(key, value)`** — establish a key's STARTING value. The only legitimate way to touch a key an
  island produces (`packages/react/src/create-region.tsx:77`, `packages/core/src/archipelago.ts:725`).
  Ownership is about updates, not first paint, so `seed` and `writes` coexist by design
  (`packages/core/src/archipelago.ts:152-154`).
- **`provide(key, value)`** — feed a key the region declares as host-fed
  (`packages/react/src/create-region.tsx:79`, `packages/core/src/archipelago.ts:683`).

In evidence, `seed` is a flow's whole precondition and `provide` is a step's stimulus — see below.

### Channel

A **channel** is the inbound counterpart to the host bridge: it observes a host signal (an HTTP call,
a scope value, a DOM event) and writes it into the region's store, which islands then react to
through `bind` (`packages/core/src/channel.ts:1-20`). Channels are installed at the composition root
(`installChannels`, `packages/core/src/channel.ts:87`) and are what keep islands mode-agnostic:
islands read the store, never the ocean.

A channel is *not* a place for logic. `channelFrom` (`packages/core/src/archipelago.ts:895`) builds
one from a declared **source** — an application module that produces named keys, imported by the
archipelago rather than named as a string (`packages/core/src/archipelago.ts:324`,
`packages/types/src/index.ts:25-49`). The source belongs to the app and survives motu's removal; the
declaration goes with motu. What it buys: every host-fed key has exactly one declared producer, and
the page and the lagoon must install THAT module rather than each restating what it does
(`RegionSourcesOk`, `packages/core/src/archipelago.ts:397`).

### Host bridge

The outward seam: `{ navigate(path), action(name, detail) }`
(`packages/core/src/archipelago.ts:19`). Islands stay host-agnostic and emit intents; the composition
root supplies a bridge that knows how to talk to the host — AngularJS `$location`, a Next router. With
no bridge configured, intents log a warning rather than doing anything (`:24`).

A host bridge is *not* a router and *not* an event bus. It is one object with two methods, chosen once
per composition root (`useHost` in `packages/react/src/create-region.tsx:36-42`).

### Transport

The seam every server call leaves through: `Transport = { call(service, method, args) }`
(`packages/runtime/src/index.ts:13`), chosen once with `configure()` (`:20`) and reached by generated
`@motu/contract` code through `call()` (`:100`). `HttpTransport` for a real backend, `MockTransport`
for the lagoon (`packages/runtime/src/mock.ts:157`).

The rule: all I/O goes through the generated contract and this one seam — no bare `fetch` in a
component. What it prevents: an island that cannot mount in the lagoon, because the
only thing standing between it and a backend is a network. See
[Contract and backend](11-contract-and-backend.md).

---

## The evidence terms

Evidence is the declared data the runtime lane consumes. It lives in a SIBLING file — `<kebab>.evidence.ts`
for an island, `<id>.evidence.ts` for a region — never inside the island or the archipelago, so
fixtures cannot travel into a production bundle (see the header of
`host-app/motu/src/archipelagos/signin/signin.evidence.ts`).

| Term | Type | Is |
|---|---|---|
| **Fixture** | `Fixture` (`packages/runtime/src/mock.ts:71`) | One recorded backend answer, keyed by `service` + `method`, optionally by `match` (deep-equal on the call args, `undefined` as a wildcard) and gated by `roles`. Either a `response` (`:27`) or a `status` failure (`:56`). |
| **Scenario** | `Scenario` (`:85`) | A named `seed` for ONE island. Two scenarios whose renders are identical fail `data-flow` — two seeds that produce one screen are one seed (`README.md`). |
| **Flow** | `RegionScenario` (`:102`) | A named `seed` plus `steps` for a whole region. This is the integration test, as a value. |
| **Step** | `RegionStep` (`:109`) | `emit` (slot + declared event + detail), and/or `provide` (keys in), asserting with `expect` (store keys) and/or `expectRender` (slot → text). |

A flow **cannot script**. There is no selector, no click, no wait, no page object: a step names a SLOT
and a DECLARED event (`README.md`). That constraint is what buys determinism, and it puts a
component's internal interaction logic permanently out of scope — that stays a Testing Library test
(`README.md`).

Every declared state is an **address**: `/?target=island:<tag>&scenario=<name>` and
`/?region=<id>&flow=<name>&step=<n>` — the parameters `scenario`, `flow`, `step`, `region` and
`target` are read in `packages/react/src/lagoon-states.ts:111-139`. `motu lagoon states` prints them.
A name that resolves to nothing REFUSES to render rather than falling back to a default
(`packages/cli/src/run.mjs:124`). See [Evidence and testing](10-evidence-and-testing.md).

---

## How they relate, in one pass

1. A **page** in the host app is the scope of one **region**, declared as one **archipelago** file.
2. The archipelago names the app's own **root** component and maps its props to **slots**.
3. Each slot entry names an **element** by **tag**; the element pairs a **component** with its
   **contract** (input / output / ambient).
4. Islands read region **keys** through `bind` and update the ones they own through `writes`.
   Everything else is host-fed, by **channel** or **source**, or established with **seed**/**provide**.
5. Outputs with no store effect leave as **intents**, answered by a source or by the **host bridge**.
6. Server calls leave through the **transport**.
7. The **lagoon** mounts the same archipelago with `MockTransport` and **evidence** — no ocean, no
   backend, no session — and each **scenario** and **flow** is an address you can open.
8. Removing motu leaves the component, the root, the region type and the source behind, working —
   `motu removal-check` is what keeps that honest.

Next: [Getting started](02-getting-started.md) · [Archipelagos and regions](05-archipelagos-and-regions.md) ·
[Checks and verification](07-checks-and-verification.md)
