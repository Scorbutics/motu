# Getting started

This page answers one question: from nothing, what is the shortest path to a lagoon that boots, a
first island rendered in it, and a green `motu check`? It is a walkthrough, not a reference — every
command has more flags than are shown here ([CLI reference](03-cli-reference.md)) and
`motu.config.json` has more keys ([Configuration](04-configuration.md)). Read
[Concepts](01-concepts.md) first; the words below assume it.

---

## 0. Get the CLI

motu is not published to npm. `install.sh` from a checkout links the CLI onto your PATH:

```sh
./install.sh                 # link `motu` (+ `motu-host`), then install the skills into the CWD repo
./install.sh ~/dev/ocean     # ...install the skills into that repo instead
./install.sh --no-skills     # CLI only
./install.sh --no-path       # skills only
```

It installs the checkout's own dependencies if missing, links `packages/cli/src/cli.mjs` as `motu`
into `$MOTU_BIN_DIR` (default `~/.local/bin`), adds one guarded block to your shell rc, and runs
`motu skills install` (`install.sh:1-20`). POSIX sh, idempotent, safe to re-run after `git pull`.

Keep the checkout. The whole framework is resolved out of it — see
[the no-install mechanism](#the-no-install-mechanism) below.

---

## 1. `motu init`

```sh
motu init                          # in the project you want to adopt motu into
motu init . --host next            # a Next.js app
motu init . --host angularjs       # the reference ocean
motu init . --host none            # plain React
```

`--host` picks the stack the islands embed INTO, which decides what the lagoon has to speak
(`packages/cli/src/commands/init.mjs:12-17`): `angularjs` (legacy fit gates apply, AngularJS adapter),
`next` (the lagoon inherits the host's `@/…` alias and Tailwind, stubs `next/*`), `none` (nothing
host-specific). `vite` is also accepted (`init.mjs:121`) even though the usage line lists only three —
see the note at the end of this page.

Init refuses to overwrite an existing `motu.config.json` without `--force` (`init.mjs:152`).

### What it scaffolds

| Path | What it is | Source |
|---|---|---|
| `motu.config.json` | The layout declaration the rest of the CLI reads: `app`, `host`, `hostRoot`, `islands`, `ui`, `archipelagos`, `shared`, `contract`, `lagoon`, `appPackage`, `tagPrefix: 'x-'`, `isolation` (+ `bridge` for `angularjs`) | `init.mjs:175-198` |
| `package.json` (app root) | Names the app package, exports `src/index.ts` and `./styles.css` | `init.mjs:239` |
| `src/islands/registry.ts` | `ELEMENT_REGISTRY` — generated from disk, never hand-edited | `init.mjs:245` |
| `src/archipelagos/registry.ts` | `ARCHIPELAGOS` + `getArchipelago(id)` | `init.mjs:246` |
| `src/index.ts` | The barrel a composition root imports from | `init.mjs:247` |
| `src/shared/styles.css` | The one island stylesheet, dual-mode (`:where(:host, .motu-root)`) | `init.mjs:248` |
| `src/ui/.gitkeep` | Where mode-agnostic components go | `init.mjs:249` |
| `.gitignore` | `node_modules/`, `dist/`, `.motu/` | `init.mjs:250` |
| `roots/lagoon/lagoon.config.json` | What the lagoon IS: target, mount mode, chrome, env, viewports | `init.mjs:320` |
| `roots/lagoon/src/lagoon.tsx` | The lagoon OVERRIDES stub (layout, seed, channels — not an entry) | `init.mjs:321` |
| `roots/lagoon/src/next-stubs.tsx`, `src/env.ts` | `--host next` only | `init.mjs:323-324` |
| `roots/lagoon/tailwind.config.ts` | `--host next`, and only when the host actually has a Tailwind config — a Next host is not a Tailwind host | `init.mjs:322-330` |
| `CLAUDE.md` / `AGENTS.md` / `.github/copilot-instructions.md` | The motu rules block, written between `<!-- motu:rules -->` markers into whichever of those files the repo already has (CLAUDE.md if none) | `init.mjs:341`, `packages/cli/src/lib/host-rules.mjs:23-53` |

Scaffolding is non-destructive per file: anything that already exists is reported as `(kept)`
(`init.mjs:132-141`).

**What it deliberately does NOT write:** `index.html`, the lagoon entries, and `src/fixtures.ts`.
Those are rendered into `.motu/cache` by `motu lagoon dev|build` instead. The reason is a name
collision the old layout could not survive — the focus entry wanted `src/lagoon.tsx` and so do the
overrides, and writing `index.html` makes the project "own" its lagoon, which turns materialization
off, so the scaffold produced a lagoon that served the overrides file as its entry and rendered an
empty div (`init.mjs:300-319`). Run `motu lagoon eject` when you want those files on disk for real.

Flags beyond `--host` exist and are not in the usage text: `--force`, `--app <rel>`,
`--hostRoot <rel>`, `--appPackage <name>`, `--isolation <shadow|light>`, `--motuDep <spec>`,
`--no-lagoon`, `--json` (`init.mjs:145-334`). Defaults worth knowing: `isolation` is `shadow` for
`angularjs` and `light` everywhere else, because islands mount directly in a React host and a shadow
root would cut them off from the host's own stylesheet, Tailwind included (`init.mjs:167-169`).

There is no `motuRoot` in the generated config, and no way to put one there. It used to be written as
"the only machine-specific path in the project" — a committed relative path to somebody's checkout,
which is exactly what breaks on the second machine and in CI. The CLI derives it from the binary that
is running (`init.mjs:189-196`, `packages/cli/src/lib/config.mjs:112-133`), and `$MOTU_ROOT` is the only
override. The key was removed entirely; a config that still carries it gets a deprecation warning. See
[Configuration](04-configuration.md).

Init ends by printing your next two commands:
`motu archipelago create <id>` then `motu island create <name>` (`init.mjs:351`).

---

## The no-install mechanism

This is the part that surprises people, so it is worth reading before anything fails.

The `@motu/*` packages are unpublished workspace packages whose entry point is **raw TypeScript**. A
project cannot simply `npm install` them. Three mechanisms cover the three places a module specifier
has to resolve:

| Where | How `@motu/react` resolves | Source |
|---|---|---|
| The lagoon (Vite) | Vite `resolve.alias`, longest specifier first, pointing straight at `<checkout>/packages/react/src/index.ts` | `init.mjs:66-103` |
| The node harness (`--fast`, evidence loaders) | The same alias list, serialised to JSON for the node loader — plus a React dedupe so the framework and the project resolve ONE React | `packages/cli/src/lib/node-aliases.mjs:31-72` |
| The host application's own bundler | A **symlink** at `node_modules/@motu/<name>` → `<checkout>/packages/<name>` | `packages/cli/src/lib/util.mjs:431-454` |

The symlinks are re-created **on every single `motu` invocation, before argv is even parsed**
(`packages/cli/src/run.mjs:181-193`). That is not paranoia:

> `npm install` deletes them as extraneous — measured on an Angular app, where the next build failed
> with `Cannot find module '@motu/react'`, an error pointing nowhere near the cause. (bun and pnpm
> left them alone, so this is invisible on the machines motu grew up on.)
> — `packages/cli/src/run.mjs:183-186`

The linked set is `core`, `react`, `runtime`, `types`, `debug-overlay`, `chrome`, `coverage`
(`util.mjs:438`). `chrome` is in there even though a host never imports it by name, because
`@motu/core`'s toolbar does.

Consequences to plan around:

- **Deleting the motu checkout breaks the host build.** The symlinks dangle and the aliases point at
  nothing. Re-clone and run any `motu` command to relink.
- **Moving the checkout is fine** as long as you re-run `motu` from the new one: the framework root is
  derived from the running CLI, with `$MOTU_ROOT` the only override
  (`packages/cli/src/lib/config.mjs:308`).
- **`@motu/*` are not in the generated `package.json`** unless a workspace above the project can
  actually satisfy them. `workspace:*` in a standalone project is a lie that made `bun install` — and
  therefore `bun add react` — fail outright in a freshly initialised project (`init.mjs:202-232`).
- **The lagoon has no React of its own**, on purpose: it resolves upward to the host application's
  copy, and a second React would give the host two of them and break hooks the moment an island
  renders a component from the host's own library (`packages/cli/src/lib/scaffold.mjs:107-113`).

The one motu module your application code may import is `@motu/types` — types only, so it erases at
compile time and the app ships byte-identical output without motu (`packages/types/src/index.ts:1-17`).

---

## 2. Declare the region

```sh
motu archipelago create signin
```

Writes `<archipelagos>/signin/signin.archipelago.ts` with `id` and an empty `islands: []`, registers
it in `archipelagos/registry.ts`, and re-exports it from the barrel
(`packages/cli/src/commands/archipelago.mjs:1-7`). The scaffold leaves `root`, `slots` and `hostSlots`
commented out with the reason attached:

> DECLARE THE ROOT FIRST. An archipelago is the scope of one root component… Naming it here is what
> leaves ONE description of how this region composes… Skip it and the two sides each compose the
> region their own way, with nothing comparing them — which is a drift that ships green.
> — `packages/cli/src/commands/archipelago.mjs:33-40`

Point `root` at the application's own layout component and map its props to slots. `host-app`'s
sign-in region is the worked example: `root: SigninLayout`, `slots: { form: { slot: 'signin-form' } }`
(`host-app/motu/src/archipelagos/signin/signin.archipelago.ts`).

**If this page has no islands yet at all**, `motu archipelago init <id> --page <file>` does the whole first
mile instead — the archipelago, the app-side region type, a composition root, the lagoon module and
the overrides entries — deriving the transport and host bridge from a composition root the project
already wrote, so environment decisions are not answered differently by accident
(`packages/cli/src/commands/archipelago-init.mjs:1-14`). See
[Archipelagos and regions](05-archipelagos-and-regions.md).

---

## 3. `motu island create`

Two shapes, and the choice matters:

```sh
motu island create week-actions                        # scaffold a new component under ui/
motu island create github-sign-in --from @/components/auth/github-sign-in
motu island create fields-widget --from @/x/widget --export FieldsWidget
```

| | Writes | Use when |
|---|---|---|
| plain | `src/ui/<kebab>/<Pascal>.tsx` **and** `src/islands/<kebab>.island.ts` | The original is not React and a component has to be authored (the extraction case) |
| `--from <specifier>` | only `src/islands/<kebab>.island.ts` | The application already owns the component — copying it would fork it (the React-host case) |

Then it regenerates `islands/registry.ts` and `islands/contracts.generated.ts` from what is on disk
(`packages/cli/src/commands/create.mjs:215-229`). The registry is generated, not edited: adding an
island is a file operation, and reconciling is what keeps a deleted or renamed one from lingering.

With `--from`, the contract is **read from the component** — inputs, outputs and ambient reach are
transcribed automatically, because transcribing them by hand is how an island's contract drifts from
its component on its first day (`create.mjs:61-63`, `:218`). What is left for you is the part that is
a decision: the event NAMES, renamed to the region's vocabulary if it has a better word.

`--from` must be the specifier the app itself uses — an alias like `@/components/foo`, or a path
relative to `src/islands/` (`create.mjs:193-208`). `--export <name>` names the component inside that
module when it is not the island's Pascal name. `--force` overwrites a scaffolded component.

**No evidence file is scaffolded**, and that is deliberate:

> A `fixtures.mock.ts` full of `TODO(motu:fixtures)` is worse than no file: it looks like coverage,
> invites a hand-written response shape, and rots — six of them sat empty in the reference adopter for
> months. — `create.mjs:6-10`

Evidence appears when `motu fixtures record` produces it, or when you write a scenario because you
need one. It goes in `<kebab>.evidence.ts` beside the island.

Make the island a member of the region:

```sh
motu island integrate github-sign-in --archipelago signin --slot signin-form
```

`--archipelago` is required; `--slot` defaults to the island's kebab name
(`packages/cli/src/run.mjs:168-170`).

---

## 4. `motu lagoon dev` — the iteration loop

```sh
motu lagoon dev                          # the gallery: every archipelago, with a switcher
motu lagoon dev week-actions             # focused on one island — open /lagoon.html
motu lagoon dev --archipelago signin     # focused on one region
motu lagoon dev --port 5180
```

Vite with HMR, materialising the entries into `.motu/cache` first. It prints the lagoon directory and
the host, tells you to open `/lagoon.html` when a target is focused, and then Vite's own URLs
(`packages/cli/src/commands/lagoon.mjs:648-670`). `--fit <native|legacy>` and `--allow-any-host` are
also read there.

This is where the loop closes, and the ordering is the whole point:

1. **Build** the island as a plain, mode-agnostic component that calls the generated contract and
   emits events — nothing else.
2. **Verify in the lagoon**: `MockTransport` fixtures, no session, no legacy CSS, no digest cycle.
3. **Integrate**: declare the island, add it to an archipelago, place it on the page.

> Verify in the lagoon first and a failure has one cause: the component is wrong. Drop an unverified
> component straight into the ocean and a failure is ambiguous between "my component is wrong" and
> "the host did something".

Every declared state is an address rather than something you hand-drive the store into. `motu lagoon
states` prints them; the query parameters are `target`, `scenario`, `region`, `flow`, `step`
(`packages/react/src/lagoon-states.ts:111-139`):

```
/?target=island:x-week-actions&scenario=a%20week%20to%20answer
/?region=signin&flow=asking%20to%20sign%20in%20says%20so&step=1
```

A name that resolves to nothing REFUSES to render — it never falls back to the default state
(`packages/cli/src/run.mjs:124`). See [The lagoon](08-lagoon.md).

For a link someone else can open without your process staying alive, use `motu lagoon serve` (builds
and serves, default port 8817, `--watch`, `--host`) or `motu lagoon publish --remote`. Both are
covered in [The lagoon](08-lagoon.md).

---

## 5. The first `motu check`

```sh
motu check
```

One gate, one verdict, static by default and meant to run on every change. It is deliberately scoped
to what motu owns — it does not run your typecheck or your linter, because a framework that shells
out to them has taken an opinion about a build it knows nothing about
(`packages/cli/src/commands/check.mjs:1-13`). Compose them yourself:

```sh
<host build> && motu check
```

The run prints its verdict in sections (`check.mjs:159-244`):

| Section | Asks |
|---|---|
| `contracts` | Is `contracts.generated.ts` what the components say it should be? Plus an audit of `noUncheckedIndexedAccess` on the host's tsconfig — reported, never enforced |
| `region-generated` | Is `coverage.generated.ts` what `motu.config.json` says? It exists for a side effect, so a stale one still compiles and just configures the wrong thing |
| `islands` | Every island's static rules |
| `regions` | Every archipelago's static rules |
| `integration` | The last mile: does the HOST compose, place and read the region? Everything above can be green while the application composes none of it |
| `removal` | Delete every motu file, unwrap every tag — does the app still typecheck? Run only when the structure checks held (`check.mjs:129-135`) |

Exit `0` on PASS, `1` on FAIL. A `--changed` run that examined nothing exits `2` with
`NOTHING TO CHECK`, because a check that examined nothing has not passed (`check.mjs:105-114`).

`--runtime` adds the browser lane (mount, data-flow, viewports, axe, live wiring) and belongs in CI or
before handing work over, not in a tight loop. `--json` gives the machine-readable verdict. The full
tier table, every check id, and the three exit codes are in
[Checks and verification](07-checks-and-verification.md).

Two things `motu check` cannot see, so plan for them:

- **The page reaching the slot.** `integrate check` reads source: it sees `<X.Island slot="y">` and
  cannot see whether the branch containing it ever runs.
- **Invention.** Every mechanical check compares the artifact to itself. A fixture that invents a
  vocabulary the application does not use passes all of them. That is why a run with `new` snapshots
  reports `LOOK` rather than `PASS` — open the state and read it, with a fresh reader
  (`README.md`).

---

## The shape you end up with

```
motu.config.json
src/
  islands/
    <kebab>.island.ts        the island: tag → component + its declared contract
    <kebab>.evidence.ts      scenarios + fixtures, when there are real ones
    registry.ts              GENERATED — ELEMENT_REGISTRY + ElementTypes
    contracts.generated.ts   GENERATED — read from the components
  ui/<kebab>/<Pascal>.tsx    the plain component (the mainland) — absent when --from
  archipelagos/
    <id>/<id>.archipelago.ts the region: root, slots, islands, sources
    <id>/<id>.evidence.ts    the region's flows
    registry.ts              GENERATED
  shared/styles.css          the one island stylesheet
  index.ts                   the barrel
roots/lagoon/
  lagoon.config.json         what the lagoon IS
  src/lagoon.tsx             the overrides map (layout, seed, channels)
```

Generated files are never hand-edited; `motu island sync` and `motu archipelago sync` regenerate them
from disk, and a stale one is a `motu check` failure
(`packages/cli/src/commands/defaults.mjs:138-144`).

---

## Where to go next

| | |
|---|---|
| Every command and flag | [CLI reference](03-cli-reference.md) |
| `motu.config.json` and `lagoon.config.json`, key by key | [Configuration](04-configuration.md) |
| Declaring a region properly: `root`, `slots`, `sources`, ownership | [Archipelagos and regions](05-archipelagos-and-regions.md) |
| Adopting into a codebase that already exists | [Composition and adoption](06-composition-and-adoption.md) |
| Check ids, tiers, exit codes | [Checks and verification](07-checks-and-verification.md) |
| Writing scenarios and flows | [Evidence and testing](10-evidence-and-testing.md) |
| Fixtures, transports, codegen | [Contract and backend](11-contract-and-backend.md) |
| Next / AngularJS specifics, `removal-check` | [Hosts and adapters](12-hosts-and-adapters.md) |

---

### One inconsistency to know about

The usage text advertises `motu init [dir] --host next|angularjs|none`
(`packages/cli/src/run.mjs:53`), but the command also accepts `vite`
(`packages/cli/src/commands/init.mjs:121`). The comment above that line records why: the Vite adapter
exists, `hostContribution` resolves it and `loadMotuConfig` accepts it, but the one command that
starts a project used to reject it, so the only way onto a Vite host was to hand-write
`motu.config.json`. The code is authoritative — `vite` works.
