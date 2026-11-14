# Design and limits

Why motu is shaped the way it is, what it costs, and what it deliberately does not do. The
[README](../README.md) is the pitch; this is the reasoning behind it.

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
own layout, in about 25 seconds for a region.

## Why it does not flake

Three properties, each removing a class of flakiness rather than mitigating it:

- **Data, not script.** No selectors, no page objects, no waits. A step names a *slot* and a
  *declared event*. The vocabulary is the archipelago's, so a renamed slot fails the flow instead of
  silently matching nothing. If you want a selector, you have left the harness.
- **Stateless.** Every flow opens on its own `seed`. No database, no login, no fixture ordering, no
  cleanup, no leakage.
- **One page, re-aimed.** The runtime lane boots *one* lagoon page for a whole run and feeds each
  scenario into it. A scenario costs a store write, not a page load plus a login plus a reset.

And the shape is checked as well as run, because a cheap test that cannot fail is worse than none:

| Check | Rejects |
|---|---|
| `flow-mutation` | a step whose assertion still holds when its stimulus changes — it was asserting a constant |
| `render-coverage` | slots no flow ever looks at — the ones accidentally wired to a neighbour's data |
| `data-flow` | an island whose scenarios render identically — two seeds producing one screen are one seed |
| `flow-calls` | a backend call no fixture, table or route answered — an app that swallows a 404 still renders a plausible page |

Every check id is in [07 — Checks and verification](07-checks-and-verification.md).

## The suite is also the review surface

Because every declared state is an **address**, the flows are simultaneously the test suite and a
browsable index of the app's screens — including the states *between* the steps. A scripted suite
tells you it is green; this one you can read, and hand to someone as a link.

That inverts the usual economics: the pressure to write another flow comes from wanting to *see* a
state. Coverage is the side effect.

## Two tiers, because a passing check proves less than you think

motu was built agents-first. Generating a React component is cheap; what is scarce is a loop an agent
can close alone. The failure mode that matters is not a weak model — it is **self-consistency**: a
capable agent produces a screen, and evidence for it that agrees perfectly with itself and describes
an application that does not exist. A better model makes that artifact *more* convincing.

- **Assertions catch DRIFT** — an artifact contradicting what it declares. `tsc` is the first and
  cheapest: motu's declarations are typed against the application's own types, so a rename lands on
  the region and fails there before any motu check runs.
- **Perception catches INVENTION** — an artifact that contradicts nothing, passes everything, and is
  simply not this application. Every mechanical check compares the artifact to itself; rendering is
  what forces a comparison with the world.

Two real bugs found only by tier two: a fixture inventing a vocabulary the application does not use,
and an island stylesheet that was bundled and never applied. Both passed every check.

So a run with new snapshots reports **`LOOK`**, not `PASS`. And the reader should be a *fresh* agent,
handed the state's URL and the app's vocabulary but **not** the diff, the plan or the transcript: the
agent that built the region holds the invention in context as a premise.

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
| `motu island snapshot --all --remote` | did any island move? | 89s | before handover |
| `motu archipelago snapshot --all --remote` | did the composed page move? | 18s | before handover |

Three exit codes, and the third is the one that matters for unattended loops:

```
0  the declarations hold
1  something contradicted them   -> repair
2  a check could not run          -> retry, do NOT repair
```

A port that never opened is not a failing test. A human shrugs and re-runs; an agent reads `✗` and
confidently repairs a bug that does not exist.

## What it deliberately cannot do

**Script a region.** A region flow drives islands through *declared outputs*. It cannot type or tab,
and it never touches a selector. (Screen flows may click the app's own links, by accessible name, to
move between screens — that is navigation, not interaction.) That constraint is what buys the
determinism, and it puts a component's *internal* interaction logic (type an invalid value, watch
validation fire) permanently out of scope. That stays a Testing Library test.

**Reach a backend.** The lagoon has no server, on purpose. Cross-page behaviour mediated by the
database, authorization, migrations — those stay a real integration suite. Simulating a backend
inside the lagoon (a stateful fake, the schema in pglite) was investigated and declined: it
reimplements business logic that cannot be diffed against the original, and costs determinism,
one-cause failures and speed.

**Test your components' logic.** motu checks composition. A filter that stops matching on one field
renders fine, composes fine, and passes every check here. Unit tests stay yours.

motu shrinks the browser suite to the tests that were worth a browser. It does not remove it.

## It is deliberately invasive

motu changes the application — a source module, a region type, props with real defaults, ownership
written down. That is not a tax the framework charges for its features; it **is** the feature. Every
declaration is a seam a check can attach to, which is why `tsc` catches motu drift at all.

`removal-check` keeps the deal honest: it deletes every motu file, unwraps every tag, and proves the
application still typechecks without it. A boundary instrument you cannot remove has stopped
describing the app and started being part of it.

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
artifacts at runtime. motu refuses that composition model outright.

## Known limits

- **CSS isolation is containable, not solved.** The lagoon cannot reproduce host stylesheet
  collisions, AngularJS digest timing, or session expiry.
- **`contract-only-io` cannot see a direct Supabase import.** The blocked-client list is
  `axios/ky/superagent/node-fetch/got`. Should be configurable.
- **Turbopack does not work.** The Next host builds with `--webpack` only.
- **Placed is not rendered.** `integrate check` reads source, so it sees `<X.Island slot="y">` and
  cannot see whether the branch containing it ever runs. It warns; the experimental `page-render`
  check and the host's own test runner close the rest.
- **The adapter seam is unproven.** The lagoon swaps the *port*, so the app's own orchestration runs
  — but nothing pins the few lines that map a real backend's shape onto that port.

More, verified against source, in [12 — Hosts and adapters](12-hosts-and-adapters.md#known-limits).

## Where it came from

motu began as a closed verification loop for building UI against a legacy application that has no
loop of its own: build the component in isolation — no legacy app running, no session, against
recorded fixtures — and integrate it only once it passes there. Applied to a Jakarta EE + AngularJS
app, that same loop lets you migrate the UI incrementally, reusing the legacy backend without
reimplementing it ([14 — Migrating an ocean](14-ocean-migration.md)).

Incremental migration was always the *consequence* of the loop rather than the point of it — and so,
it turns out, was the legacy application. The loop is worth closing around a screen whether or not
anything is being migrated into it.

## Repository layout

```
packages/          the framework (@motujs/*)
  core/            Store, custom elements, defineIsland, channels, provide() seam
  react/           createRegion, islandElement, the lagoon runtime
  runtime/         transport seam: configure(), call(), HttpTransport, MockTransport
  cli/             the `motu` CLI — the deterministic surface an agent drives
  host/            `motu-host`: content-addressed lagoon hosting + visual baselines
  coverage/        the production fold — fingerprints and corpus
  chrome/          motu's own design tokens
  adapters/        next/, vite/ and angularjs/
  codegen/         manifest.json -> TypeScript contract
java/              the Jakarta half: @BrowserCallable APT + the endpoint dispatcher
demo-app/          The Motu's club — a React + Supabase app with six regions, one AngularJS island,
                   and one plain-React page left un-adopted on purpose (see demo-app/RECORDING.md)
host-app/          motu's own UI — the lagoon host's Next app, built WITH motu
review-console/    a Vite + React consumer
bench/             the measurements the README quotes
docs/              the reference set
```

## Building this repo

```bash
pnpm install
pnpm dev:lagoon        # the lagoon, mock data, no backend
pnpm typecheck
cd java && mvn install # the Jakarta half
```
