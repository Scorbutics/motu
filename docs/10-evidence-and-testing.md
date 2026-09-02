# Evidence and testing

This page answers what an evidence file *is*, what you may write in one, and — the part that decides
whether any of it is worth having — which checks read which part of it. Evidence in motu is
**declaration**, not a test framework: you write down the states an island can be in and the couplings
a region promises, and the checks in [07 — Checks and verification](07-checks-and-verification.md)
drive those declarations through a real lagoon. There is no `describe`, no `expect(...)`, no runner.
There is a `Scenario[]` and a `RegionScenario[]`, and everything else is machinery that reads them.

Citations prefixed `acme/motu/…` are excerpts from a real production evidence corpus (a
Next.js club application: 23 island evidence files, 10 region evidence files, 11 shared modules) and
are quoted verbatim, comments included — the comments are where the failures are recorded.

---

## The model

Three facts, and the rest of the page follows from them.

**An island ships with evidence that asserts its own render.** An island's evidence is a list of store
seeds — states it can be put into. Adding an island to a region means adding a step to the region's
evidence that asserts what *that* island renders, not extending the region's existing steps
(`.github/host-rules.md:250`). The rule was paid for: two agents added one island each to one region
in parallel, both islands correct, and the *merge* broke it — each had extended the lagoon frame's
slot→row ternary whose fallback was another island's row, so resolving the conflict naively made one
agent's widget render as the other's. `archipelago verify --runtime` was byte-identical between the
correct and the broken resolution, because arrangement is not declared and therefore not checked
(`packages/cli/src/commands/verify.mjs:1495`, `.github/host-rules.md:252`).

**A region ships flows.** A flow is a seed, an act, and what the region holds afterwards
(`packages/runtime/src/mock.ts:102`). The act is an island's *declared* output or the host feeding a
region key — never a selector, never a synthetic click. The restriction is the point: the moment a
harness accepts arbitrary DOM scripting it is a second, untyped test suite and stops being derivable
from the archipelago (`packages/runtime/src/mock.ts:96`).

**Evidence is read, not run.** The same files are consumed by three different readers: node-side
checks that spawn `tsx` (`packages/cli/src/commands/verify.mjs:806`), a plain `import()` in the same
process (`packages/cli/src/commands/verify.mjs:1336`), and a Vite `import.meta.glob` that bundles them
into the lagoon so `?scenario=` and `?flow=` become addresses
(`packages/cli/src/lib/scaffold.mjs:228`, `packages/cli/src/lib/scaffold.mjs:240`). Three readers with
three module-resolution postures is why the file-layout rules below are not style.

---

## File layout and naming

| Artefact | Path | Resolved by |
|---|---|---|
| Island evidence (flat, preferred) | `<islands>/<kebab>.evidence.ts` | `packages/cli/src/lib/util.mjs:105` |
| Island evidence (folder layout) | `<islands>/<kebab>/fixtures.mock.ts` | `packages/cli/src/lib/util.mjs:107` |
| Region evidence | `<archipelagos>/<id>/<id>.evidence.ts` | `packages/cli/src/lib/util.mjs:76` |
| Recorded fixtures | `<islands>/<kebab>/fixtures.recorded.ts` | `packages/cli/src/commands/fixtures.mjs:101` |
| Shared evidence data | anywhere both can reach by a **relative** path | — |

Both island layouts are supported and both are named after the island; which island a file belongs to
is derived from the *path*, never declared, because a second declaration of ownership is a second
thing that can be wrong (`packages/cli/src/lib/scaffold.mjs:221`). The lagoon's fixtures glob covers
both (`packages/cli/src/lib/lagoon-materialize.mjs:72`).

Region evidence sits in its own glob and **must not** join the island one: its `fixtures` would enter
the mock transport's corpus and change what every existing island check replays
(`packages/cli/src/lib/scaffold.mjs:234`, `packages/cli/src/lib/lagoon-materialize.mjs:76`). Only
`scenarios` is read from a region's evidence.

Evidence is always a **sibling file, never the island or the archipelago**. The registry imports the
island; keeping evidence out of that module keeps test data out of the application's production bundle
by construction rather than by trusting tree-shaking
(`acme/motu/src/islands/member-results.evidence.ts:1`,
`acme/motu/src/archipelagos/actions/actions.evidence.ts:3`).

### The relative-specifier rule, and why the failure is silent

**Inside an evidence file, every value import must be relative. `@/` does not resolve, and nothing
tells you.**

