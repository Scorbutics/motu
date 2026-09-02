# CLI reference

Every `motu` verb, the flags its implementation actually parses, what it reads, what it writes, and
what it exits with. The authoritative surface is the `USAGE` constant (`packages/cli/src/run.mjs:50`)
plus the verb dispatch below it, but this page documents the **implementation** — where `--help` is
incomplete or stale, the implementation wins and the discrepancy is called out inline.

Related pages: [concepts](01-concepts.md) · [getting started](02-getting-started.md) ·
[configuration](04-configuration.md) · [archipelagos and regions](05-archipelagos-and-regions.md) ·
[composition and adoption](06-composition-and-adoption.md) ·
[checks and verification](07-checks-and-verification.md) · [lagoon](08-lagoon.md) ·
[coverage](09-coverage.md) · [evidence and testing](10-evidence-and-testing.md) ·
[contract and backend](11-contract-and-backend.md) · [hosts and adapters](12-hosts-and-adapters.md) ·
[agents and skills](13-agents-and-skills.md).

---

## Invocation

The binary is `packages/cli/src/cli.mjs`, exposed as `motu` (`packages/cli/package.json:5-7`), and
installed onto `PATH` by `install.sh`. `cli.mjs` is a preflight, not the CLI: it checks that
`ts-morph` and `tsx` resolve (`packages/cli/src/cli.mjs:21-46`) and that the framework packages have
been built (`packages/cli/src/cli.mjs:53-63`), exiting **2** with an instruction if either is missing,
then imports `run.mjs`.

Before dispatch, every run restores the no-install `node_modules/@motu/*` symlinks
(`packages/cli/src/run.mjs:190-194`); failure there is swallowed, because a non-motu directory is a
legitimate place to run `motu skills install`.

There is no `--version`. `motu`, `motu --help`, `motu -h` and `motu help` all print `USAGE`; a bare
`motu` exits **1**, an explicit help verb exits **0** (`packages/cli/src/run.mjs:198-201`). An unknown
verb or sub-verb prints `USAGE` and exits **2**.

### Argument parsing

One shared parser (`packages/cli/src/run.mjs:33-48`), and its rules explain several sharp edges:

| Form | Result |
| --- | --- |
| `--flag` (nothing after, or another `--flag` after) | `argv.flag === true` |
| `--key value` | `argv.key === 'value'` |
| `--no-key` | `argv.key === false` |
| anything not starting with `--` | appended to `argv._` |

Consequences worth knowing: a single-dash form (`-a`) is **not** a flag — it lands in the positionals;
a repeated flag silently overwrites the earlier one, so a command wanting several values takes a
comma-separated list in ONE flag instead; and a flag whose
value looks like a flag (`--title --foo`) becomes `true`.

Single-word verbs (`check`, `removal-check`, `codegen`) and the sub-verbs that take a leading
positional (`init`, `skills install`, `archipelago snapshot`, `archipelago adopt-root`)
re-parse with the argument list shifted, so their positional lands in `argv._[0]`
(`packages/cli/src/run.mjs:205`, `:243`, `:246`, `:265`, `:274`, `:287`, `:289`, `:299`).

---

## How the CLI locates a project

`loadMotuConfig()` (`packages/cli/src/lib/config.mjs:176`) walks **up** from a start directory looking
for the first `motu.config.json`, or a `package.json` carrying a `motu` key
(`packages/cli/src/lib/config.mjs:147-171`). That file's directory is the **project root**. A malformed
`motu.config.json` throws with its path; an unreadable `package.json` is skipped and the walk
continues.

The start directory is `$MOTU_PROJECT_ROOT` when set, otherwise `process.cwd()`
(`packages/cli/src/lib/config.mjs:178`). That variable exists because the runtime harness is spawned
with its cwd inside the CLI package — it has to be, or `--import tsx` does not resolve — so without it
a `--runtime` verify in someone else's project walked up into motu's own config
(`packages/cli/src/lib/config.mjs:139-146`). The CLI sets it on every child it spawns
(`packages/cli/src/commands/verify.mjs:746`, `:764`, `:820`, `:1447`).

If no config is found anywhere above the cwd, the cwd itself becomes the root and every path falls back
to the reference layout (`packages/cli/src/lib/config.mjs:23-109`, `:179`). See
[configuration](04-configuration.md) for the key-by-key meaning of the file.

Where the **framework checkout** lives is derived from the running binary — `packages/cli/src/lib` up
four levels, verified by the presence of `packages/core/src/index.ts`
(`packages/cli/src/lib/config.mjs:131-133`). `$MOTU_ROOT` is the only override
(`packages/cli/src/lib/config.mjs:308`). There is no `motuRoot` config key — it was removed, because a
machine-specific path the CLI already knows has no business in a committed file.

### Environment variables

Read by the CLI itself:

| Variable | Read at | Meaning |
| --- | --- | --- |
| `MOTU_PROJECT_ROOT` | `lib/config.mjs:178` | Where to start the walk for `motu.config.json`. Set by the CLI on its own child processes. |
| `MOTU_ROOT` | `lib/config.mjs:308` | The framework checkout, overriding the derived one. Never written into a generated config — it stays in the environment. |
| `MOTU_HOST_URL` | `commands/lagoon.mjs:184`, `:198`, `:518`; `commands/region-coverage.mjs:377`, `:413`; `lib/baselines.mjs:21` | Default lagoon host for `publish --remote`, snapshot baselines, coverage accept/forget, and live-gallery registration. |
| `MOTU_HOST_TOKEN` | `commands/lagoon.mjs:255`, `:519`; `commands/region-coverage.mjs:378`, `:414`; `lib/baselines.mjs:22` | Bearer token for the same host. |
| `MOTU_COVERAGE_TOKEN` | `commands/region-coverage.mjs:239` | Token for fetching a coverage corpus over HTTP. Deliberately not a config key — config is baked into the generated registry the lagoon publishes. |
| `MOTU_CONFIG_HOME` | `lib/remote.mjs:24` | Directory holding `host.json` (default `~/.config/motu`). |

Precedence for the host is the same everywhere it is resolved: `--remote`/`--token` flag →
environment → `~/.config/motu/host.json` (`packages/cli/src/lib/baselines.mjs:19-25`).

