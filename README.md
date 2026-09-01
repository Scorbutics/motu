<img src="assets/motu-icon.svg" width="72" align="right" alt="">

# motu

**A workshop for an application's screens, not its components.**

Every state a screen can be in gets an address you can open in a browser — with no backend, no
session and no login. Because those states are *declared* rather than scripted, the same
declarations also run as a deterministic integration suite, and cross-component state ownership
becomes a build error instead of a bug.

```
motu lagoon states
  /?target=island:x-week-actions&scenario=empty-week
  /?region=actions&flow=picking-a-shot&step=1
```

Open either one. It is the real components, still interactive, rendered from a declared seed.

> **Status:** works, used daily, not published to npm. Install from a checkout (below). React hosts
> today (Next.js, Vite, plain React) plus an AngularJS adapter for legacy hosts. MIT licensed.

---

## The problem

A component library tells you a button works. It cannot tell you that when the region holds *this*
state, the screen shows the right thing, and that acting on it moves the state correctly. That
question — a *screen* question — is where most bugs live, and answering it usually means a browser
suite that logs in, seeds a database, waits for selectors, and flakes.

motu answers it without a server, because the region's couplings are written down.

## What a screen looks like, written down

A **region** is one page's islands, sharing declared keys instead of talking to each other:

```ts
// actions.archipelago.ts — the whole coupling model of the page
islands: [
  { slot: 'week-picker',  element: 'x-week-picker',
    writes: { 'week-selected': 'currentWeek' } },        // ← this island OWNS currentWeek
  { slot: 'week-actions',  element: 'x-week-actions',
    bind:   ['currentWeek', { stats: 'networkStats' }] }, // ← this one only READS it
]
```

One producer per key, checked statically. A second island claiming `currentWeek` fails in the branch
that wrote it — which is also what makes several agents working on one screen safe, with no new
mechanism.

Then a **flow** is a value, not a script:

```ts
{
  name: 'picking a shot is what the viewer is for',
  seed: SEED,                                    // the precondition, written where the assertion is
  steps: [
    { expectRender: { 'diff-viewer': 'Pick a shot' } },
    { emit: { slot: 'shot-list', event: 'shot-selected', detail: SELECTED },
      expectRender: { 'diff-viewer': 'compact-rows@mobile' } },
  ],
}
```

`motu archipelago verify actions --runtime` runs it: a real browser, the real components, the page's
own layout — at about the cost of a unit test.

## Why it does not flake

Three properties, each removing a class of flakiness rather than mitigating it:

- **Data, not script.** No selectors, no page objects, no waits. A step names a *slot* and a
  *declared event*. The vocabulary is the archipelago's, so a renamed slot fails the flow instead of
  silently matching nothing. If you want a selector, you have left the harness.
- **Stateless.** Every flow opens on its own `seed`. No database, no login, no fixture ordering, no
  cleanup, no leakage. Two flows cannot interfere because neither has anywhere to leave residue.
- **One page, re-aimed.** The runtime lane boots *one* lagoon page for a whole run and feeds each
  scenario into it. A scenario costs a store write, not a page load plus a login plus a reset.

And the shape is checked as well as run, because a cheap test that cannot fail is worse than none:

| Check | Rejects |
|---|---|
| `flow-mutation` | a step whose assertion still holds when its stimulus changes — it was asserting a constant |
| `render-coverage` | slots no flow ever looks at — the ones accidentally wired to a neighbour's data |
| `data-flow` | an island whose scenarios render identically — two seeds producing one screen are one seed |

## The suite is also the review surface

Because every declared state is an **address**, the flows are simultaneously the test suite and a
browsable index of the app's screens — including the states *between* the steps. A scripted suite
tells you it is green; this one you can read, and hand to someone as a link.

That inverts the usual economics: the pressure to write another flow comes from wanting to *see* a
state. Coverage is the side effect.

## Two tiers, because a passing check proves less than you think