Two of the three readers are plain node. `islandScenarios` does `await import('file://…')` and catches
everything (`packages/cli/src/commands/verify.mjs:1336`); `regionFlowCheck` does the same
(`packages/cli/src/commands/verify.mjs:1764`); `snapshot`'s `scenariosFor` does the same
(`packages/cli/src/commands/snapshot.mjs:34`). An aliased import throws inside that `import()`, the
`catch` returns `[]`, and the island quietly has zero scenarios. Nothing is reported, because "no
scenarios declared" is a legal state.

The half-failure is worse than the full one. The two loaders **disagree**: `data-flow` loads through
`tsx` and saw five scenarios while `responsive` — loading through plain node — reported one. Both
call sites now cross-check and take the fuller answer
(`packages/cli/src/commands/verify.mjs:1343`, `packages/cli/src/commands/snapshot.mjs:39`). That
mitigation is real but it is not a fix: on the snapshot path, four islands were baselined at half
their coverage before the shot count gave it away
(`packages/cli/src/commands/snapshot.mjs:39`). The same trap has a second face — a `.js` specifier
pointing at a `.ts` sibling, which is the convention these files use the moment they share a module
(`acme/motu/src/archipelagos/actions/actions.evidence.ts:12`).

The corpus states the rule in the file itself, every time:

```ts
// RELATIVE, and that is the constraint: the checks load this file with a plain node `import()`, which
// cannot resolve `@/` and swallows the failure — an aliased import here leaves the island with zero
// scenarios and says nothing.
import { FAVORITE_IDS, FIRST_PAGE, MEMBERS } from '../shared/directory-evidence';
```
— `acme/motu/src/islands/member-results.evidence.ts:7`

The same rule, stated for regions, is why **evidence must not import the lagoon frame**: keep the rows
in a module with no application imports and let both sides import *that*
(`.github/host-rules.md:185`).

### The `import type` trick

A shared evidence module still wants the app's own types, or it drifts: a field renamed in the app
should fail the build *in the same edit*, not show up months later as a lagoon quietly previewing last
month's shape. `import type` erases at compile time, so the specifier never exists at runtime and the
plain-node loaders never try to resolve it. Aliased **type** imports are therefore safe; aliased
**value** imports are the silent failure.

```ts
// TYPED against the app's own types, and that is the drift guard: a field renamed in
// `DirectoryMember` or a filter added to `DirectoryFilterValue` fails the build HERE, in the same
// edit … `import type` erases, so the checks that load this file through plain node never resolve
// these specifiers.
import type { DirectoryFilterValue } from '@/components/directory/directory-filters';
import type { DirectoryFacetCounts, DirectoryMember, DirectorySearchParams } from '@/lib/services/directory';
```
— `acme/motu/src/shared/directory-evidence.ts:9`

The actions module says the negative form outright: "A VALUE import of an `@/` module would break
those loaders, so there is none" (`acme/motu/src/shared/actions-evidence.ts:9`).

The same erasure principle is used by the `effects` check, which strips `import type` lines before
deciding what a component actually reaches for (`packages/cli/src/commands/verify.mjs:467`).

---

## Scenarios

A `Scenario` is a store seed with a label, and that is the whole type:

```ts
export interface Scenario {
  /** Human label for the case (shown in verify output). */
  name?: string;
  /** Store seed for this case, e.g. `{ criteria: { login: 'brice' } }`. */
  seed?: Record<string, unknown>;
}
```
— `packages/runtime/src/mock.ts:85`

Two scenarios with different seeds that produce *different* rendered output prove data actually flows
across the seam (criteria → contract → render), not merely that the wiring type-checks
(`packages/runtime/src/mock.ts:79`).

An island's evidence exports up to three names, all optional:

```ts
export const fixtures: Fixture[] = [];
export const roles: string[] = [];
export const scenarios: Scenario[] = [
  { name: 'empty', seed: { value: '' } },
  { name: 'a query typed', seed: { value: 'Bêta' } },
];
```
— `acme/motu/src/islands/directory-search.evidence.ts:4`

`fixtures` feeds `MockTransport` (`packages/runtime/src/mock.ts:157`); `roles` is unioned across all
islands and handed to the lagoon's role selector (`packages/cli/src/lib/scaffold.mjs:214`); an island
that fetches nothing exports empty arrays for both, and that is normal — "everything it shows is
host-fed, which is exactly why its evidence is seeds"
(`acme/motu/src/islands/member-results.evidence.ts:4`).