Set by the CLI for its own build/harness children, not user-facing input: `MOTU_SINGLEFILE`,
`MOTU_TRANSPORT`, `MOTU_TARGET`, `MOTU_FIT`, `MOTU_NO_SSL` (`commands/lagoon.mjs:77-86`),
`MOTU_ALLOW_ANY_HOST` (`commands/lagoon.mjs:661`), `MOTU_NODE_ALIASES` (`commands/verify.mjs:764`),
`MOTU_CATALOGUE_DECLARED` (`commands/verify.mjs:1447`). Two are read from your environment by the
Vite runners as an escape hatch: `MOTU_VITE_LOGLEVEL` (`src/lagoon-build.mjs:24`,
`src/lagoon-dev.mjs:28`) and `MOTU_DEBUG` (`lib/scaffold.mjs:479`).

### Exit codes

`0` the declarations hold · `1` something contradicted them · `2` a check could not run, or the
command was misused. Full semantics — including why the third code exists and how an environmental
cause is classified — are in [checks and verification](07-checks-and-verification.md).

### Which commands mutate the working tree

| Writes files | Read-only |
| --- | --- |
| `init`, `island create`, `island sync`, `island integrate`, `island snapshot --update`, `archipelago init`, `archipelago create`, `archipelago sync`, `archipelago adopt-root`, `archipelago record-frame`, `fixtures record`, `lagoon eject`, `lagoon publish`, `codegen`, `skills install` | `check`, `island verify`, `island defaults`, `archipelago verify`, `integrate check`, `lagoon dev`, `lagoon serve`, `lagoon states`, `archipelago coverage` (unless `--save`), `skills list` |

Two that need a footnote. `removal-check` **temporarily** deletes and rewrites host files, then always
restores them from a backup in a `finally` block (`packages/cli/src/commands/removal-check.mjs:512-526`);
it cannot leave a repo half-stripped, including when the typecheck throws. `island snapshot` /
`archipelago snapshot` write `.actual.png` / `.diff.png` on a difference even without `--update`
(`packages/cli/src/commands/snapshot.mjs:96`, `lib/baselines.mjs:84-91`).

---

## `motu init`

Scaffold `motu.config.json`, the semantic roots, the registries, the barrel and a working lagoon root.

```console
motu init [dir] [--host angularjs|next|vite|none] [--app <rel>] [--hostRoot <rel>]
          [--appPackage <name>] [--isolation shadow|light] [--motuDep <spec>]
          [--no-lagoon] [--force] [--json]
```

| Flag | Meaning | Default |
| --- | --- | --- |
| `[dir]` positional | Project root to create | `.` (`commands/init.mjs:144`) |
| `--host` | Stack the islands embed into. Accepted: `angularjs`, `next`, `none`, `vite` (`commands/init.mjs:121`) | `none` (`:145`) |
| `--app` | App sub-package holding islands/ui/archipelagos, relative to the root | `.` (`:159`) |
| `--hostRoot` | Where the host application lives (whose aliases and Tailwind a `next` lagoon borrows) | the `--app` value (`:160`) |
| `--appPackage` | npm package name whose barrel exports `ELEMENT_REGISTRY` | the app dir's basename, or `motu-app` (`:165`) |
| `--isolation` | `shadow` or `light` island mounting | `shadow` for `angularjs`, else `light` (`:169`) |
| `--motuDep` | Version specifier written for `@motu/*` dependencies | `workspace:*` (`:202`) |
| `--no-lagoon` | Skip the lagoon root entirely | off (`:253`) |
| `--force` | Overwrite an existing `motu.config.json` | off (`:152`) |
| `--json` | Machine-readable `{ root, host, appPackage, created, skipped }` | off (`:334`) |

> `USAGE` (`run.mjs:53`) advertises only `--host next|angularjs|none`. The implementation also accepts
> `vite`, and every other flag in this table is undocumented in `--help`.

**Reads** — an existing `motu.config.json` (to refuse), the host's `tsconfig.json`/Tailwind config and
`globals.css` when `--host next` (`commands/init.mjs:106-115`, `:329`), and whether any ancestor is a
pnpm/npm workspace, which decides whether `@motu/*` dependencies are declared at all
(`commands/init.mjs:211-229`).

**Writes** — `motu.config.json`; `<app>/package.json`, `src/islands/registry.ts`,
`src/archipelagos/registry.ts`, `src/index.ts`, `src/shared/styles.css`, `src/ui/.gitkeep`,
`.gitignore` (`commands/init.mjs:239-250`); and under the lagoon root `lagoon.config.json` and
`src/lagoon.tsx`, plus `src/next-stubs.tsx`, `src/env.ts` and `tailwind.config.ts` for a Next host
(`:321-331`). Entries, `index.html` and the Vite config are **not** scaffolded — they are rendered into
`.motu/cache` by `lagoon dev|build`, or onto disk by `lagoon eject` (`:300-319`). Existing files are
kept, never overwritten, and reported as `(kept)`.

It also writes the shipped host-rules block into `CLAUDE.md`, `AGENTS.md` and
`.github/copilot-instructions.md` — whichever already exist, else `CLAUDE.md` — rewriting in place
between markers (`commands/init.mjs:340`, `lib/host-rules.mjs:24`, `:38-53`). It runs **before** the
`--json` early return, and the paths written come back under `rules` in the JSON. That ordering is
deliberate: it used to sit after the return, so `motu init --json` — the invocation a script or a CI
image uses, and the one place nobody reads the output — scaffolded the project and silently skipped
the agent rules.

**Exit** — `2` on an unknown `--host`; `1` when `motu.config.json` exists without `--force`; `0`
otherwise.

```console
motu init . --host next --hostRoot ../web --appPackage acme-islands
```

---

## `motu island`

### `motu island create <name>`

Scaffold an island: the mount point, optionally a component, then regenerate the derived registry and
contracts.

```console
motu island create <name> [--from <specifier>] [--export <name>] [--force]
```

| Flag | Meaning | Default |
| --- | --- | --- |
| `<name>` positional | Island name in any casing; kebab/Pascal/tag are derived | required (`commands/create.mjs:174`) |
| `--from` | Wrap a component the app already owns instead of scaffolding one under `ui/`. Must resolve from the islands directory (`:203`) | none (`:183`) |
| `--export` | The component's export name inside that module, when it is not the island's Pascal name | Pascal name (`:185`) |
| `--force` | Overwrite an existing scaffolded component | off (`:189`) |

**Reads** — with `--from`, the target component's own source, to derive `input`, `output` and `effects`
rather than asking for them again (`commands/create.mjs:218`, `lib/component-props.mjs`). Also
`@motu/contract`, for the comment listing mockable methods (`:139-153`).