motu was built agents-first, and that turned out to be the interesting constraint. Generating a
React component is cheap; what is scarce is a loop an agent can close alone. The failure mode that
matters is not a weak model — it is **self-consistency**: a capable agent produces a screen, and
evidence for it that agrees perfectly with itself and describes an application that does not exist.
A better model makes that artifact *more* convincing.

- **Assertions catch DRIFT** — an artifact contradicting what it declares. `tsc` is the first and
  cheapest: motu's declarations are typed against the application's own types, so a rename in the
  codebase lands on the region and fails there before any motu check runs.
- **Perception catches INVENTION** — an artifact that contradicts nothing, passes everything, and is
  simply not this application. Nothing mechanical reaches it, because every mechanical check
  compares the artifact to itself. Rendering is what forces a comparison with the world.

Two real bugs found only by tier two: a fixture inventing a vocabulary the application does not use,
and an island stylesheet that was bundled and never applied. Both passed every check. Both died the
moment an agent *opened the page and read it*.

So a run with new snapshots reports **`LOOK`**, not `PASS` — tier one saying it has nothing to
offer and routing the question to something that can perceive. And the reader should be a *fresh*
agent, handed the state's URL and the app's vocabulary but **not** the diff, the plan or the
transcript: the agent that built the region holds the invention in context as a premise, and is the
one reader who cannot see it.

## Cost, honestly

Measured on a 16-island / 2-region project (snapshots on a 20-island / 3-region one):

| Command | Answers | Cost | When |
|---|---|---|---|
| `motu check` | has anything drifted from what it declares? | **1.4s** | every change |
| `motu island verify <n> --runtime` | does this island still behave? | ~15s | while you work |
| `motu archipelago verify <id> --runtime` | do this region's flows still end as declared? | ~25s | while you work |
| `motu check --runtime --fast` | everything a happy-dom mount can answer | 44s (5.9s scoped) | while you work |
| `motu check --runtime` | does the whole project work? | 103.5s | before handover |
| `motu check --audit` | is it usable — every viewport, for everyone? | + responsive/a11y | before integrating, in CI |
| `motu island snapshot --all --remote` | did anything move? | 89s | before handover |

Three exit codes, and the third is the one that matters for unattended loops:

```
0  the declarations hold
1  something contradicted them   -> repair
2  a check could not run          -> retry, do NOT repair
```

A port that never opened is not a failing test. A human shrugs and re-runs; an agent reads `✗` and
confidently repairs a bug that does not exist.

## What it deliberately cannot do

**Script.** A flow drives a region through *declared outputs*. It cannot type, click or tab, and it
never touches a selector. That constraint is what buys the determinism — and it puts a component's
*internal* interaction logic (type an invalid value, watch validation fire) permanently out of
scope. That stays a Testing Library test.

**Reach a backend.** The lagoon has no server, on purpose. Cross-page behaviour mediated by the
database, authorization, migrations — those stay a real integration suite. Simulating a backend
inside the lagoon (a stateful fake, the schema in pglite) was investigated and declined: it
reimplements business logic that cannot be diffed against the original, and the moment the lagoon
has a backend it loses determinism, one-cause failures, speed, and the artifact with nothing behind
it. What is left is a worse local environment.

motu shrinks that suite to the tests that were worth a browser. It does not remove it.

## It is deliberately invasive

motu changes the application — a source module, a region type, props with real defaults, ownership
written down. That is not a tax the framework charges for its features; it **is** the feature. Every
declaration is a seam a check can attach to, which is why `tsc` catches motu drift at all and why
the checks are mechanical rather than heuristic.

`removal-check` is what keeps the deal honest: it deletes every motu file, unwraps every tag, and
proves the application still typechecks without it. A boundary instrument you cannot remove has
stopped describing the app and started being part of it.

## Where it pays — and where it does not

The threshold is per **screen**, not per app. An app of any size can have one screen that wants this
and eleven that get nothing.