### A scenario is an address

Scenarios are not only node-side inputs. They are bundled into the lagoon and become URLs:

```
?target=island:x-week-actions&scenario=a%20week%20to%20answer
?region=actions&flow=marking%20a%20mission%20done&step=2
```
— `packages/react/src/lagoon-states.ts:14`

Both the gallery (`motu lagoon serve`) and the focused entry that `motu island verify` drives honour
them, because an address only one of them honours is one a person pastes and watches render something
else (`packages/react/src/lagoon-states.ts:17`). **A wrong name must not render**: an unresolvable
state is a banner and a refusal to mount, never a fallback to the default state
(`packages/react/src/lagoon-states.ts:25`). Addressing an island with `?flow=` or a region with
`?scenario=` is likewise refused rather than approximated
(`packages/react/src/lagoon-bootstrap.ts:255`, `packages/react/src/lagoon-bootstrap.ts:328`). See
[08 — The lagoon](08-lagoon.md) for the full address grammar.

### Seeds cross into the browser as JSON

A `Set`, `Map`, function or `Date` in a seed arrives as `{}`. When the island then calls
`favoriteIds.has(...)` the mount dies and **every** scenario renders empty — which `data-flow` reports
as "scenarios rendered identically" and `responsive` as "renders nothing": three misleading findings,
none naming the cause. `seed-transport` names it once, before those checks run
(`packages/cli/src/commands/verify.mjs:1243`). The fix is always at the component: take the iterable,
rebuild the `Set` inside. The corpus records the same lesson at the seed
(`acme/motu/src/islands/member-results.evidence.ts:26`).

### The rule: an island's scenarios must assert its own render

A scenario that only exercises a prop the island ignores is a picture, not evidence. What makes a
scenario evidence is that it is reachable from inputs and that some check compares its output to
another's. Two useful patterns from the corpus:

- **One key apart.** "More to load" differs from "one full page" only in `total` — "and it is what
  makes the button exist. If those two ever render alike, the button has stopped depending on the
  count" (`acme/motu/src/islands/member-results.evidence.ts:30`).
- **A state that only exists in transit.** "Loading the week" had no scenario, "which is how the
  column shipped rendering the settled 'Aucune action pour cette semaine.' for the whole round-trip"
  (`acme/motu/src/islands/week-actions.evidence.ts:75`).

---

## Flows

A region declares no `scenarios` in the island sense; it declares flows, exported under the same name
`scenarios` but typed `RegionScenario[]`:

```ts
export interface RegionScenario {
  name?: string;
  /** Region keys to establish before the flow runs. */
  seed?: Record<string, unknown>;
  steps?: RegionStep[];
}
```
— `packages/runtime/src/mock.ts:102`

The seed is applied **once per scenario, not per step**. Re-seeding before every step silently undid
what the previous steps did — a booking flow that picked two seats and then applied a promo asserted
the discounted total against a fare whose seats had been reset to zero. Every flow written before that
had a single step, so nothing noticed (`packages/cli/src/playwright-lagoon.mjs:540`). A journey is a
sequence or it is three unrelated assertions wearing one name.

### What a step may do

```ts
export interface RegionStep {
  /** The island output to fire, in the region's own vocabulary. */
  emit?: { slot: string; event: string; detail?: unknown };
  provide?: Record<string, unknown>;
  /** Region keys and the values they must hold afterwards. Compared structurally. */
  expect?: Record<string, unknown>;
  expectRender?: Record<string, string | { text?: string; notText?: string }>;
}
```
— `packages/runtime/src/mock.ts:109`

`emit` fires an island's **declared** output — the same seam the wiring probe uses — so a flow can
only ever do what the archipelago says that island can do
(`packages/runtime/src/mock.ts:96`). Reaching for a selector is not merely discouraged; it is not
expressible. There is no field for it.

`provide` is the host feeding region keys, the other way a region moves. Every step used to be an
`emit`, which quietly meant only regions whose islands *write* could have flows at all — Twenty's
record page, whose two widgets both read `editingWidgetId` owned by the app, was undeclarable
(`packages/runtime/src/mock.ts:113`). A region whose islands only read uses `provide` and ends on
`expectRender` (`.github/host-rules.md:157`).