**Writes** — `ui/<kebab>/<Pascal>.tsx` (only without `--from`), `islands/<kebab>.island.ts`, and
regenerates `islands/registry.ts` and `islands/contracts.generated.ts` (`:215-229`). It deliberately
does **not** scaffold an evidence file (`:6-9`) — see [evidence and testing](10-evidence-and-testing.md).

**Exit** — `2` with no name; `1` when the component exists without `--force`, or when `--from` does not
resolve; `0` otherwise.

```console
motu island create week-actions --from @/components/week/WeekActions --export WeekActionsPanel
```

### `motu island verify <name|--all>`

The island rules, as pass/fail. Static by default; `--runtime` adds the browser.

```console
motu island verify <name|--all> [--runtime] [--audit] [--fast] [--standalone] [--verbose] [--json]
```

| Flag | Meaning | Default |
| --- | --- | --- |
| `<name>` positional | One island (any casing) | — |
| `--all` | Every island in the project, sequentially (one lagoon port each) | off (`commands/verify.mjs:1054`) |
| `--runtime` | Add the lagoon checks: mount, error resilience, seed transport, data-flow | off (`:1121`) |
| `--audit` | Implies `--runtime` and adds `responsive` + `a11y`; without it a `skip` line says they were not run | off (`:1149-1153`) |
| `--fast` | In-process happy-dom mount instead of Playwright. Skips the browser-only checks | off (`:1131`) |
| `--standalone` | The island is intentionally in no archipelago (suppresses the membership warning) | off (`:1102`) |
| `--verbose` | Name each runtime step as it runs, with what it cost | off (`:1076`, `:44-58`) |
| `--json` | Machine-readable findings | off (`:1058`, `:1067`) |

> `USAGE` documents `--all --runtime --verbose --fast --standalone --json` (`run.mjs:108-115`) but not
> `--audit`, which the implementation reads here and in `motu check`. The command's own usage string
> (`commands/verify.mjs:1046`) advertises `[--no-runtime]`, which is a no-op: runtime is opt-in, so
> negating it changes nothing.

**Reads** — the island's mount point and component, `contracts.generated.ts`, the islands registry, the
archipelagos, the island's `<kebab>.evidence.ts`, `lagoon.config.json` (viewports, a11y policy), and any
adapter that ships a verify contribution (`commands/verify.mjs:1024-1044`). **Writes** nothing.

**Exit** — a single island: `0` pass, `1` an error finding, `2` when any finding is `inconclusive`
(`commands/verify.mjs:1173-1176`). A `--all` sweep carries its **worst member's** verdict via
`sweepExitCode` (`:1063`, `:1189`) — so an inconclusive run exits `2` there too. It used to gate on
`errors.length` alone, which made a sweep with no Chromium exit `0`. The check inventory
lives in [checks and verification](07-checks-and-verification.md).

```console
motu island verify week-actions --runtime --verbose
```

### `motu island snapshot <name|--all>`

Visual baselines, one per scenario × viewport.

```console
motu island snapshot <name|--all> [--update] [--remote [url]] [--token <secret>]
                     [--accept [name]] [--changed [base]] [--json]
```

| Flag | Meaning | Default |
| --- | --- | --- |
| `<name>` positional | One island | — |
| `--all` | Every island (`commands/snapshot.mjs:182`) | off |
| `--update` | Record baselines as files instead of checking them | off (`:89`) |
| `--remote [url]` | Compare against the host's accepted baseline; nothing is written to git | off (`:142`) |
| `--token` | Host token, overriding `MOTU_HOST_TOKEN` and `host.json` (`lib/baselines.mjs:22`) | — |
| `--accept [name]` | Move the accepted pointer to what was last rendered. Its own act, not a flag on a check (`:151-171`) | off |
| `--changed [base]` | Only islands this branch touched; widens back to everything, loudly, when a file maps to none. Honoured only with `--all` (`:120-128`, `:182`) | off |
| `--json` | Machine-readable report | off (`:195`) |

> `--token` is undocumented in `USAGE`, which carries two overlapping snapshot blocks: a short, older
> one (`run.mjs:91-95`) and the accurate one (`run.mjs:150-159`).

**Reads** — the island's scenarios, via two loaders cross-checked against each other because a plain
node import cannot resolve a `.js` specifier pointing at a `.ts` sibling (`commands/snapshot.mjs:29-47`);
the declared viewports; and, with `--remote`, the host's accepted shots.

**Writes** — baselines in `<islands>/<kebab>.snapshots/<scenario>@<viewport>.png`
(`lib/snapshots.mjs:16-27`) under `--update`; failure artifacts beside them, or under
`.motu/snapshots/<island>/` in remote mode (`lib/baselines.mjs:84-91`).

**Exit** — `1` if any shot changed or an island errored; `2` on missing arguments, on `--update` with
`--remote` (they contradict: one writes files, the other stores on the host, `:177-180`), and on a
`--changed` sweep that pictured nothing (`NOTHING TO PICTURE`, `:131-138`). A run whose shots are all
`new` passes but prints `LOOK` rather than `PASS`, because a first baseline is a screen nobody has read
(`:235-253`).

```console
motu island snapshot --all --remote --changed
motu island snapshot --accept week-actions
```

### `motu island defaults [name]`

Classify every default an island declares: a component default, or missing evidence?

```console
motu island defaults [name] [--json]
```

| Flag | Meaning | Default |
| --- | --- | --- |
| `[name]` positional | One island | every island (`commands/defaults.mjs:88`) |
| `--json` | `{ defaults: [...] }` | off (`:99`) |

**Reads** the island files' `contract.input` defaults and the component each mounts
(`commands/defaults.mjs:49-85`). **Writes** nothing, and reports rather than rewrites — whether a value
is a sound empty state or a stand-in for data is a domain judgement (`:14-16`). Always exits `0`.

> `--json` is undocumented in `USAGE`.

### `motu island sync`

Regenerate the element registry and `contracts.generated.ts` from the files on disk.

```console
motu island sync
```

Takes no flags — `islandSyncCommand()` ignores its argument entirely
(`commands/defaults.mjs:138`). **Writes** `islands/registry.ts` and `islands/contracts.generated.ts`,
printing the island and contract counts. Static imports rather than a glob, because the barrel is
consumed by the host's bundler (`:133-136`). Always exits `0`.

### `motu island integrate <name> --archipelago <id>`

Make an existing island a member of an archipelago.

```console
motu island integrate <name> --archipelago <id> [--slot <slot>]
```