**Worth it:** a screen where several components share state, touched by more than one person, in a
codebase that will outlive the current roadmap.

**Not worth it:** a design-system repo (no regions, no shared page state — Storybook is strictly
better there), and prop-drilled trees with no coupling pain. A product still in discovery should use
the *loop* rather than the suite — build the screen out of the app, publish the link, show it, then
integrate — and should not pay for a page's ownership survey until the page is worth keeping.

## Try it

Requires **node >= 20.11** and git.

```bash
git clone https://github.com/Scorbutics/motu.git
cd motu && ./install.sh          # deps + link `motu` onto PATH + install the agent skills

cd ~/dev/my-app
motu init . --host next          # scaffolds into a subfolder; nothing else changes
motu archipelago create directory
motu island create phone-display --from '@/components/phone-display'
motu island verify phone-display --runtime
motu lagoon dev
```

`--from` takes the specifier **the app itself uses**, aliases included, and writes only a mount
point — the component stays where it is and every existing call site keeps working. On a React host
an island *is* the app's component; no wrapper is written and nothing is forked.

There is no install step for the framework: motu resolves vite, tsx, ts-morph and playwright from
its own checkout, so an adopting project installs nothing. A greenfield `init` → `create` →
`verify --runtime` passes in a real browser with an empty `node_modules`.

**Show someone.** `motu lagoon publish --remote` uploads a self-contained page to a lagoon host and
prints two URLs — a `latest` bookmark that follows every publish, and an immutable one keyed by the
commit. A link you can open on a phone, with no dev server, no tunnel and no backend running.

---

## Documentation

The full reference set lives in [`docs/`](docs/README.md). Read in order if you are new:

| | |
|---|---|
| [01 — Concepts](docs/01-concepts.md) | island, ocean, archipelago, lagoon, region, slot, key. Every other page assumes it. |
| [02 — Getting started](docs/02-getting-started.md) | `motu init` to a working lagoon, the first island, the loop. |
| [03 — CLI reference](docs/03-cli-reference.md) | every command, every flag, which tier it belongs to. |
| [04 — Configuration](docs/04-configuration.md) | `motu.config.json` key by key. |
| [05 — Archipelagos and regions](docs/05-archipelagos-and-regions.md) | declaring a region: slots, keys, `root`, `hostSlots`, channels. |
| [06 — Composition and adoption](docs/06-composition-and-adoption.md) | `X.Root` vs `X.Island`, and the staged adoption path. |
| [07 — Checks and verification](docs/07-checks-and-verification.md) | every check id, the three tiers, the three exit codes. |
| [08 — The lagoon](docs/08-lagoon.md) | dev, states as addresses, publish, serve, hosting, visual baselines. |
| [09 — Coverage](docs/09-coverage.md) | the production fold: fingerprints, corpus, `archipelago coverage`. |
| [10 — Evidence and testing](docs/10-evidence-and-testing.md) | scenarios, flows, evidence files, what each check reads. |
| [11 — Contract and backend](docs/11-contract-and-backend.md) | the contract seam, transports, fixtures, codegen. |
| [12 — Hosts and adapters](docs/12-hosts-and-adapters.md) | Next, AngularJS, none; `removal-check`. |
| [13 — Agents and skills](docs/13-agents-and-skills.md) | the shipped skills and the multi-agent workflow. |
| [14 — Migrating an ocean](docs/14-ocean-migration.md) | coexistence, `legacy-toggle`, inbound channels, how the ocean recedes. |

## Terminology

The metaphor is load-bearing enough to be worth thirty seconds. These words stay in prose only —
imports and type names are literal (`Store`, `Transport`, `MockTransport`).

- **Island** — a component embedded in a host page, behind a declared boundary.
- **Ocean** — the legacy application the islands sit in. Optional; a greenfield host has none.
- **Archipelago** — the islands of one *page*, sharing a store instead of talking to each other. A
  declared grouping, never a DOM container: scoping one to a subtree puts a boundary through the
  middle of the coupling it exists to declare.