A step must do at least one of `emit`, `provide`, or `expectRender`, and must assert at least one of
`expect` or `expectRender`; both are runtime errors from the driver
(`packages/cli/src/playwright-lagoon.mjs:565`, `packages/cli/src/playwright-lagoon.mjs:673`). A step
that leaves nothing on screen fails even when every key it asserted holds the right value —
`document.querySelectorAll('[data-motu-slot]').length > 0`
(`packages/cli/src/playwright-lagoon.mjs:677`).

Assertions are **polled**, not sampled once: 2000 ms for a real step, 300 ms for a mutant, because a
mutant that still holds holds immediately and the long budget made `flow-mutation` 30% of a whole
`check --runtime` run (`packages/cli/src/playwright-lagoon.mjs:577`).

### `expectRender`: what a person can perceive

`expectRender` is read off the `[data-motu-slot]` markers the lagoon already places, so it needs no
selector from the project and cannot drift from where the region actually mounted
(`packages/cli/src/playwright-lagoon.mjs:595`). The haystack is not `innerText`:

- the element's text,
- its own `aria-label`,
- every descendant's `aria-label`, `alt` and `title`,
- every `input`/`textarea`/`select` value and `placeholder`,
- `checked` / `unchecked` for checkboxes and radios.

— `packages/cli/src/playwright-lagoon.mjs:610`

`innerText` alone could not see a passenger's name in an input or a seat's identity in an aria-label,
which left an island made of form controls with almost nothing assertable. Widening the haystack does
not weaken the check — a wrong value and another island's text both still fail
(`.github/host-rules.md:265`).

Matching is **case-insensitive**, deliberately: `innerText` reports what `text-transform` produced, and
an assertion that breaks when a caption is restyled is asserting the wrong thing. Found the day the
focused lagoon started applying the project's stylesheet, when every flow asserting `"changed"` failed
against `"CHANGED"` (`packages/cli/src/playwright-lagoon.mjs:708-712`). `notText` is the negative form.

### A flow step must be able to fail

This is the load-bearing rule of the whole page. Every green flow in the project has, at some point,
been a tautology — the worst asserted that providing `editingWidgetId` made one island render "editing"
and the other "idle", and passed for hours against stand-in components that printed those words
because the author had written them (`packages/cli/src/commands/verify.mjs:1594`).

`flow-mutation` applies two rules:

**By construction.** A step whose `expect` names *only* keys that same step `provide`d asserts that
the lagoon stored what it was handed. Decidable without a browser, and always an error
(`packages/cli/src/commands/verify.mjs:1633`). What it looks like:

```ts
// CANNOT FAIL — expect names exactly what provide just wrote.
{ provide: { editingWidgetId: 'w-2' }, expect: { editingWidgetId: 'w-2' } }
```

The message says what to do instead: "End on a key another island produces, or on `expectRender` of an
island that is not the one driven" (`packages/cli/src/commands/verify.mjs:1640`).

**By mutation.** Every assertion-bearing step is re-run with its stimulus changed to a value the region
cannot mistake for the real one — `provide` values become `null` (or the string `'__motu_mutant__'`
when already nullish), an `emit` detail becomes `null`
(`packages/cli/src/commands/verify.mjs:1676`). Deliberately crude: subtlety would let a mutant
reproduce the original behaviour by accident, turning a tautology into a pass. If the assertion still
holds under mutation, it does not depend on the input and is asserting a constant — an error
(`packages/cli/src/commands/verify.mjs:1727`).

Three things the mutation report gets deliberately right, each from a real miss:

- A mutant that **broke** the region proves nothing and is reported as a warning, not a kill. Counting
  crashes as kills was hiding exactly the tautology the check exists to find
  (`packages/cli/src/commands/verify.mjs:1712`).
- The check **counts what came back, not what was sent**. Reporting `mutants.length` killed regardless
  of results printed a confident green for work it never saw
  (`packages/cli/src/commands/verify.mjs:1717`).
- Mutants ride along with the real flows in one lagoon boot, because booting is most of what a flow
  check costs (`packages/cli/src/commands/verify.mjs:1622`).

**Know the limit.** An assertion on a stand-in's invented vocabulary is perfectly sensitive to its
stimulus and mutates correctly. Neither rule can see it. Only rendering the application's own component
makes it visible — which is why an island on a host that owns the component *is* that component
(`packages/cli/src/commands/verify.mjs:1609`, `.github/host-rules.md:246`).