| Flag | Meaning | Default |
| --- | --- | --- |
| `<name>` positional | The island | required (`commands/integrate.mjs:37`) |
| `--archipelago` | Target archipelago id | required (`:38`) |
| `--slot` | Marker slot name | the island's kebab name (`:44`) |

**Reads** the island component's existence and the archipelago file. **Writes**, by AST edit: an
`IslandSpec` into the archipelago's `islands` array; a `prop -> slot` entry in `slots` when the region
declares a `root` (`:107-124`); and a `<motu-island slot="…">` marker into an **inline** `layout`
string — when the layout is an imported constant it prints the exact marker instead of guessing
(`:126-149`). Bindings and handlers are left as `TODO(motu:wiring)`.

**Exit** — `2` with a missing name or archipelago; `1` when the component, the archipelago file, its
config object or its `islands` array cannot be found; `0`, with a "nothing to do" notice, when the slot
or tag is already a member (`:83-86`).

> `integrate.mjs:38` also reads `argv.a`. Because the shared parser treats `-a` as a positional, that
> alias is only reachable as `--a <id>`.

---

## `motu integrate check [region]`

The last mile, and its own verb because it asks about the **host**, not about motu's files: does the
application compose the region, place every declared slot, and read it back?

```console
motu integrate check [region] [--json]
```

| Flag | Meaning | Default |
| --- | --- | --- |
| `[region]` positional | One region | every region (`commands/integration.mjs:822`) |
| `--json` | `{ host, regions }` | off (`:828`) |

> `--json` is undocumented in `USAGE`.

**Reads** — the host's own `.tsx`/`.ts` sources under the host root, excluding the directories motu
owns (`commands/integration.mjs:35-60`), plus each archipelago. It is entirely static: it can see
`<X.Island slot="y">` and cannot see whether the branch containing it ever runs, so a slot inside a
ternary, a `&&` guard or a `.map()` callback is reported as conditionally placed — a warning
(`:764-798`). **Writes** nothing.

**Exit** — `2` when no region matches, or when the scan found **zero** host files (`host-sources`: a
check that examined nothing has not passed, `:809-816`); `1` on any error finding; `0` otherwise.
Warnings do not fail the run.

```console
motu integrate check client-portfolio --json
```

Real output from `host-app`. `integrate check` is the only command that reads the HOST's own source,
so it is the one that can tell you a green region is not actually wired to a page:

```console
motu integrate check — is the host using what verifies green?

  ✓ corpus            integrated
      ! flow-shape   the page establishes no keys by `seed(...)` — nothing to compare
  ! signin            1 warning(s)
      ! flow-shape   the page establishes no keys by `seed(...)` — nothing to compare
      ! read         nothing calls Signin.useRegion() — the host feeds the region but never reads it back

PASS  2 region(s) integrated · 1 warning(s)
```

`composed, mounted, placed, read` is the full sentence a region earns; anything missing from it is
named. The `read` warning on `signin` is a real finding that this project has decided to accept — a
host that feeds a region and never reads it back usually keeps a second copy of the state somewhere,
and the reasoning for why that is not true here is written in `signin-screen.tsx`.

If it scans nothing, it exits `2` rather than passing:

```console
  ! host-sources  scanned 0 files under . (declared by tsconfig.json) — nothing was examined,
                  so nothing is proved about the host. Set `hostSources` in motu.config.json if the
                  application lives elsewhere.
```

> The parenthesis names WHERE it looked — `declared by <tsconfig>`, `guessed: <dirs>` or
> `hostSources: <dirs>` — so an empty scan says which of the three it trusted before finding nothing
> (`lib/host-sources.mjs`). The usual cause is running from the wrong directory — the CLI locates a
> project by `motu.config.json` in the cwd.

---

## `motu archipelago`

### `motu archipelago init <id> --page <file>`

Everything a page needs before its first island: the app-side region type, the archipelago, the lagoon
region module, a composition root, and the lagoon overrides entries.

```console
motu archipelago init <id> --page <path/to/page.tsx>
```

| Flag | Meaning | Default |
| --- | --- | --- |
| `<id>` positional | Region id | required (`commands/archipelago-init.mjs:77`) |
| `--page` | The page this region is drawn around; resolved against the cwd | required (`:78`) |

**Reads** — the host `tsconfig.json`, to decide between the `@/` alias and a relative import
(`:41-48`); and an existing composition root anywhere under `app/`, `components/`, `lib/`, `src/`, so a
new one inherits this project's `transport` and `useHost` rather than answering those environment
questions a second way (`:51-74`, `:163-170`).

