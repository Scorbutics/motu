<img src="assets/motu-icon.svg" width="72" align="right" alt="">

# motu

**An architecture framework for building a page's regions incrementally — keeping the state between
components coherent, the boundaries explicit, and the backend dependencies declared.**

A region of a page is an **island**; who owns which piece of that region's state is declared in an
**archipelago**; what the region asks of a backend is declared at its edge. None of that is
documentation — a second island writing a key someone else owns is a build error, a slot that does
not exist fails the host's typecheck, and a backend call nothing declared fails the flow that made it.

What this buys: **you can build one region at a time and integrate it without a surprise at the end.**

The **lagoon** follows from that. Once a region has declared its state, its seed and its
dependencies, it renders with nothing around it — so every state it can be in gets an address you can
open in a browser, with no backend, no session and no login:

```
motu lagoon states
  /?target=island:x-week-actions&scenario=empty-week
  /?region=actions&flow=picking-a-shot&step=1
```

Open either one. It is the real components, still interactive, rendered from a declared seed.

And before you know what to assert, ask a region what happens — each step's keys, slots and calls,
in about five seconds:

```
motu lagoon try review 'click nothing-wrong@desktop new'
  key   selectedShot: undefined → {"island":"load-error","shot":"nothing-wrong@desktop"}
  slot  accept-bar: Accept this shot Accept load-error Accept all 2 pending
```

### Try it live!

Remote public official motu "demo app" lagoon: https://motu.bulgarelli.dev/Scorbutics/motu-demo-app/latest/all
This is representing the actual demo app running here: https://sandbox.bulgarelli.dev 

### Does it catch anything?

Six **coupling** defects — every part individually correct, the composition wrong — injected into a
real app (shlink). Method and caveats in [`bench/coupling/RESULTS.md`](bench/coupling/RESULTS.md).

```
           tsc  motu-types   lint   tests    motu  motu-rt
  C1         ✓       ✓         ✓       ✓       ✓       ·   the two islands are placed in each other's slots
  C2         ·       ✓         ·       ·       ✓       ✓   a second island claims a key another produces
  C3         ·       ✓         ·       ✓       ✓       ✓   a slot name typo in the page
  C4         ·       ·         ·       ✓       ·       ✓   the reader stops binding the key it reads
  C5         ·       ✓         ·       ✓       ·       ✓   a declared write wired to an event the island never emits
  C6         ·       ·         ·       ✓       ✓       ·   the region is composed but never wrapped
```

**motu caught 6 of 6; the app's own tooling caught 5 of 6.** shlink has a test that renders the whole
page, and that sees composition. So the honest claim is:

> a page-level integration test catches most coupling defects; motu is that test, declared instead of
> written, plus one class the test cannot see.

That class is **two islands claiming one key**: nothing renders differently, the store just has two
writers and no owner. Caught statically, in about a second.

### The loop this is built for

    an agent builds a region        declared: who owns which key, which island fills which slot
      ↓
    the lagoon serves it live       every state at its own URL, on a shared host
      ↓
    a human looks — and so does     the URL is the handover; a passing check is not
    a fresh agent
      ↓
    integrate, with the checks      slots typed against the page, one producer per key, removable

Ownership is declared so several agents can build one screen at once — the archipelago IS the claim
registry, and a second claim on a key fails in that agent's own branch. The final look is
deliberately not the author's: an agent that invented something holds it in context as a premise, so
the reader is a human or a fresh agent given only the URL. A run with new snapshots says **`LOOK`**,
not `PASS`, and a check that could not run exits `2` — retry, do not repair.

### What motu is not

Not a component workshop. Storybook's unit is a **component** and its product is a **catalogue**: a
component in a state you wrote. motu's unit is a **region of a page** and its product is a
**declaration of ownership the build enforces** — then checked against the real page
(`motu integrate check`), with flows that must be able to fail and backend calls that must be
declared. A catalogue has no notion of who owns a piece of state, so nothing tells it when a second
writer appears. The two are complementary; for a design system, Storybook is strictly better.

Not a test runner either. motu checks **composition**; your components' own logic still needs unit
tests, and cross-page behaviour through a real backend still needs an integration suite. The whole of
motu is removable in one command (`motu removal-check`), and proves it.

## Where it pays

Per **screen**, not per app: a screen where several components share state, touched by more than one
person — or more than one agent — in a codebase that will outlive the current roadmap. Not a
design-system repo, not a prop-drilled tree with no coupling pain.

## What it runs on

> **Status:** early. Used daily, MIT licensed, not on npm — install from a checkout.

| Stack | Evidence |
|---|---|
| **Next.js** | `host-app` (motu's own UI, daily), three cold-start adoptions of [Formbricks](https://github.com/formbricks/formbricks) |
| **Vite + React + TS** | `review-console`, [Novu](https://github.com/novuhq/novu)'s dashboard, a metadata-driven app (Twenty) |
| **AngularJS 1.x** | islands written in AngularJS mount like any other — `demo-app` runs one beside its React islands; [migrating a legacy app](docs/14-ocean-migration.md) |

- **Required:** React 18+, TypeScript, a real `node_modules` (no Yarn PnP), Next (webpack, not
  Turbopack) or Vite as the host bundler. npm projects run `motu link` once.
- **Not supported:** Angular 2+, Vue, Svelte, Solid, Lit, plain-JS React, pages with no JavaScript
  layer. Islands are custom elements, so nothing in the core forbids another framework — but none
  has an adapter, and there is no partial path. Your backend language does not matter; what renders
  your components does.

If your stack is not in the table, assume it does not work yet.

## Try it

Requires **node >= 20.11** and git.

```bash
git clone https://github.com/Scorbutics/motu.git
cd motu && ./install.sh          # deps + link `motu` onto PATH + install the agent skills

cd ~/dev/my-app
motu init . --host next          # scaffolds into a subfolder; nothing else changes
motu archipelago init directory
motu island create phone-display --from '@/components/phone-display'
motu island verify phone-display --runtime
motu lagoon serve --watch
```

`--from` takes the specifier the app itself uses and writes only a mount point — on a React host an
island *is* the app's component; nothing is forked. `motu lagoon publish --remote` then puts it on a
lagoon host as a link anyone can open, phone included.

The demo, **The Motu's club** — six screens over a real Postgres, one left as plain React on purpose
— is in [`demo-app/`](demo-app/RECORDING.md).

## Documentation

- [Design and limits](docs/15-design-and-limits.md) — why it does not flake, the two tiers, cost,
  what it cannot do, non-goals, known limits.
- [Concepts](docs/01-concepts.md) — island, archipelago, lagoon, region, slot, key.
- [Getting started](docs/02-getting-started.md) — `motu init` to a working lagoon.
- [Everything else](docs/README.md) — CLI, configuration, checks, lagoon, evidence, hosts, agents.

## License

[MIT](LICENSE).