**A step may assert with no stimulus at all.** Some islands take no input, so `provide`ing something
just to have a stimulus produces a constant that `flow-mutation` will correctly reject. Write the bare
claim — "this slot renders THIS island" — which is not a data flow and is still worth making
(`packages/cli/src/playwright-lagoon.mjs:558`, `.github/host-rules.md:272`):

```ts
{
  name: 'the stats banner addresses the member about the CURRENT week',
  seed: { ...PAGE_SEED, applicableCount: 3, profilsWaiting: 3, completedCount: 0, overallProgress: 0 },
  steps: [{ expectRender: { 'network-stats': 'dans le club cette semaine' } }],
}
```
— `acme/motu/src/archipelagos/actions/actions.evidence.ts:69`

That step's own comment records what it caught: `isCurrentWeek` drives the banner's read-only notice,
every other check looked only at keys, "so the region could hold the wrong answer for it and still
pass, while the page showed 'Semaine terminée' over a week the navigator was drawing as active. It
did."

### An ordinary flow

```ts
{
  name: 'the search box owns the query',
  seed: { query: '' },
  steps: [{ emit: { slot: 'directory-search', event: 'query-changed', detail: 'Bêta' }, expect: { query: 'Bêta' } }],
}
```
— `acme/motu/src/archipelagos/directory/directory.evidence.ts:49`

Note what is deliberately absent, from the same file: "`load-more` is deliberately NOT here: it is an
intent, it ends in the host, and a flow can only end in a region key."

And note the seed constant one region above it. `weekMissions` was seeded by the page and by no flow,
so every flow ran against a region one column narrower than the real one — "not a missing scenario: a
missing column, and internally consistent on both sides"
(`acme/motu/src/archipelagos/actions/actions.evidence.ts:14`). Factor the page's own seed into
a `PAGE_SEED` constant and spread it into every flow.

---

## A check that looked at nothing has not passed

`report.ok(check, msg, seen)` takes what it examined. `seen: 0` — or an empty array — is converted to a
`skip` automatically, with the message `nothing to look at (no <thing>) — "<claim>" is not a result
this run can claim` (`packages/cli/src/commands/verify.mjs:107`). Every call site gets the invariant
whether or not its author thought about emptiness.

This exists because `removal-check` printed "no motu references in the host application" over a fully
integrated app: it scanned the wrong directories, examined zero files, and reported that as success
(`packages/cli/src/commands/verify.mjs:101`, `.github/host-rules.md:205`).

For evidence specifically, the empty-assertion failure mode has four shapes, and each has its own
guard:

| Shape | What happens |
|---|---|
| No evidence file at all | `region-flow` warns "no declared flows"; it does not pass quietly (`packages/cli/src/commands/verify.mjs:1759`) |
| File present, `scenarios` unreadable or empty | `region-flow` warns "declared flows could not be read, or none are declared" (`packages/cli/src/commands/verify.mjs:1773`) |
| Flows declared, no steps | `region-flow` warns "a flow is a seed, an emit and an expectation" (`packages/cli/src/commands/verify.mjs:1778`) |
| Steps present, none can fail | `flow-mutation` errors or, with nothing to mutate, `skip`s (`packages/cli/src/commands/verify.mjs:1698`) |

The differentiation check applies the same discipline in the opposite direction. **An empty scenario is
not an identical one**: a scenario that renders nothing sinks the comparison, and reporting "rendered
identically" would point at the wrong thing entirely — so `data-flow` names the empty scenarios and
tells the author that an island whose empty state *is* its correct answer cannot take part in the check
at all (`packages/cli/src/commands/verify.mjs:883`). Duplicate renders are a warning, not a pass:
"N of them show nothing the others do not" (`packages/cli/src/commands/verify.mjs:871`).

`report.skip` and `report.inconclusive` are the other two honest outcomes: a rule that does not apply to
this posture, and a check that could not look (`packages/cli/src/commands/verify.mjs:121`,
`packages/cli/src/commands/verify.mjs:129`). See
[07 — Checks and verification](07-checks-and-verification.md) for the exit codes.

---

## `planned: true` — declaring a slot before it is built

```ts
planned?: boolean;
```
— `packages/core/src/archipelago.ts:86`

Declaring a whole region up front is what makes parallel work safe: an agent branches from an
archipelago that already carries everyone else's ownership, so a second claim on a key fails in their
own branch instead of at merge. Measured on a two-agent run, the cost was a region **red in every
branch** until the last island landed, and a permanently red region teaches everyone to ignore the
report (`packages/core/src/archipelago.ts:72`).