**Writes** — `<page dir>/<id>-region.ts` (the app's own type, no motu import); the archipelago via
`archipelago create`, re-declared as `ArchipelagoConfig<PascalRegion>` (`:107-126`);
`<lagoon>/src/regions/<id>.tsx`; `<id>-region.tsx` (or `<id>-binding.tsx` when that name would collide
with the type module — a real collision that makes the composition root unreachable, `:155-162`); and
entries spliced into `<lagoon>/src/lagoon.tsx` when its maps are uncommented, else a printed
instruction (`:201-242`).

**Exit** — `2` with no id, no `--page`, or a page that does not exist; otherwise `0`. Existing files are
listed as `(exists, untouched)`.

```console
motu archipelago init client-portfolio --page app/portfolio/page.tsx
```

### `motu archipelago create <id>`

```console
motu archipelago create <id> [--force]
```

| Flag | Meaning | Default |
| --- | --- | --- |
| `<id>` positional | Region id; kebab-cased from any input (`commands/archipelago.mjs:14-26`) | required |
| `--force` | Proceed even though the file exists | off (`:69`) |

**Writes** `<archipelagos>/<id>/<id>.archipelago.ts` with an empty `islands: []` and commented
`root`/`slots`/`hostSlots`/`layout` templates, then AST-edits `<archipelagos>/registry.ts` (import +
`ARCHIPELAGOS` entry) and the app barrel (`:84-104`). **Exit** — `2` with no id; `0` and "nothing to do"
when the file exists without `--force`.

> `--force` is undocumented in `USAGE`.

### `motu archipelago verify <id|--all>`

Boot the whole region in the lagoon, plus the static config checks.

```console
motu archipelago verify <id|--all> [--runtime] [--audit] [--fast] [--verbose] [--json]
```

| Flag | Meaning | Default |
| --- | --- | --- |
| `<id>` positional / `--all` | One region, or every directory under `<archipelagos>` holding an archipelago file (`commands/verify.mjs:2599-2604`) | — |
| `--runtime` | Boot the lagoon: wiring probe, flows + mutation, region render (`:3132-3136`) | off |
| `--audit` | Implies `--runtime` and adds the composed-page responsive/a11y pass (`:3137`) | off |
| `--fast` | No browser. Every region runtime check is browser-only, so they are skipped **and said** as `– region-runtime` (`:3122-3131`) | off |
| `--verbose` | Name each step with its cost | off (`:3093`) |
| `--json` | Machine-readable findings | off (`:2607`, `:2616`) |

Static checks run regardless of the flags: channel source, frame-is-page,
render-coverage, writes-covered, catalogue membership, and the shared stylesheet lint
(`:3094-3118`).

**Exit** — one region: `0`/`1`/`2` via the same `verifyExitCode` as an island; a `--all` sweep takes its
worst member's verdict through `sweepExitCode` (`:2634`), so `2` survives a sweep.

```console
motu archipelago verify login --runtime
```

Static output for `corpus`, the stage-1 region in `host-app`. Every line names a check id from
[the catalogue](07-checks-and-verification.md); the trailing `· n` is what that check examined:

```console
motu archipelago verify — corpus

  ✓ region-type        bind keys are checked against `CorpusRegion`
  ✓ coupling           shared state: filter  · 1 shared key(s)
  ✓ ownership          4/4 bound key(s) owned — 3 host, 1 island
  ✓ registered         registered in ARCHIPELAGOS
  ✓ islands-registered all 2 island tag(s) are registered  · 2 declared tag(s)
  ✓ island-composition the region is made of the same 2 island(s) the application places  · 2 examined
  ✓ region-root        composed by a hand-written frame in roots/lagoon/src/regions/corpus.tsx, and it
                       holds the page's own components (islands only). Declaring `root` + `slots` on
                       the archipelago instead leaves ONE description  · 2 examined
  ✓ render-coverage    every declared slot is asserted by a flow  · 2 slot(s) asserted
  ✓ writes-covered     every declared write is driven by a flow  · 1 declared write(s)
  ✓ css-host-form      src/shared/styles.css: host rules work in both isolation modes
  ✓ css-tokens         src/shared/styles.css: colours come from tokens

PASS  0 warning(s)
```

`region-root` is worth reading closely: a `✓` that still names `root`. This region composes from a
hand-written frame — stage 1 — which passes, and the line says what stage 2 would buy without failing
the run. It becomes an error only under `regionRoot: "required"`. See
[composition and adoption](06-composition-and-adoption.md).

### `motu archipelago snapshot <id|--all>`

Picture the **composed** page — the arrangement, which no island shot can see.

```console
motu archipelago snapshot <id|--all> [--update] [--remote [url]] [--token <secret>]
                          [--accept [id]] [--changed [base]] [--json]
```

Flags behave as in `island snapshot`; baselines live in `<archipelagos>/<id>.snapshots/` and shots are
stored under the host island name `region-<id>` (`commands/snapshot.mjs:301`, `:316`, `:363`).

The states pictured are the region's flow **seeds**, deduplicated — a region declares no scenarios
(`:273-295`). When a region diff is found, the report names which member islands also changed; when
none did, it says the **arrangement** moved, and when members have no accepted baseline it refuses to
attribute at all (`:429-444`).

**Exit** — `1` on a difference or an error, `2` on missing arguments or a `--changed` sweep with nothing
to picture, `0` otherwise (`LOOK` instead of `PASS` when shots are new).

```console
motu archipelago snapshot --all --remote
```

### `motu archipelago record-frame <id> --url <u>`

Capture each mountpoint's real callsite geometry from the live embedded ocean, so the lagoon's
mountpoint gallery mimics the real placement offline.

```console
motu archipelago record-frame <id> --url <embedded-url> [--out <path>] [--headless]
```

| Flag | Meaning | Default |
| --- | --- | --- |
| `<id>` positional | Region id | required (`commands/record-frame.mjs:40`) |
| `--url` | A page of the running ocean where this archipelago's islands are placed | required (`:41`) |
| `--headless` | Run without a visible browser | off — headed by default, so you can log in and navigate once (`:50`) |
| `--out` | Where to write the stylesheet | `<lagoon>/src/frames/<id>.frame.css` (`:66-68`) |

The browser profile is persisted at `node_modules/.cache/motu-record-profile` so the login survives
across runs (`:14`). **Exit** — `2` with a missing id or url; `1` when Chromium is missing, the capture
throws, or the page had no `<motu-island slot>` mountpoints.

> `--out` and `--headless` are undocumented in `USAGE`.

### `motu archipelago sync`

Regenerate the region-side derived file — today, coverage's deployment config
(`commands/archipelago-sync.mjs:13-28`). Takes no flags. **Writes** the generated coverage module under
`<archipelagos>/`, and adds its import to `registry.ts` when missing; warns when there is no registry,
because nothing would import it. Always exits `0`.

### `motu archipelago adopt-root <id>`

**Undocumented in `--help`** — dispatched at `run.mjs:246`, absent from `USAGE`.

Turn a frame-composed region into a root-composed one: derive `root` (the app component the lagoon
frame renders) and `slots` (each `prop={island('x')}`) from the frame, and print the half that cannot be
derived — the page's own rewrite.

```console
motu archipelago adopt-root <id>
```

Takes no flags beyond the positional id.

**Reads** the archipelago and the region's lagoon frame module, resolved from the lagoon overrides
(`commands/adopt-root.mjs:31-60`). **Writes** `root:` + `slots:` and the root's import into the
archipelago file (`:165-177`).

It refuses rather than approximating. **Exit** — `2` when there is no archipelago, no frame, no
application component in the frame, more than one nested host component, no island passed to the root,
or when one prop holds more than one island — `slots` maps one prop to one island and cannot declare
that two are exclusive (`:100-163`). `0` when the region already declares a root ("nothing to do"), and
on success.

```console
motu archipelago adopt-root sign-in
```

### `motu archipelago coverage <id>`

The states production reached that no flow previews. The one motu check that compares the region to
reality rather than to a declaration — see [coverage](09-coverage.md).

```console
motu archipelago coverage <id> [--corpus <file|url>] [<more corpora>…] [--token <secret>]
                     [--save] [--accept <id>] [--forget <id>] [--forget-all]
                     [--ids] [--fail-above <n>] [--json]
```

| Flag | Meaning | Default |
| --- | --- | --- |
| `<id>` positional | Region id | required (`commands/region-coverage.mjs:160`) |
| `--corpus` + extra positionals | Corpus files or URLs, merged (`:215`, `:328`) | `coverage.corpusUrl` from config, with `region` filled in (`:200-218`) |
| `--token` | Bearer token for an HTTP corpus | `MOTU_COVERAGE_TOKEN` (`:239`) |
| `--save` | Write the corpus into `<lagoon>/src/coverage/<id>.json`, refusing if the body contains the token or its source URL (`:343-363`) | off |
| `--accept <id>` | Mark a recorded state as looked-at on the host; needs `MOTU_HOST_URL` + `MOTU_HOST_TOKEN` (`:409-438`) | off |
| `--forget <id>` / `--forget-all` | Remove a state the instrument recorded wrongly — a different act from accepting (`:373-400`) | off |
| `--ids` | Print each uncovered state's id, so `--accept` is reachable without deriving it (`:526`) | off |
| `--fail-above <n>` | Gate: fail when an uncovered state's share is at or above `n` percent (`:466`, `:554-558`) | advisory only |
| `--json` | Findings as data, including a typed scenario skeleton per uncovered state. Owns stdout — the prose is suppressed (`:159`, `:474-508`) | off |

**Reads** the archipelago's declared keys and `coverage.enums`, the region's flows, and the corpus —
which may be a file, a URL, the host's `GET /api/coverage` envelope, or a `/coverage/status` summary,
all normalised by one function (`:257-300`).

**Exit** — `2` for a missing id, an unknown region, unreadable flows, no corpus at all, a corpus that
would not load, or a failed accept/forget; `1` when the corpus and the code disagree about the declared
keys (nothing below is comparable, `:443-455`) or when `--fail-above` is breached; `0` otherwise.

```console
motu archipelago coverage actions --ids --fail-above 2
```

---

## `motu fixtures record <island>`

Boot the focused lagoon, drive the island's declared scenarios, and record every contract call's
request and response at the `call()` seam.

```console
motu fixtures record <island> [--transport http|mock] [--out <path>]
```

| Flag | Meaning | Default |
| --- | --- | --- |
| `<island>` positional | The island | required (`commands/fixtures.mjs:42`) |
| `--transport` | `http` records the **real** backend; anything else records the mock, which is a self-consistency check of the pipeline | mock (`:55`) |
| `--out` | Output file | `<islandDir>/fixtures.recorded.ts` (`:101`) |

**Reads** the island's `scenarios` through the tsx harness (`:19-30`) and drives a Chromium lagoon on a
random port in 5400–5699 (`:57`). **Writes** a `fixtures.recorded.ts` of request-keyed fixtures — a
captured failure is emitted as `status:`, not a comment (`:121-133`) — plus a `seed` export for
host-fed store writes the scenarios did not drive (`:86-94`). It is a **review** artifact: merge what
you want into the evidence file yourself (`:108`).

**Exit** — `2` with no name; `1` when the island declares no scenarios, Chromium is missing, recording
throws, the island did not mount, or nothing was captured; `0` otherwise.

> `--transport` and `--out` are undocumented in `USAGE`.

```console
motu fixtures record week-actions --transport http
```

---

## `motu lagoon`

Target resolution is shared by `dev`, `serve` and `publish` (`commands/lagoon.mjs:36-70`): a bare
positional is an island; `--archipelago <id>` (or `--archipelago` with a positional) is a region; no
target at all builds the switcher gallery over every archipelago. An unknown island or archipelago is an
error before anything is built.

### `motu lagoon dev [island]`

The iteration loop: the lagoon served by Vite with HMR, in this process.

```console
motu lagoon dev [island] [--archipelago <id>] [--port <n>] [--fit native|legacy] [--allow-any-host]
```

| Flag | Meaning | Default |
| --- | --- | --- |
| `[island]` / `--archipelago` | Focus target | the gallery (`:649`) |
| `--port` | Vite's port | Vite's own default (`:663`) |
| `--fit` | Legacy-fit strategy, passed through as `MOTU_FIT` | unset (`:659`) |
| `--allow-any-host` | Accept any `Host` header. Explicit, because it lowers a real protection (`:660-661`) | off |

Runs in the foreground; Ctrl-C stops it. Materialises the lagoon entries into `.motu/cache` rather than
into the project. See [lagoon](08-lagoon.md).

> Every flag here is undocumented in `USAGE`, which lists only `motu lagoon dev [island]`.

### `motu lagoon states [island|region]`

Every state the lagoon can be **opened** in, as a URL.

```console
motu lagoon states [island|region] [--base <url>] [--json]
```

| Flag | Meaning | Default |
| --- | --- | --- |
| positional | Filter to one island (kebab or tag) or one region (`:739`, `:763`) | everything |
| `--base` | Print absolute URLs against a running lagoon | paths only (`:714`, `:806`) |
| `--json` | `{ islands, regions }` | off (`:789`) |

Addresses are `?target=island:<tag>&scenario=<name-or-slug>` and `?region=<id>&flow=<name>`, both
against the **gallery** — the entry `serve` and `publish` build (`:751-755`, `:775-782`). States are
addressed by slug where that is unambiguous and by exact name where it is not (`:733-736`). Reads the
same loader the runtime checks use; writes nothing; always exits `0`.

```console
motu lagoon states week-actions --base http://localhost:8817
```

Every declared state is an ADDRESS, which is what makes "look at it" a link you can send rather than a
sequence of clicks. Real output:

```console
island:x-corpus-filter
  everything, nothing accepted yet
    /?target=island%3Ax-corpus-filter&scenario=everything-nothing-accepted-yet
  narrowed to what is unaccepted
    /?target=island%3Ax-corpus-filter&scenario=narrowed-to-what-is-unaccepted
island:x-corpus-states
  a corpus with a finding in it
    /?target=island%3Ax-corpus-states&scenario=a-corpus-with-a-finding-in-it
  nothing recorded yet
    /?target=island%3Ax-corpus-states&scenario=nothing-recorded-yet
```

Names are slugified into the URL, so a scenario called `nothing recorded yet` is addressable as
`nothing-recorded-yet`. A name that resolves to nothing REFUSES to render rather than falling back to
the default state — see [the lagoon](08-lagoon.md).

### `motu lagoon eject`

Write the framework's lagoon entries into the project — the C1 escape hatch.

```console
motu lagoon eject
```

Takes no flags (`commands/lagoon.mjs:681`). **Writes** `index.html`, `lagoon.html` and
`src/{main.tsx,lagoon.tsx,fixtures.ts,env.ts}` into the lagoon dir. Ownership is decided by
`index.html`: once it exists, materialisation stops and the files are yours to diverge. **Exit** — `2`
when the project already owns its lagoon, with the list of files to delete to hand it back (`:685-690`).

### `motu lagoon publish [island]`

Build the lagoon as one self-contained page, and optionally upload it.

```console
motu lagoon publish [island] [--archipelago <id>] [--fit native|legacy] [--out <path>]
                    [--title <text>] [--remote [url]] [--token <secret>] [--json]
```

| Flag | Meaning | Default |
| --- | --- | --- |
| `[island]` / `--archipelago` | Focus target | every archipelago, with the switcher |
| `--fit` | Legacy-fit strategy for a single-island target | unset (`:168`) |
| `--out` | Where to write the page | `.motu/publish/lagoon-<slug>.html` — stable per target, so republishing keeps one URL (`:143-145`, `:174`) |
| `--title` | Name in the host's listing. Prefer `title` in `lagoon.config.json`: a republish that forgets the flag renames the project back (`:160-167`) | declared title, else derived |
| `--remote [url]` | Also upload to a lagoon host | `MOTU_HOST_URL`, then `host.json` (`:184`) |
| `--token` | Upload token | `MOTU_HOST_TOKEN`, then `host.json` (`:255`) |
| `--json` | Machine-readable report — and it is emitted **after** the upload, so `--json --remote` cannot report a success that never happened (`:180-190`) | off |

The build is always `MOTU_TRANSPORT=mock` and a single chunk: an artifact has no backend and no
`/assets/` behind it (`:77-86`). Anything that could not be inlined is a hard error rather than a
silently blank page (`:132-133`). The upload happens **after** the local write, never instead of it, so
a host being down does not cost you the build (`:203-208`). The immutable URL is keyed by the commit;
the `latest` URL follows every publish. Host-side warnings — origin-absolute asset paths that work under
`lagoon dev` and 404 once hosted — are printed as findings (`:284`).

**Exit** — `1` on an unknown target, an unusable `--remote` URL, or a repo name that cannot be derived;
`0` otherwise.

```console
motu lagoon publish --remote --json
```

### `motu lagoon serve [island]`

Build the same artifact and serve it over HTTP — the check nothing else performs, because `dev` serves
source through Vite and never proves the inlined, mock-backed page works.

```console
motu lagoon serve [island] [--archipelago <id>] [--fit native|legacy]
                  [--port <n>] [--host] [--no-build] [--watch]
```

| Flag | Meaning | Default |
| --- | --- | --- |
| `--port` | Port to listen on; validated 1–65535 | `8817` (`:410-414`) |
| `--host` | Also bind `0.0.0.0` and print the LAN address, for a phone on the same wifi | loopback only (`:416-417`) |
| `--no-build` | Serve the last published artifact instead of rebuilding (`:426-432`) | off |
| `--watch` | Rebuild on every source change and live-reload open viewers (`:419`, `:564-630`) | off |

Every path serves the page, so deep links work (`:449-450`). Under `--watch` an SSE live-reload client
is injected — only there, never into a published artifact (`:310-347`) — and a failed rebuild keeps the
last good bytes on the wire (`:586-588`). With a host configured it registers itself as a **live**
member of the gallery every 30s and deregisters on exit (`:516-556`).

`serve` accepts no `--json`, `--out`, `--title`, `--remote` or `--token`.

**Exit** — `1` on an unknown target, an out-of-range port, `--watch` together with `--no-build` (they
contradict), `--no-build` with nothing published, a failed build, or `EADDRINUSE`/`EACCES`. Otherwise it
runs until Ctrl-C.

```console
motu lagoon serve --watch --host
```

---

## `motu check`

Every island, every region, integration and removal — one verdict. Static by default (~1.4s), because
it is meant to run on every change. It runs **motu's** gates only: your typecheck and linter are yours,
composed as `<host build> && motu check` (`commands/check.mjs:1-13`).

```console
motu check [--runtime] [--audit] [--fast] [--changed [base]] [--verbose] [--json]
```

| Flag | Meaning | Default |
| --- | --- | --- |
| `--runtime` | Add the lagoon lane to every island and region | off (`:65`) |
| `--audit` | Implies `--runtime`, and adds `responsive` + `a11y` per island plus the composed-page audit (`:68`) | off |
| `--fast` | No browser: islands mount under happy-dom, region runtime checks are skipped and said (`:69`) | off |
| `--changed [base]` | Narrow to what this branch touched; widens back to everything, loudly, when a file maps to no island or region (`:80-84`, `lib/changed.mjs:73-113`) | off |
| `--verbose` | Name each runtime step, and print how much of the wall clock fell **outside** any timed step (`:245-255`) | off |
| `--json` | `{ pass, runtime, contracts, islands, archipelagos, integration, removal }` | off (`:139`) |

> `USAGE`'s "check flags" block (`run.mjs:102-106`) lists only `--runtime`, `--verbose` and `--json`.
> `--audit`, `--fast` and `--changed` are read here and documented nowhere in `--help`.

`--changed` compares the working tree against `HEAD` plus untracked files, and additionally against
`<base>...HEAD` when a base is given (`lib/changed.mjs:17-30`). Files that provably cannot reach a
render do not widen the run.

**What it runs, in order** — generated-contract drift; coverage-module drift; `island verify` per island;
`archipelago verify` per region; `integrate check`; and finally `removal-check`, but **only** if the
structure checks held, because that one rewrites the host on disk and costs a full application typecheck
(`:122-135`). It also audits `noUncheckedIndexedAccess` in the host's tsconfig, as a warning it never
enforces (`:159-176`).

**Exit** — `2` when `--changed` narrowed to nothing (`NOTHING TO CHECK`: a run that examined nothing has
not passed, `:106-116`); otherwise `1` on failure, `0` on pass.

```console
motu check
motu check --runtime --fast --changed
motu check --audit --json
```

What it prints — five sections, each answering a different question. Real output from this
repository's `host-app`:

```console
motu check — contracts

  ✓ strict-boundaries   noUncheckedIndexedAccess is on — an unguarded index is a compile error
  ✓ generated           every island contract matches its component
  ✓ region-generated    coverage off, and nothing names @motu/coverage

motu check — islands

  ✓ corpus-filter        0 warning(s)
  ✓ corpus-states        0 warning(s)
  ✓ github-sign-in       0 warning(s)

PASS  3/3 clean · 0 warning(s) total

motu check — regions

  ✓ corpus               0 warning(s)
  ✓ signin               0 warning(s)

PASS  2/2 clean · 0 warning(s) total

motu check — integration

  ✓ corpus              composed, mounted, placed, read
  ! signin              1 warning(s)
      ! read         nothing calls Signin.useRegion() — the host feeds the region but never reads it back

motu check — removal

  – removable            not claimed — the project declares `removable: false`, so motu is meant to be load-bearing here

PASS  3 island(s), 2 region(s)
```

Three marks, and they are not three severities of one scale:

| mark | meaning |
|---|---|
| `✓` | the check ran and the declaration held |
| `!` | a warning — a finding, but the run still exits `0` |
| `–` | the check did not apply, or examined nothing (`seen: 0` becomes a skip automatically) |

`removable` is `–` because this project sets `removable: false`. The opt-out is reported rather than
hidden, and as a SKIP rather than a pass, because opting out proves nothing — see
[configuration](04-configuration.md).

---

## `motu removal-check`

Prove motu is removable from the host application (C2): delete every file that is 100% motu, unwrap its
tags everywhere else, and run the host's own typecheck on the result.

```console
motu removal-check [--force]
```

| Flag | Meaning | Default |
| --- | --- | --- |
| `--force` | Re-prove it even when nothing it depends on has changed | off (`commands/removal-check.mjs:489`) |

The proof is cached against a fingerprint of the files it touches plus the island and archipelago files
it generates from (`:473-501`); an unchanged repo skips the application typecheck, which is nearly all
of the cost, and the report says it was cached rather than re-proved.

**Reads** — the host's sources as an import graph built from text, then only the files that matter are
parsed properly (`:35-42`); the host's `tsconfig.json`, run as `npx tsc --noEmit` from the host root
(`:23-31`).

**Writes** — nothing permanently. It backs up into `.motu/cache/removal-check`, deletes and rewrites,
typechecks, and restores in a `finally` (`:512-526`).

**Exit** — `0` when the host typechecks without motu, or when the project declares `removable: false`,
which is reported as a **skip** and never as a pass (`:288-297`); `1` otherwise. A failure prints, in
this order: files the surgery could not rewrite (an unanswered question, not a verdict — every error
naming them is a consequence), what the host said, dangling imports of deleted modules, and files that
compose a region but are not deletable because they import the application, with the offending imports
named.

```console
motu removal-check --force
```

---

## `motu codegen [manifest] [outDir]`

Regenerate the typed `@motu/contract` from a `motu-manifest.json`. A thin wrapper over
`packages/codegen/src/cli.mjs`, so contract regeneration is reachable from the one entry point
(`commands/codegen.mjs:1-19`).

| Positional | Meaning | Default |
| --- | --- | --- |
| `[manifest]` | The manifest emitted by the backend build | `paths.defaultManifest` (`:9`) |
| `[outDir]` | Where to write the generated contract | `paths.contractSrcDir` (`:10`) |

Takes no flags. **Exit** — `1` when the manifest does not exist; otherwise the child's exit status is
passed through (`:18-19`). See [contract and backend](11-contract-and-backend.md).

```console
motu codegen target/motu-manifest.json contract/src
```

---

## `motu skills`

The judgement half of motu — the agent skills — installed in whatever format the repo's coding agent
reads. Deliberately config-free: it installs **into** a repo that may not be a motu project yet, so it
never reads `motu.config.json` (`commands/skills.mjs:11-13`). See
[agents and skills](13-agents-and-skills.md).

### `motu skills install [dir]`

```console
motu skills install [dir] [--only both|claude|copilot] [--force] [--json]
```

| Flag | Meaning | Default |
| --- | --- | --- |
| `[dir]` positional | Target repo | `.` (`:81`) |
| `--only` | Which formats to write | `both` (`:82`) |
| `--force` | Overwrite files that exist with different contents | off (`:93`) |
| `--json` | Machine-readable report | off (`:104`) |

**Reads** `.github/agents/*.agent.md` and `.github/prompts/*.prompt.md` from **this motu checkout**
(`:23-24`, `:39-58`). **Writes** `.github/agents/<name>.agent.md` and `.github/prompts/<name>.prompt.md`
verbatim, and `.claude/skills/<name>/SKILL.md` generated from the same body — one source, two formats,
so they cannot drift (`:94-102`). It also writes the host-rules block into the **host** root's
instruction files (`:120`), which is the repo the coding agent actually reads.

**Exit** — `2` on an invalid `--only`; `1` when this checkout ships no skills, or when any file was left
untouched because it differed (rerun with `--force`); `0` otherwise.

```console
motu skills install ~/dev/ocean --only claude
```

### `motu skills list`

```console
motu skills list [--json]
```

Name and description of every skill this checkout ships (`:132-142`). Always exits `0`.

---

## Which command when

Times are from `.github/host-rules.md:443-455`, measured on a 16-island / 2-region project (snapshots on
a 20-island / 3-region one).

| Situation | Command | Cost | What it answers |
| --- | --- | --- | --- |
| Every change | `motu check` | 1.4s | Has anything drifted from what it declares? |
| Working on one island | `motu island verify <n> --runtime` | ~15s | Does this island still mount, differentiate and wire? |
| Working on one region | `motu archipelago verify <id> --runtime` | ~25s | Do this region's flows still end as declared? |
| Iterating, browser-free | `motu check --runtime --fast` | 44.0s (5.9s with `--changed`) | Everything a happy-dom mount can answer. |
| Before handing work over | `motu check --runtime` | 103.5s | Does the whole project still work? |
| Before integrating, and in CI | `motu check --audit` | + responsive/a11y | Is it usable — at every viewport, for everyone? |
| Before handing work over | `motu island snapshot --all --remote` | 89s | Did any island move? |
| Before handing work over | `motu archipelago snapshot --all --remote` | 18s | Did the composed page move? |
| Before saying an integration is done | `motu integrate check <id>` | static | Does the **host** compose, place and read the region? |
| Looking at a state | `motu lagoon states`, then `motu lagoon serve --watch` | — | Open the exact declared state, in a browser. |
| Showing a human | `motu lagoon publish --remote` | — | A link that outlives your process. |
| Asking what production reached | `motu archipelago coverage <id>` | — | Which real states no flow previews. |

Two scoping rules that decide whether these numbers apply to you. **Name what you touched**: while
working on a region, run that region and its islands, not the whole project. And `--changed` is not that
scoping — it narrows only while every changed file maps to an island or a region, and widens back to
everything, loudly, the moment one does not (`.github/host-rules.md:456-466`, `lib/changed.mjs:1-10`).