- **Region** — the same thing named from the state side: the keys one archipelago owns.
- **Lagoon** — isolated mode. Islands rendered with no ocean, against fixtures. Where the loop closes.
- **Mainland** — what is left once the ocean recedes and the wrappers come off.
- **Motu** — a low islet on an atoll's rim: the island that holds the ocean back and makes the lagoon
  possible. Which is the whole trick — no calm water to verify in, no loop.

## Where it came from

motu began as a closed verification loop for building UI against a legacy application that has no
loop of its own: build the component in isolation — no legacy app running, no session, against
recorded fixtures — and integrate it only once it passes there. Applied to a Jakarta EE + AngularJS
app, that same loop lets you migrate the UI incrementally, reusing the legacy backend's database,
business logic and authorization without reimplementing any of them.

Incremental migration was always the *consequence* of the loop rather than the point of it — and so,
it turns out, was the legacy application. The loop is worth closing around a screen whether or not
anything is being migrated into it.

## Non-goals

Declined by design, not gaps on a roadmap:

- No runtime module loading, no federation, no import maps.
- No per-island versioning — one build, one contract, one version.
- No island registry mutable at runtime, no plugin API.
- No island-to-island direct imports — the store and DOM events only.
- No orchestrator. motu has no shell, because the host page *is* the shell.
- No SSR, no cross-origin production deployment.

Most of the pain associated with micro-frontends — duplicated framework payloads, version skew,
debugging across bundle boundaries, fragmented auth — comes from assembling independently built
artifacts at runtime. motu refuses that composition model outright, so those problems have nowhere
to occur rather than needing mitigation.

## Known limits

- **CSS isolation is containable, not solved.** The lagoon cannot reproduce legacy stylesheet
  collisions, AngularJS digest timing, or session expiry.
- **`contract-only-io` cannot see a direct Supabase import.** The blocked-client list is
  `axios/ky/superagent/node-fetch/got`; `@supabase/supabase-js` is not on it. Should be configurable.
- **Turbopack does not work.** The Next host builds with `--webpack` only: Turbopack resolves an
  absolute `resolveAlias` as project-relative and has no `extensionAlias` equivalent.
- **Placed is not rendered.** `integrate check` reads source, so it sees `<X.Island slot="y">` and
  cannot see whether the branch containing it ever runs. It warns; closing that gap needs the host's
  own test runner.
- **The adapter seam is unproven.** The lagoon swaps the *port*, so the app's own orchestration runs
  — but nothing pins the few lines that map a real backend's shape onto that port. It is a few lines
  by construction, which is the mitigation.
- **React only, today.** Nothing in the design is React-specific; Vue and Angular hosts are adapter
  work. Until that adapter exists, this reads as a React tool.

## Repository layout

```
packages/          the framework (@motu/*)
  core/            Store, custom elements, defineIsland, channels, provide() seam
  react/           createRegion, islandElement, the lagoon runtime
  runtime/         transport seam: configure(), call(), HttpTransport, MockTransport
  cli/             the `motu` CLI — the deterministic surface an agent drives
  host/            `motu-host`: content-addressed lagoon hosting + visual baselines
  coverage/        the production fold — fingerprints and corpus
  chrome/          motu's own design tokens. Plain ESM, so Vite and bare node both read it
  adapters/        next/ and angularjs/
  codegen/         manifest.json -> TypeScript contract
java/              the Jakarta half: @BrowserCallable APT + the endpoint dispatcher
demo-app/          the reference app, proven against a real ocean
host-app/          motu's own UI — the lagoon host's Next app, built WITH motu, because a UI
                   framework that hand-writes its own screens is testing a claim it never makes
docs/              the reference set
```

## Building this repo

```bash
pnpm install
pnpm dev:lagoon        # the lagoon, mock data, no backend
pnpm typecheck
cd java && mvn install # the Jakarta half
```

## License

[MIT](LICENSE).