`planned: true` splits the two questions. **Ownership still counts the entry** — that is the whole
point — while the checks that ask "does it exist, does it mount, is it placed" skip it:

- `islands-registered` filters planned tags out of the set it resolves against the registry, and when
  *every* declared island is planned it reports `skip` with "nothing to look for yet" rather than the
  false "archipelago declares no islands" (`packages/cli/src/commands/verify.mjs:2533`,
  `packages/cli/src/commands/verify.mjs:2557`).
- `render-coverage` excludes planned slots from the set a flow must assert
  (`packages/cli/src/commands/verify.mjs:1513`).
- The integration checks exclude them too (`packages/cli/src/commands/integration.mjs:139`,
  `packages/cli/src/commands/verify.mjs:3164`).
- A `planned` **warning** keeps the backlog visible: "N island(s) declared but not built … their
  ownership is being enforced, their existence is not checked"
  (`packages/cli/src/commands/verify.mjs:2548`).

**The flag removes itself.** Once the island is registered, `planned: true` is an **error** — "drop the
flag; the checks that skip a planned island are exactly the ones it now needs"
(`packages/cli/src/commands/verify.mjs:2540`). A survey that quietly becomes a list of things nobody
built is worse than no survey (`packages/core/src/archipelago.ts:84`,
`.github/host-rules.md:282`).

---

## Fixtures

A fixture is one recorded or hand-written answer to a contract call, replayed by `MockTransport`
(`packages/runtime/src/mock.ts:157`). It is a **union**, not an optional `status`, so a fixture that
carries both a response and a status — a fixture whose author did not decide — fails at the point of
writing rather than being resolved at runtime (`packages/runtime/src/mock.ts:65`).

| Field | Meaning | Source |
|---|---|---|
| `service`, `method` | which contract call this answers | `packages/runtime/src/mock.ts:10` |
| `roles?` | role gate; a caller without one gets a 403 `MotuError` | `packages/runtime/src/mock.ts:13`, `packages/runtime/src/mock.ts:178` |
| `match?` | request-keyed arg matching (see below) | `packages/runtime/src/mock.ts:23` |
| `response` | a fixed value, **or** a `(args) => unknown` responder | `packages/runtime/src/mock.ts:34` |
| `status` (+ `message?`) | the failing form: thrown as a `MotuError` | `packages/runtime/src/mock.ts:58` |

### Request-keyed responses

`match` is an array matched against the call's arguments, with two conveniences: an `undefined` slot is
a **wildcard**, and a plain object is matched **structurally** (as a subset), so you pin only the fields
you care about — `[undefined, { login: 'brice' }]` matches any page with that login criterion
(`packages/runtime/src/mock.ts:15`, `packages/runtime/src/mock.ts:134`). Omit `match` entirely for the
request-agnostic fallback. Resolution order at call time: a matching request-keyed fixture wins,
otherwise the match-less fallback, otherwise a 404
(`packages/runtime/src/mock.ts:174`).

A **function** response derives the result from the args so reactive behaviour is verifiable offline —
type a filter and results actually narrow. It is an explicit client-side stub, not a claim of backend
fidelity; use a value or a `match` for recorded truth (`packages/runtime/src/mock.ts:3`,
`packages/runtime/src/mock.ts:29`).

A **declared failure** is an ordinary scenario, not an error test: it renders in the lagoon, gets a
snapshot baseline, is measured by `responsive` and `a11y`, and can be driven by a region flow. That is
the difference from `FailingTransport`, which fails *every* call with one status and is the right tool
for `error-resilient` ("does it survive?") and the wrong one for a scenario ("what does it show?")
(`packages/runtime/src/mock.ts:39`, `packages/runtime/src/mock.ts:198`).

### Recording

```
motu fixtures record <island> [--transport http|mock] [--out <path>]
```

It boots the focused lagoon, drives the island's declared `scenarios` through the archipelago boundary,
and records each contract call's request and response at the `call()` seam
(`packages/cli/src/commands/fixtures.mjs:1`, `packages/cli/src/commands/fixtures.mjs:61`).

- **Scenarios are required.** No `scenarios`, no recording — "add at least one `{ seed }` to record
  against" (`packages/cli/src/commands/fixtures.mjs:50`).
- `--transport http` records the **real** backend, which is the point of it; the default records the
  mock, a self-consistency check of the pipeline (`packages/cli/src/commands/fixtures.mjs:55`).
- Calls are deduped by `(service, method, stable(args))`
  (`packages/cli/src/commands/fixtures.mjs:80`).
- Host-fed store writes (channels + `provide`) are reduced to a last-wins `seed` export, **minus** the
  keys the scenarios themselves drove — those are inputs, not host config
  (`packages/cli/src/commands/fixtures.mjs:88`).
- Output lands at `<islands>/<kebab>/fixtures.recorded.ts` unless `--out` says otherwise, and every row
  is emitted with `match` set to the exact call args
  (`packages/cli/src/commands/fixtures.mjs:101`, `packages/cli/src/commands/fixtures.mjs:123`).
- A captured failure is written as a real `status:` row. It used to be emitted **commented out**,
  because `Fixture` could not express a failing call — recording a real 500 through `--transport http`
  produced something nobody could run (`packages/cli/src/commands/fixtures.mjs:126`).

Recorded fixtures are a **draft**: the command prints "Review, then merge into fixtures.mock.ts" — it
never rewrites your evidence (`packages/cli/src/commands/fixtures.mjs:108`).

See [11 — Contract and backend](11-contract-and-backend.md) for the transports themselves.

---

## Snapshots: evidence of a different kind

Scenarios and flows assert *values and text*. A picture asserts arrangement — the thing no declaration
covers. Baselines live beside the island's evidence, one per scenario × viewport, and are committed
(`packages/cli/src/lib/snapshots.mjs:9`). A region has no `scenarios`, so it is pictured in its
**flows' seeds**, deduped by seed — two flows starting from the same state are one picture, not two
(`packages/cli/src/commands/snapshot.mjs:265`). Full treatment, including `--remote` and `--accept`, is
in [08 — The lagoon](08-lagoon.md).

---

## What each check reads

Check ids, tiers and exit codes are owned by
[07 — Checks and verification](07-checks-and-verification.md). This table is the other half: which
evidence artefact each one consumes.

| Evidence artefact | Checks that read it | Where |
|---|---|---|
| island `scenarios` (≥ 2, opt-in) | `data-flow` | `packages/cli/src/commands/verify.mjs:832` |
| island `scenarios` — seed value types | `seed-transport` | `packages/cli/src/commands/verify.mjs:1254` |
| island `scenarios` — seeded prop *values* | `input-coverage` | `packages/cli/src/commands/verify.mjs:1296` |
| island `scenarios` — per scenario × viewport | `responsive` (`--audit`) | `packages/cli/src/commands/verify.mjs:1363` |
| island `scenarios` — axe per scenario | `a11y` (`--audit`) | `packages/cli/src/commands/verify.mjs:1221` |
| island `scenarios` — one shot each | `motu island snapshot` | `packages/cli/src/commands/snapshot.mjs:52` |
| island `scenarios` — drives the recorder | `motu fixtures record` | `packages/cli/src/commands/fixtures.mjs:49` |
| island `fixtures` | replayed by `MockTransport` under every lagoon mount (`lagoon-render`, `data-flow`, `responsive`, `a11y`, region flows) | `packages/cli/src/lib/scaffold.mjs:212`, `packages/runtime/src/mock.ts:157` |
| island `roles` | the lagoon's role selector; fixture `roles` gates | `packages/cli/src/lib/scaffold.mjs:214`, `packages/runtime/src/mock.ts:178` |
| region `scenarios` (flows) — run | `region-flow` | `packages/cli/src/commands/verify.mjs:1753` |
| region flows — mutated | `flow-mutation` | `packages/cli/src/commands/verify.mjs:1628` |
| region flows — `expectRender` slots | `render-coverage` | `packages/cli/src/commands/verify.mjs:1511` |
| region flows — `emit` slot+event pairs | `writes-covered` | `packages/cli/src/commands/verify.mjs:1571` |
| region flows — observed during the run | `provenance`, `sources-live`, `emitted-live`, `laundering` | `packages/cli/src/commands/verify.mjs:1795` |
| region flows — seeds, deduped | `motu archipelago snapshot` | `packages/cli/src/commands/snapshot.mjs:265` |
| region `capture = { universe, present }` | `catalogue` | `packages/cli/src/commands/verify.mjs:1424` |
| `planned: true` on an island entry | `planned`, `islands-registered`, `render-coverage` | `packages/cli/src/commands/verify.mjs:2532` |
| island + region evidence, bundled | `?scenario=` / `?flow=` addresses | `packages/cli/src/lib/scaffold.mjs:228` |

Two notes on the table.

`data-flow` is **opt-in**: fewer than two scenarios and it is silent
(`packages/cli/src/commands/verify.mjs:834`). Almost every runtime check above is gated behind
`--runtime` or `--audit`, because "has this island drifted from what it declares?" is static and
"does it still behave?" costs a browser per scenario × viewport
(`packages/cli/src/commands/verify.mjs:1115`).

`input-coverage` reads `sc.seed ?? sc.props` (`packages/cli/src/commands/verify.mjs:1300`) although
`Scenario` declares only `seed` (`packages/runtime/src/mock.ts:85`). Write `seed`.

---

## Writing a scenario that catches something

**Vary one key at a time, and say what that key makes exist.** `input-coverage` reads the *values*, not
the types, and reports two specific holes: a prop always given a non-empty array (the empty case is the
one components forget), and a boolean prop that only ever takes one value (the other branch is never
rendered) (`packages/cli/src/commands/verify.mjs:1281`).

**Know what per-prop coverage cannot see.** An unguarded array access reachable only with
`compactMode: true` *and* an empty list survived `input-coverage`, and rightly — each prop was well
covered on its own and the hole was the *crossing*. Checking every pair over eight inputs would report
more combinations than anyone would read, so the message says "cross it with the other inputs" and that
part stays a human's job (`packages/cli/src/commands/verify.mjs:1287`).

**Seed the state the page really establishes.** A flow that runs against a region missing a key the
page always seeds is testing a narrower region than the one that ships
(`acme/motu/src/archipelagos/actions/actions.evidence.ts:14`). Likewise, do not seed a state
the app cannot be in — "a flow that seeds an index past the end is testing a state the app cannot be
in" (`acme/motu/src/archipelagos/actions/actions.evidence.ts:52`).

**End on something you did not just write.** A key another island produces, or `expectRender` of an
island that is not the one being driven (`packages/cli/src/commands/verify.mjs:1640`).

**Invent the data.** The lagoon publishes as a shareable artifact, so real people do not belong in it,
screenshots included (`acme/motu/src/shared/directory-evidence.ts:74`).

### Failure modes host-rules records from real runs

- **Two agents extending one ternary chain in a frame.** Both islands correct, the merge wrong, every
  check green. Prefer an **append-only LOOKUP** over a ternary chain in a frame two people may extend —
  two people extending one chain cannot both be right, and the fallback silently claims the loser
  (`.github/host-rules.md:278`, `.github/host-rules.md:335`). The check that would have caught the
  outcome is `render-coverage`, and it is a *warning* on purpose: the rule is new, and turning every
  pre-existing region red teaches people to ignore the report rather than fix it
  (`packages/cli/src/commands/verify.mjs:1507`). `writes-covered` is a warning for the same reason
  (`packages/cli/src/commands/verify.mjs:1552`).
- **A driven coupling is not an exercised one.** Silencing a component's `onProgress` in a real region
  changed nothing at any tier, even though a flow drove `week-progress` — because both `wiring-live`
  and a flow's `emit` go through the lagoon's emit seam, not through the component. `writes-covered`
  answers the narrower question ("is this coupling exercised at all?") and does not claim the other
  (`packages/cli/src/commands/verify.mjs:1543`).
- **Providers, layout and seed are three different things.** What an island cannot render without is
  `providers` in the lagoon overrides; the arrangement is `layout`; the row or props are `seed` data.
  Getting this wrong is invisible in the region view and fatal in the mountpoints view — which is the
  one the flow checks drive — so it reads as "the region rendered nothing" rather than "no providers".
  Providers must also be idempotent, since the frame and each island both install them
  (`.github/host-rules.md:174`).
- **Do not symlink `node_modules` into a git worktree.** `git add -A` commits the symlink, the merge
  replaces the real directory with it, and the next build dies on `ELOOP`
  (`.github/host-rules.md:280`).

---

## Related pages

[01 — Concepts](01-concepts.md) ·
[03 — CLI reference](03-cli-reference.md) ·
[05 — Archipelagos and regions](05-archipelagos-and-regions.md) ·
[07 — Checks and verification](07-checks-and-verification.md) ·
[08 — The lagoon](08-lagoon.md) ·
[09 — Coverage](09-coverage.md) ·
[11 — Contract and backend](11-contract-and-backend.md) ·
[13 — Agents and skills](13-agents-and-skills.md)
