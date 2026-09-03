# Run 1 — 2026-09-02

Three agents (Sonnet), two unfamiliar production monorepos, one control. Raw data:
`motu-bench/runs/trace-final.jsonl`, `metrics.json`, and one `journal.md` per arm.

## The numbers

| | arm-a-next (formbricks, no skills) | arm-b-vite (novu, skills) | control (no motu) |
|---|---|---|---|
| steps completed | 5 / 5 | 6 / 6 | done |
| motu invocations | 26 | 26 | — |
| failed | 14 (54%) | 9 (35%) | — |
| exit 1 / exit 2 | 14 / 0 | 7 / 2 | — |
| verbatim retries | 4 | 4 | — |
| init → first lagoon | never counted green (see below) | **18 invocations, 23 min** | — |
| CLI time | 659 s | 232 s | — |
| agent tool calls | 196 | 161 | 20 |
| ever *looked* at the screen | yes (2 fresh agents) | yes (2 fresh agents) | **no** |

Both arms shipped. Neither shipped smoothly.

## Verdict against the pre-registered expectations

- **H1 — on-ramp under 10 invocations, zero doc dives: FAILED, badly.** Arm B took 18 invocations and
  23 minutes to a booting lagoon; arm A took longer and hit three separate build walls first. Both
  arms took multiple doc dives, and both ended up reading `packages/cli/src/commands/verify.mjs` —
  the thing the "stranger" constraint says they should never need.
- **H2 — friction concentrates in evidence files and the lagoon override map: HALF RIGHT.** The
  override map was indeed the hot spot, but for a reason not predicted: `providers`. Both arms shipped
  a region that mounted, passed every check, and was *broken on screen* for want of a provider the app
  installs at its own root. Evidence files were not a notable source of friction in either arm.
- **H3 — last mile uneventful for motu, eventful for the host: INVERTED.** `integrate check` was
  uneventful in both arms and the host typecheck produced **zero** new errors in both. The
  eventfulness was all *before* the lagoon rendered, not after. Arm A: "every surprise surfaced from
  trying to GET the lagoon to render at all, before there was anything to look at."
- **H4 — the control never looks: CONFIRMED, and worse than stated.** See below.
- **H5 — the perception check finds something, or costs nothing: CONFIRMED TWICE, INDEPENDENTLY.**
  Two arms, two different applications, two different invisible-to-every-check render bugs, each
  caught by the first fresh-eyes agent. This is now five catches for the perception tier.

## Defects worth fixing before a public release

Ordered by how likely a stranger is to hit them.

1. **`motu init` silently skips the `@motu/*` dependency block on a pnpm workspace.** `inWorkspace`
   looks for an npm/yarn `"workspaces"` field in a `package.json`; formbricks declares
   `pnpm-workspace.yaml`, so init decided it was not a workspace, wrote no `@motu/*` deps — including
   `@motu/adapter-next`, the one package a Next host needs for `nextHostBridge` — and **printed
   success with no warning**. pnpm monorepos are a large share of the Show HN audience.
   (`packages/cli/src/commands/init.mjs`)

2. **`region-root` rejects the shape its own scaffold recommends — found INDEPENDENTLY by both arms.**
   The frame scanner regex-matches a bare component *identifier* (`login: SomeFrame`) and does not
   recognise the `regions: { id: { seed, layout } }` shape that the generated `lagoon.tsx`'s own
   commented-out example and CLAUDE.md both document. It reports a hard error, `no root`, which points
   at the archipelago rather than at a regex. Both agents found the cause only by reading CLI source.
   Two independent discoveries in one run is the strongest signal in this dataset.
   (`packages/cli/src/commands/verify.mjs`, `frameIsPageCheck` / `frameModuleFor`)

3. **`rsc-boundary` promises transitive coverage and delivers single-file.** It is an AST pass over
   the island's own file. Arm A's `server-only` import was four hops away
   (`LoginForm → SSOOptions → SamlButton → 'use server' actions → jackson → context.ts`), so the check
   printed `✓` and the Vite build then died on an opaque rollup error.
   [docs/12-hosts-and-adapters.md](../../docs/12-hosts-and-adapters.md) says it catches exactly this.
   Either walk the import graph or narrow the documented claim.

4. **The exit-2 classifier misses `ENOSPC`, and `--help` returns exit 2.** Both arms hit inotify
   watcher exhaustion; arm A's `island verify --runtime` reported it as **exit 1 (FAIL)**, which is
   precisely the case the three-outcome design exists to prevent — an unattended agent repairing a bug
   that does not exist. Separately, `motu archipelago init --help` and `motu island create --help`
   both **exit 2**: the "could not run" code, on the first command a stranger types.

5. **No first-class answer for "trigger in one island, close in another".** Arm B's delete-confirmation
   is an entirely ordinary pattern — one island opens the dialog, a different island closes it — and
   single-producer-per-key has no model for it. `provide()` throws for a key an island's `writes`
   claims. The agent shipped a `seed()`-past-first-paint workaround whose own doc comment describes a
   narrower purpose. `island-locate` frames every key as cleanly owned and does not warn about this.
   This is a **model gap**, not a bug, and it is the most interesting thing the run found.

6. **`removal-check` false positive on the composition root.** Arm A's `motu-login-region.ts` was
   flagged "composes a region but is NOT deletable, because it imports the application" — while both
   offending imports were listed as 100%-motu-deletable *two lines above in the same report*. The
   classifier keys off specifier form (`@/…` reads as application) rather than resolving the file.

7. **`lagoon-render` prints "no layout — islands placed individually" when a layout is declared and
   resolves.** Arm A judged it wording rather than substance, and did not chase it.

## What the control proved

20 tool calls, type-correct, landed, and **never rendered once**. It probed for Postgres, found the
port closed, judged the DB + migrations + dev-server chain out of budget, and shipped on `tsc` and
reading source. Two consequences it identified itself:

- Ownership is convention: *"nothing in the types stops a future component anywhere in the tree from
  being handed that same setter… the 'only one place claims a key' property is a property of how I
  wired it today, not something enforced."*
- A live stuck-state risk it could not resolve: four of five OAuth buttons rely on the browser
  navigating away, so a rejection without navigation leaves `pendingProvider` set and **the entire
  screen disabled forever**. A pending-state scenario in a lagoon is exactly what makes that visible.

That is the honest pitch. Not "motu is faster" — it plainly is not, on a cold start. It is that the
default path produces type-correct, unlooked-at UI with an ownership claim nothing can falsify.

## Does building out of the box help, concretely?

Yes, in one specific and repeatable way, and no in another.

**Yes:** the region composed and landed on the real page with zero new host typecheck errors in both
arms, `integrate check` green in both, and the one-producer-per-key rule fired as a static error
when arm A tried to claim a key twice. Arm B's error messages were called *"mostly excellent"* — the
`on`-vs-`writes` guidance *"exact"*.

**No:** reaching a screen you can look at cost far more than "wrap a component and go" on a real
monorepo. Arm A's verdict is the sentence to take seriously: *"closer to doing the coupling refactor
by hand AND separately fighting the preview tool to represent that refactor, for a payoff that
arrived only at the very last step."*

The payoff itself is real and is the one thing nothing else in the stack does: **two applications,
two invisible render bugs, both caught by looking.**

## Known confounds in this run

- **Host and kit are confounded** (Next+no-skills vs Vite+skills). A four-arm design separates them.
- **Machine contention.** Three agents on one box exhausted inotify watchers and swap; several exit-1
  results are environmental. This *produced* finding #4 but inflates the raw failure ratios.
- **The formbricks baseline moved mid-run.** I built `@formbricks/database` / `@formbricks/logger`
  after arm A had started, so its baseline had *fewer* errors than the log it was given. Safe
  direction (no false new-error attribution), but it is a defect in the protocol: build every
  workspace package before launching anything.
- **One run per arm.** Case studies with instrumentation, not a sample.

## Fixes landed from run 1

Each was reproduced before being changed, and re-tested after. Two of the seven reported defects did
not survive reproduction — recorded here because an agent's diagnosis being wrong is itself a result.

| # | Fix | Where | Proof |
|---|---|---|---|
| 1 | Host adapters are linked like every other package (`packages/adapters/next` → `@motu/adapter-next`), and `init` now says when it kept an existing `package.json` and therefore wrote no `@motu/*` block | `lib/util.mjs`, `commands/init.mjs` | `ls node_modules/@motu/` in formbricks now lists `adapter-next`; it imports and exports `nextHostBridge`. Notice reproduced in a scratch pnpm workspace |
| 2 | `region-root` reads the `regions: { id: { seed, layout } }` shape, and an inline arrow `layout` warns (naming the one-line fix) instead of erroring as a missing `root` | `commands/verify.mjs` | novu's region switched to the record shape: `PASS`, `region-root` green. Inline-arrow variant: `PASS` with the new warning |
| 3 | `rsc-boundary` walks the island's whole reachable application graph and names the offending module | `commands/verify.mjs`, `adapters/next/verify.mjs` | the original chain restored in formbricks: 3 named errors incl. `modules/ee/sso/actions.ts` — the exact file arm A traced by hand — in ~1s instead of an opaque rollup error |
| 4 | `ENOSPC`/`EMFILE`/`ENFILE`/`ENOMEM` classified environmental (exit 2), and the environmental line no longer disqualifies itself by starting with `Error:`; `--help` on any subcommand exits 0 | `commands/verify.mjs`, `run.mjs` | `motu island create --help` → exit 0; missing argument still exits non-zero |
| 5 | The `ownership` error now names OPEN/CLOSE as the common shape, points at nested `slots`, and says `seed()` is sanctioned for a produced key where `provide()` is not | `commands/verify.mjs` | — (teaching fix; the model was not changed) |
| 6 | `removal-check` no longer invents a `motu/` directory when motu was initialised into the host root — it uses the declared `islands`/`archipelagos`/`ui`/`shared`/`lagoon` dirs | `commands/removal-check.mjs` | the fallback `relative(hostRoot, cfg.root) \|\| 'motu'` produced `'motu'` for `app: "."`, which is what `motu init . --host next` writes |
| 7 | `lagoon-render`'s "no layout" now names all three places an arrangement is looked for | `commands/verify.mjs` | largely downstream of #2 |

**Diagnoses that did not hold up.** Arm A attributed #1 to `inWorkspace` ignoring `pnpm-workspace.yaml`
— it does not; that check has handled pnpm all along. The real cause was two different things
(adapters never in the link set, and `writeNew` keeping the app's existing `package.json`). Arm A also
attributed #6 to the classifier keying off specifier *form*; the actual cause was the `|| 'motu'`
fallback. Both diagnoses pointed at the right SYMPTOM and the wrong LINE, which is the argument for
reproducing before repairing — and, in a bench about unattended agents, the most quietly important
finding in the run.

---

# Run 2 — paired replay against the fixed CLI

Same repos, same pages, same prompts, same model. Only the CLI differed. Arms run SEQUENTIALLY this
time (run 1's three concurrent agents exhausted the machine's 65536 inotify watches, which inflated
its failure ratios), and both applications' own typechecks were at a genuine 0 errors before motu was
introduced — the protocol defect run 1 recorded, fixed.

## Arm A (formbricks / Next) — the on-ramp

| | Run 1 | Run 2 |
|---|---|---|
| init → first openable lagoon state | **never reached** | **3 invocations, 43 s** |
| verbatim retries | 4 | **0** |
| CLI time | 659 s | **134 s** |
| failure ratio | 54% | 41% |
| doc / source dives | several, incl. `verify.mjs` | none reported |

## Arm B (novu / Vite) — the check loop

| | Run 1 | Run 2 |
|---|---|---|
| init → first lagoon | 18 invocations, **1366 s** | 18 invocations, **811 s** |
| failure ratio | 35% | **25%** |
| verbatim retries | 4 (all `check`) | 4 (all `check`) |
| `--runtime` on an exhausted machine | exit **1** (FAIL) | exit **2** (INCONCLUSIVE), *"reported, not repaired"* |

## What the fixes bought, in the agents' own words

- **#3, transitive `rsc-boundary`** — arm A, which knew nothing about the change: *"the lagoon's build
  blew up on a raw Rollup error 11,000 modules deep (a Next server action reached through five
  components); `motu island verify login-form`'s static `rsc-boundary` check named the exact offending
  module and the exact reason in one line."* Run 1's agent lost its longest stretch of the run to that
  same chain. Clearest before/after in the dataset.
- **#4, exit-2 classification** — arm B hit `ENOSPC` again, got INCONCLUSIVE, confirmed it
  environmentally against the app's own dev server, and **did not repair anything**. That is the
  behaviour the three-code design exists for, observed rather than argued.
- **#4, `--help`** — arm A guessed a `--from <module>:<Export>` syntax, failed twice, ran
  `motu island create --help` (exit 2 in run 1, now exit 0 and prints usage) and got it right on the
  next invocation. Failure → teach → recover, at a cost of 3 invocations instead of a source dive.
- **#2, `region-root`** — neither arm lost time to it. Run 1 lost its two longest debugging stretches
  to it, independently.

## What run 2 found that run 1 could not

The on-ramp getting out of the way let both agents reach further, and the friction moved.

1. **`motu init --help` SCAFFOLDED A PROJECT INTO THE CURRENT DIRECTORY.** Introduced by the run-1
   `--help` fix and caught by run 2: on a top-level verb the flag lands in `sub`, not `rest`, so the
   new guard missed it, dispatch fell through, and `init` read the missing positional as `.`. In arm
   B's repo the existing config refused the overwrite and only an exit 1 showed; reproduced in an
   empty directory, it silently created a project. Fixed by checking `sub` too, and verified across
   five verbs that help creates nothing.
2. **Tailwind v4 is invisible to motu.** v4 moved the config into CSS and dropped
   `tailwind.config.js`; formbricks also keeps its stylesheet at `modules/ui/globals.css`, outside
   motu's four conventional paths. Both detections missed, so the lagoon rendered every island with
   correct text, structure and coupling and **no styling at all, silently**. The agent could not tell
   a preview bug from an application bug — the one thing a preview must never make ambiguous. Fixed
   by finding the stylesheet that *declares* Tailwind (`@import "tailwindcss"` / `@tailwind`) by
   content; verified it now wires `modules/ui/globals.css`.
3. **`rsc-boundary` contradicted a working build — a false positive introduced by fix #3.** The
   project stubbed the offending module through `lagoon.config.json`'s `alias`; the build succeeded
   and the check went on failing the island. Fixed by stopping the graph walk at an aliased specifier,
   and verified in BOTH directions: with the alias the island passes, without it the real chain still
   fails. A check that contradicts a visibly-working build is the one an author learns to disbelieve.
4. **The scaffolder still generates things that fail its own checks.** Arm B: *"three of my early
   fixes were repairs to what the scaffolder itself generated — a bare `import … from 'dashboard'`
   resolving to nothing, a doubled `@/src/pages/…` path, and a lagoon frame scaffold that fails the
   very rule (`region-root`) it is later checked against. A stranger spends real time debugging the
   tool before debugging the app."* NOT YET FIXED — this is the biggest remaining item.

## The metric that stopped working

`failure ratio` is losing its meaning as the checks sharpen: run 2's failures include `rsc-boundary`
correctly catching a real chain and `--runtime` correctly reporting an exhausted machine. Both are
the tool working. **Verbatim retries** and **failures that taught nothing** are the honest successors;
arm A's verbatim retries went 4 → 0, and arm B's remaining 4 are all `motu check`, which is where the
next work is.

## Standing findings, unchanged by either fix round

- **The check loop is still the cost centre.** Arm B run 1 spent 46% of its tool calls between its
  first and last `motu check`, rewriting the archipelago 7 times and `lagoon.tsx` 6 times; run 2's
  four verbatim retries are all `check`. The on-ramp is fixed; the iteration loop is not.
- **The perception tier caught something again, in both arms, on two applications.** Arm B: a real
  crash (missing `TooltipProvider`) that every static check passed. Arm A: a fresh agent confirmed
  *"this screen belongs to Formbricks. Nothing rendered is invented."* Seven catches now.
- **Ownership does real work.** Arm B: motu's one-producer rule *"forced an honest redesign of the
  delete flow that plain `tsc` would never have flagged"* — the same open/close case run 1 called a
  model gap, now handled by moving the trigger into the island that owns the key.

## Scaffolder round — five defects, all reproduced on the pristine novu app

`motu init . --host vite` then `motu archipelago init api-keys --page src/pages/api-keys.tsx`, on a
clean checkout, produced all five. Each fix was verified by re-running that exact pair.

| # | What the scaffolder generated | Fix |
|---|---|---|
| 1 | `import { ELEMENT_REGISTRY, … } from 'dashboard'` — `appPackage` defaults to the app DIRECTORY name, which is a package name only when the two agree (`apps/dashboard` publishes `@novu/dashboard`) | the barrel is a file motu itself wrote, so name it the way the host would (`@/index`), keeping `appPackage` for when it genuinely is a resolvable package |
| 2 | a composition root calling `createRegion(...)` and never importing it — the imports were only ever inherited from a PRECEDENT, so the FIRST region in any project had none | emit the import when the precedent does not supply it |
| 3 | `import type { … } from '@/src/pages/api-keys-region'` — a doubled `src/`. The generator assumed `@/*` means the host root (true on Next's template, false on a Vite app mapping `@/*` → `./src/*`) | resolve through the alias's real TARGET (`hostAliasSpecifier`), longest prefix first |
| 4 | a frame placeholder `<div className="flex flex-col gap-6 …">` — which `region-root` rejects, so the adopter's first `motu check` reported a violation motu had written for them | a fragment |
| 5 | **an archipelago that does not typecheck at all**: `{ ownership: true }` against a type requiring `wiring` and `produced` too — and `wiring` is unsatisfiable at that moment, because it needs the generated `ElementTypes` and `contracts.generated.ts` does not exist until the first island is synced | `wiring`/`produced` are optional only while `islands: []`, and required again the moment the region has a member |

After: the generated archipelago typechecks (novu `tsc -b`: 1 error → **0**), `archipelago verify`
passes, and the binding imports resolve.

Fix 5 is the one to be careful about, since it relaxes a type-level guarantee. Proved in both
directions against the real `archipelago()` signature: an island-less region compiles with
`{ ownership: true }` alone (exit 0), and a region with one island omitting `wiring` still fails
(`missing the following properties … wiring, produced`, exit 2). An earlier attempt to test this by
deleting `wiring: true` from `host-app`'s corpus region and running `tsc -b` reported a false
all-clear — `host-app` is not in the root tsconfig's project graph, so the file was never compiled.
Worth recording: the test that would have hidden the regression looked exactly like the test that
found it.

### The pattern behind all five

Every one is the scaffolder emitting something that fails a gate motu itself enforces one command
later — a wrong default, an inherited-only import, an assumed alias shape, a placeholder that
violates its own rule, a checks object the type rejects. None is deep; together they are the first
twenty minutes of every adoption. The reason they survived this long is structural: motu's own
consumers (`demo-app`, `host-app`, the review console) were all scaffolded once, long ago, by someone
who fixed these by hand without recording them. A cold start is the only thing that runs this path.

**Worth adding before release:** a smoke test that runs `init` + `archipelago init` into a temporary
app and asserts the result typechecks and passes `motu check`. Four of these five would have been
caught by it on the day they were introduced.

## The smoke test, and the two more defects it found

`scripts/smoke-scaffold.mjs` (also `pnpm smoke:scaffold`, and a CI step in the static job) builds a
throwaway app, runs `motu init` + `motu archipelago init`, and asserts the result **typechecks** and
**passes `motu archipelago verify`**. Seconds, no browser.

Three decisions in it were each forced by a defect that slipped past an earlier version:

- **Two host shapes.** Next's template maps `"@/*": ["./*"]`; a Vite app commonly maps
  `["./src/*"]`. The generator assumed the first, which is why the doubled-`src/` bug was invisible
  on every project motu had ever run against. One host would have reproduced that blindness exactly.
- **The app's package name differs from its directory name** (`apps/dashboard` publishing
  `@acme/dashboard`) — the condition that turned `basename(appRoot)` into an import of a package
  nobody installed.
- **The region is wired into the lagoon, and wired BEFORE the typecheck.** `region-root` only opens
  the frame once something references it, and the lagoon overrides only get compiled if they exist
  when `tsc` runs. The first version did neither and passed over two live defects.

Writing it turned up two more, bringing the round to seven:

| # | Defect | Fix |
|---|---|---|
| 6 | the scaffolded frame is a COMPONENT taking `{ island }` as props, while `layout` is `(island) => ReactNode` — so wiring the frame motu had just written needed an adapter the adopter had to guess, and the scaffold's own shape suggested the wrong guess (arm B logged exactly this) | emit the frame with `layout`'s signature |
| 7 | `roots/lagoon/src/env.ts` was written from its template **unrendered**, keeping `{{lagoonConfigImport}}` verbatim — the file could not compile, and nothing typechecked `roots/` | render it, like every other template |
| 7b | `ENV_SHIM` reads `config.env` while the scaffolded `lagoon.config.json` declares no `env` key, so `resolveJsonModule` makes the access a type error on a fresh project | read it through a widening cast |

### Mutation-tested, because a smoke test that cannot fail is worse than none

Each of the seven fixes was reverted one at a time and the suite re-run. **7/7 CAUGHT**, baseline
green afterwards. Two of those runs initially reported MISSED and both were flaws in the TEST, not in
the fix — the frame was never opened because the region was unwired, and the wiring was never
compiled because it was written after `tsc`. That is the same lesson the `hostSources` escape hatch
taught this repo once already, and the same one that made an earlier `tsc -b` over `host-app` report
a false all-clear in this session: **a check that looked at nothing reports success.**

---

# Run 3, and the blast-radius fix

## Arm A (formbricks / Next) — and why the trend is not monotonic

| | Run 1 | Run 2 | Run 3 |
|---|---|---|---|
| init → first lagoon | never reached | **3 invocations, 43 s** | 21 invocations, 714 s |
| verbatim retries | 4 | **0** | 5 |
| failure ratio | 54% | 41% | 58% |
| invocations | 26 | 32 | 38 |

**Run 3 looks worse than run 2, and the cause is agent path choice, not a regression.** Run 2's agent
happened to extract the OAuth buttons FIRST, which removed the offending import chain before it ever
built. Run 3's agent wrapped `LoginForm` as-is — the more obvious order — and hit a fatal build wall
that run 2 never saw. Same task, same CLI, different order.

So **run 2's clean numbers were partly luck**, and a three-point "improvement trend" would have been
a story rather than a result. The instrument is honest enough to show that, which is the argument for
keeping the raw trace rather than only the summary.

Run 3's failures are also mostly the tool WORKING: 8/8 `motu check` failures were `rsc-boundary`
correctly refusing a genuine Server-Action coupling.

## The finding: one island's imports killed every island's preview

Arm A's closing line is the whole result:

> *"every motu check passed, but `motu lagoon serve` has a fatal build failure… Net result: I could
> not hand over a working URL for any state, despite a fully green `motu check --runtime`."*

The chain was `LoginForm → SSOOptions → SamlButton → sso/actions.ts ('use server') → … →
node:async_hooks`. The lagoon builds every archipelago as ONE chunk, so rollup died 11,000 modules
deep and **nothing in the project was previewable**. Green checks and nothing to look at is the worst
state for a tool whose promise is that every declared state has an address.

Run 2 never found this because it dodged the chain by accident. No static check or smoke test could
have found it either: every check passed.

## The fix: exclude, attribute, and keep the island's own verdict

`packages/cli/src/lib/bundlability.mjs` (shared by `verify` and the build) finds islands with an
error-level `rsc-boundary`, and a Vite `load()` plugin replaces those modules with a placeholder
element carrying the reason. `load()` rather than an alias, because the registry imports islands by
RELATIVE path and an alias matches specifier strings; intercepting the resolved file means rollup
never parses the real module, so it never walks the graph that cannot be bundled.
`MOTU_NO_EXCLUDE=1` restores the old all-or-nothing behaviour.

Proved on Arm A's own tree, by the ARTIFACT rather than the exit code:

| Evidence | Result |
|---|---|
| `data-motu-unbundlable` in the built HTML | 1× — the stub is in the bundle |
| `doesSamlConnectionExistAction` in the built HTML | 0× — the real chain is gone |
| the build itself | exit 0, 598 KB `lagoon-all.html` |
| `motu island verify sso-options` | still exit 1, 4 `rsc-boundary` errors |

That last row is the one that matters: exclusion buys the OTHER islands their preview and does not
make a broken island pass.

### Two bugs found while verifying it, both the same shape as everything else here

1. **The detector was inert.** It was handed the island's EXPORTED name where `islandComponentPath`
   wants the PASCAL name, so it matched no islands and excluded nothing. The first "before/after" was
   therefore two identical runs, and it was one step from being written up as a success.
2. **The notice was swallowed.** The build runs in a child process whose output is surfaced only on
   FAILURE, so a successful build silently dropped an island. A feature that works and says nothing is
   precisely what this one exists to prevent. It now emits `[motu:excluded]` lines that the parent
   extracts and prints.

Both were caught by asking *did the mechanism fire?* rather than *did the outcome look right?* — the
third and fourth time in this session, after the `host-app` typecheck that never compiled the file it
was "proving" a guarantee with, and the smoke test that wired a region after `tsc` had already run.
`report.ok(check, msg, seen)` encodes this discipline for checks; nothing encodes it for features.

## Arm C — npm, single package (shlink-web-client)

All 6 steps completed. `integrate check` PASS, `npm run types` clean against a 0-error baseline, and a
fresh agent confirmed the rendered region is genuinely Shlink's own UI. 28 invocations, 39% failed.

**Did npm / single-package cause anything?** Directly, almost nothing — the agent's own verdict on the
worst bug was *"a plain field-name typo, unrelated to npm vs pnpm"*. Indirectly, one thing that
matters for adoption: `motu init` touched **zero lines of package.json**, so on a non-workspace project
motu's only record of itself is raw symlinks in `node_modules/@motu/*`. A fresh `npm install` deletes
them and leaves nothing saying what was needed. A pnpm workspace at least gets a durable `workspace:*`
entry. The CLI re-creates the links on every invocation, so this is a *legibility* gap rather than a
breakage — but it is the one real consequence of the axis this arm existed to test.

### It found a bug this session had introduced

`removal-check`'s directory allowlist was built from `cfg.islands` / `cfg.archipelagos` / `cfg.ui` /
`cfg.shared` / `cfg.lagoon`, but `loadMotuConfig()` exposes those as `islandsDir` / `archipelagosDir` /
`uiDir` / `sharedDir` / `lagoonDir`. All five read `undefined`, so the list was always empty, the
`insideMotu` regex became match-nothing, and **no project's composition root could be recognised as
motu's own** — the earlier `|| 'motu'` guessed a directory that did not exist; the replacement guessed
nothing at all, for everyone. Introduced in this session's first fix round, shipped under the claim
"mutation-tested" — which was true of the SCAFFOLDER suite and false of this, because
`removal-check` is not in it. The coverage boundary was the whole difference.

The agent's diagnosis was correct and well-evidenced: it probed `loadMotuConfig()`'s actual return
value, tested whether an import-style workaround could route around it, and concluded it was a
field-name bug in motu rather than a project problem. That is a materially higher standard than run
1's two confident wrong root-causes, and worth noting when weighing agent reports.

Fixing the names was necessary and not sufficient. `isMotuSpec` recognises motu by how a module is
SPELLED, and the composition root says `../islands/registry` — a relative specifier with no motu
marker. The fixpoint could not bootstrap either, because an island mount point imports the
application's component BY DESIGN (that is what `--from` is for), so no island is ever "100% motu" by
imports alone. The declared directories settle it: `islands/`, `archipelagos/`, `ui/`, `shared/` and
the lagoon root are what removal DELETES, so the set is now seeded from them directly. All 14 motu
files are classified correctly, and **host-app still passes (exit 0)** — no regression on the case
that already worked.

### One layer deeper, now visible

With the binding correctly deleted, removal exposes a real gap: the page's
`import { ManageServersRegion, MotuRegion } from './manage-servers-binding'` is left dangling.
`MotuRegion` is a standalone ALIAS for `.Region`, and the rewriter — like `integrate check`'s
placement regex, which Arm C also caught — assumes literal `<X.Island slot=…>` dot-member access. So
the dot-member tags unwrap, the aliased one does not, and the import survives.

**One finding, not two: motu's static rewriter and its placement checks share an assumption that a
region is always used through dot-member access, and both miss an aliased export.** Not a regression —
before the fix the binding was never deleted, so this could not arise.

### Other Arm C findings, all outside what two monorepos could reach

- **`vite-plugin-pwa` breaks `lagoon serve`**: `injectManifest`'s `srcDir: './src'` resolves against
  the lagoon's copied root (`.motu/cache/lagoon/`), which has no `service-worker.ts`. `lagoon dev`
  works. A host-plugin interaction neither previous target had.
- **`region-root` reads the whole frame FILE**, not the `layout` export's body — so `providers` living
  in the same module are flagged as "arrangement the frame draws itself".

## Fix round 3 — the friction two or more agents hit

| # | Fix | Evidence |
|---|---|---|
| 1 | **`--from <module>:<Export>` is accepted**, and the failure now prints correct calls | TWO independent agents, on two applications, invented exactly this syntax and burned 3 invocations each before a doc dive. When two strangers guess the same form, refusing it is the defect |
| 1b | the error detects a file extension and says "drop it — this is a module specifier, not a path" | the exact specifier arm C typed (`./src/servers/ServerSearch.tsx`) |
| 7 | `init` on a NON-workspace project now says what resolves `@motu/*` | arm C: `motu init` changed zero lines of package.json, so the only record of motu was symlinks a fresh `npm install` deletes |
| 4 | `island-locate` no longer assumes an adopted project | arm B and arm C both ran it BEFORE `motu init`, where its "read `motu.config.json`" step 0 cannot run; both improvised silently |

`--from` was verified end-to-end: the colon form now generates
`import { ManageServersRow as ProbeA } from '../servers/ManageServersRow'` and exits 0, while the
extension case prints the hint. `--export` remains canonical and still wins when both are given; the
colon split is guarded so a `node:`/`virtual:` specifier is untouched.

**The skill fix was nearly written to the wrong file.** `.claude/skills/<name>/SKILL.md` is GENERATED;
`.github/agents/<name>.agent.md` is the source `motu skills install` reads. Editing the generated copy
would have survived exactly until the next install — the same "edit the generated file" mistake motu's
own registry rules warn about, made by the person who had just written a check for it.

## The `motu check` loop, measured and fixed

The hypothesis going in was that `check`'s failures do not teach. **That was wrong** — every message
names its fix. Extracting all 34 `check` invocations and their outputs from the six agent transcripts
shows something else:

| Run / arm | findings read | distinct | re-shown |
|---|---|---|---|
| run3-armA | 48 | 21 | **27 (56%)** |
| run2-armA | 10 | 6 | 4 (40%) |
| run2-armB | 12 | 8 | 4 (33%) |
| run3-armC | 2 | 1 | 1 (50%) |
| **all arms** | **72** | **36** | **36 (50%)** |

**Half of every finding an agent read in the loop was a repeat of one it had already seen.** The same
`rsc-boundary` line appeared seven times across seven consecutive runs in the worst arm. Cost: ~600 s
of CLI time over 34 calls, at 12–29 s each.

Three causes, none of them message quality:

1. **The report has no memory.** Every run re-presents everything, so the reader re-triages the whole
   list to find the one thing that moved. Findings do fall monotonically (9→7→5→5→13→5→4→0) — agents
   were making real progress and paying to re-read the unchanged part each cycle.
2. **One root cause emitted many findings.** `rsc-boundary` printed a line per offending module (three
   plus "…and 87 more"), so a single unfixable coupling was **28 of the 48** findings read in run 3.
3. **No priority.** A permanently-failing application coupling sat beside actionable integration
   errors at equal weight, with nothing saying which to act on.

### What was changed

- **One root cause, one finding.** `rsc-boundary` now emits a single error carrying the chain
  (`Also via …, and 87 other module(s)`) and says the part that matters for triage: *"This is the
  APPLICATION's own coupling: it does not change until that import chain does."* 4 findings → 1.
- **Delta reporting** (`packages/cli/src/lib/finding-memory.mjs`). Each finding is hashed, the set is
  remembered per COMMAND SCOPE in `.motu/cache`, and a repeat is marked `· unchanged` with the tally
  on the verdict line: `FAIL 1 error(s), 0 warning(s) · all unchanged since your last run`, or
  `· 4 unchanged, 1 new since your last run`.

Scoped by command because `island verify <one>` legitimately reports a fraction of what `check` does;
comparing across them would mark everything "new" and make the marker worthless. A run that recorded
nothing does not overwrite the memory — a command that died before printing has no opinion, and
letting it clear the memory would make the next delta a lie.

The verdict line was chosen deliberately: **every agent in the bench piped this report through
`tail`**, so the end is the only part reliably read.

## Fix round 4 — the framework-agnostic remainder

Skipped `vite-plugin-pwa` deliberately: that one is a specific host plugin's path resolution, and the
project would rather fix what is true of every host first.

**`region-root` now reads the `layout` EXPORT, not the whole file.** Arm C kept its `providers` (a DI
container, a Redux `Provider`, a router) in the module beside its frame — the natural place — and the
check reported the providers' own JSX, and a string from a button inside them, as the frame inventing
an arrangement. The adopter split the file to satisfy a check that was reading the wrong thing.
Verified by concatenating the providers back into the frame module: **PASS, 0 warnings**. Falls back
to the whole file when the export cannot be isolated, because judging nothing would be worse than
judging too much.

**Half of the "aliased export" finding did not survive reproduction.** `integrate check` already
resolves `const X = <binding>.Island` aliases; driving Arm C's exact shape
(`<ManageServersIsland slot=…>`) through it passes. Nothing was changed there. Arm C's report named
the right symptom and the wrong cause — the third agent diagnosis in this bench to do so, against two
that were exactly right.

**The other half was real, and it is the same mistake for the third time.** `removal-check`'s
CANDIDATE filter selected files by how their imports are SPELLED (`@motu/…`), so the page importing
its own composition root by a relative path — `./manage-servers-binding`, the normal spelling in a
page — was never loaded into the rewrite project. Its tags were never unwrapped, its import of the
deleted binding was left dangling, and removal "failed" pointing at the one file the surgery had
refused to touch. Now it also matches imports that RESOLVE to a motu-only file:

    PASS  the host typechecks with motu removed · 124 host file(s) scanned, 14 deleted, 1 unwrapped

host-app still passes (exit 0) — no regression on the project that already worked.

### The pattern worth acting on before it recurs

Three separate places asked *"does this string look like motu?"* instead of *"does this resolve to
motu?"*: the directory allowlist, the fixpoint seeding, and the candidate filter. Each was found by a
different agent on a different repository, and each looked like an isolated bug. They are one design
error repeated — a specifier is how a module is SPELLED, and spelling varies with where the importer
sits. Worth a sweep for the remaining instances rather than waiting for a fourth to be reported.

---

# Round 4 — a Rails host and a store motu does not own

Chosen for DISCOVERY, not measurement: the three previous targets were standalone React apps whose
state motu could own. Mastodon is a Rails application whose React frontend lives under
`app/javascript`, is built by Vite, and uses Redux. 28 invocations, 43% failed, all 6 steps completed.

**A first attempt was cancelled mid-run** (an unintended stop, not a result) after reaching step 2;
its journal and trace are kept at `runs/arm-d-partial/`, which gives the Vite-plugin wall below two
independent observations on the same repository.

## The deliverable was a NEGATIVE result, and it is the most useful thing here

`StoreAdapter`, `observeForeignStore` and `reads:` were **never exercised** — not because they failed,
but because the region did not need them. The agent followed "a host that already has a state
architecture should not move it into motu's store" literally: every Redux slice was left untouched,
and motu was given only three keys (`searchTerm`, `searchActive`, `searchResultIds`) that had been
page `useState`. Redux only had to be REACHABLE — a Provider — so the wrapped component's own hooks
would not throw.

So after four rounds the least-proven road in the framework is **still unproven**, and the reason
matters more than the fact: the natural adoption shape is *motu owns the UI-local state, the app keeps
its domain state, and the page reads both* — which needs none of that machinery. Either it serves a
rarer case than the docs imply, or a target must be chosen specifically to force it (an island
subscribing to an atom with no prop).

## What the shape found

| # | Finding | Witnesses |
|---|---|---|
| A | the Vite adapter folds the HOST's already-instantiated plugins into the LAGOON's config, whose `root`/`envDir` differ from what those closures captured — Mastodon's themes plugin threw `Unknown project directory` | 2 (also shlink's `vite-plugin-pwa`) |
| B | **motu bundles Vite 5.4.21; the host runs 8.2.1.** The host resolves bare `mastodon/…` via `resolve.tsconfigPaths`, a Vite 8 feature that is a SILENT NO-OP in 5.x — so `tsc` and the app's own dev server resolved fine while the lagoon 500'd on every bare import | 1 |
| C | `barrel` is not derived from `app`, so a non-`src/` layout crashes `archipelago create` with a raw ts-morph `File not found` instead of a motu message | 2 |
| D | `archipelago create` is not atomic: it wrote the archipelago file, crashed, and the retry then reported "already exists — nothing to do" while skipping the registry and barrel re-export it still owed | 1 |
| E | `removal-check`'s C2 rewriter can unwrap `<X.Island>` / `<X.Region>` but has **no fallback for a bare `useRegion()` hook call** — so removal fails on the very shape the docs recommend | 1 |
| F | `ArchipelagoProvider` renders a list without a React `key`, producing a console error | 2 (run 3 arm A saw it and could not reproduce it) |
| G | `hostViteConfig` is a real `lagoon.config.json` key, undocumented in `--help` and the CLI reference; found by reading the adapter's source | 1 |

Findings A and B are one theme: **the lagoon's build is not the host's build**, and every place it
borrows from the host without inheriting the host's context is a seam. A was dismissed earlier in this
bench as "too framework specific to fix" on the strength of the shlink sighting alone; the Mastodon
sighting shows it is one shared cause, and that dismissal was wrong.

## Post-run check (the protocol step this round introduced)

1. **Host build** — `yarn typecheck` exit 0, 0 errors against the 0-error baseline, verified
   independently rather than taken from the agent's report.
2. **Fresh-eyes look** — BELONGS, renders cleanly. Every string traced to the app's own `en.json`
   (`lists.search` -> "Search", `column_search.cancel` -> "Cancel"), both states resolved
   (`__motuLagoonState.ok: true`). It also caught finding F.
3. **Code read** — good. The page SHRANK (-40/+24) into the documented shape, and
   `list_search_header.tsx` is a genuine 73-line extraction over the app's own `ColumnSearchHeader`
   and `useSearchAccounts`, not a shim. One real cost: the adopter had to write
   `vite.config.motu-lagoon.mts`, a forked Vite config living in the app's repository — motu-only
   code of exactly the kind the rules warn against, and a direct consequence of findings A and B.

## Control vs Arm D — same repo, same feature

| | Control (no motu) | Arm D (motu) |
|---|---|---|
| tool calls | **26** | 174 *(includes adopting a framework)* |
| files | 1 modified (+14/−23), 1 new | 1 modified (+24/−40), 4 new |
| host typecheck | clean | clean |
| **ever rendered the screen** | **no** | **yes — fresh agent, both states** |
| verification | typecheck, eslint, re-reading `useSearchAccounts` | the above, plus two openable states read by an agent with no context |

**They converged on the same architecture**, which is worth saying before the contrast. The control
kept the search state OUT of Redux deliberately — *"it's UI-transient, per-mount, per-visit-to-this-
screen state… which is exactly what the original code already treated as local `useState`"* — and Arm
D, following motu's "a host that already has a state architecture should not move it into motu's
store", made the identical call: Redux untouched, motu given only the UI-local keys. **motu's rule
produced the design a careful engineer reached independently**, which is the strongest thing that can
be said for a rule.

The difference is what each could then CHECK.

The control's own stated worst risk is a **state-transition timing bug**: it moved the point where
search results become visible to the parent from inline `onSettled` logic into a `useEffect`, and
*"if there's a subtle timing difference… a one-frame flash of stale results when toggling search mode
on/off is a real possibility I can't rule out"*. It could not look, and said why: the screen needs
**Postgres, migrations, a seeded account and list, and an auth session** before it will mount at all.
So it shipped on `yarn typecheck`, `eslint` and reading — and recorded, exactly:

> *"I have not seen any of the four states (idle / searching / results / empty results) with my own
> eyes. Everything about their correctness is inferred."*

Arm D's region made two of those states **addressable URLs that need no backend at all**, and a fresh
agent confirmed both render Mastodon's own vocabulary. The states the control could not reach are
precisely the ones the lagoon hands you.

On ownership the answer is the same as the formbricks control, in the same words: asked whether
anything stops a second writer, *"Not really, structurally"* — a plain `useState` and a setter passed
by convention.

That is the honest shape of the comparison, and it is not "motu is faster": **26 tool calls against
174.** It is that the cheaper path ends with a change nobody has seen, whose author names a timing
risk they had no way to check, on a screen that costs a database and an auth session to look at once.

### Correction: file counts are not comparable artifacts

Every control comparison above reports files and tool calls side by side — "2 files vs 5", "26 calls
vs 174" — as though the two sides produced the same KIND of output. They did not. Part of what motu
costs is `*.evidence.ts`: island scenarios and region flows, which are executable regression coverage
that `motu check --runtime` drives. **Every control arm wrote zero tests.** Not "fewer" — none, in all
three, and none of them was asked to.

So the counts above understate motu twice over: its extra files include automated coverage, and the
control's smaller footprint is smaller partly because it leaves nothing behind that can fail later.
The honest way to read those tables is as ADOPTION COST, not as a like-for-like artifact count — and
adoption cost is motu's worst case, since it is paid once while the coverage accrues to every change
afterwards.

None of which is a measurement of VALUE. See the next section.

---

# Measuring VALUE: defect detection, not effort

Four rounds measured ADOPTION COST on a first change — motu's worst case, since adoption is paid once
while whatever it buys accrues afterwards. And effort could not settle the question anyway: runs 2 and
3 of the identical task on the identical CLI differed 2x on every metric, purely from the order an
agent worked in.

So: inject the SAME user-visible regression into two implementations of the SAME feature (formbricks'
sign-in screen, region vs props), run each side's own checks, and record what each CATCHES.
Deterministic, no agent in the loop. Harness: `bench/agent-cold-start/mutate.mjs`.

**The regressions were authored blind** by an agent given both implementations, asked for plausible
developer mistakes, and explicitly forbidden from investigating what tooling either side has — because
a mutation set written by the framework's author measures the author's imagination.

## Result: the props arm

Baseline clean on both gates. Then, per regression:

| gate | caught |
|---|---|
| `tsc` (the app's own typecheck) | **0** |
| `eslint` (the app's own config) | **0** |

Stronger than the table reads: two mutations (M2, M5) silently failed to revert mid-run, so later
typechecks ran with **three simultaneous regressions** in the file — an inverted disable condition and
two cross-wired providers at once — and the app's typecheck still passed. The control's own journal had
already conceded the principle: *"proves the types line up… proves nothing about runtime behavior,
timing, or actual pixels."* This puts a number on it.

## Result: the region arm could not be measured, and that IS the finding

Its baseline is red before any mutation — and not from a harness fault. Formbricks' `sso-options`
island reaches a Next server action, so it cannot be bundled for the lagoon; the exclusion fix keeps
the rest of the lagoon building, but that slot renders a placeholder, so any flow asserting its
content fails. Four of the eight regressions target that island.

**motu's defect detection is contingent on the region being previewable.** A host coupling that stops
an island bundling does not merely cost that island's preview — it removes detection for everything
asserted through it. Exclusion contains the blast radius for OTHER islands; it does not restore the
excluded one's coverage. That conditional belongs next to every claim motu makes about catching
regressions, and no effort-based round could have surfaced it.

## What this does and does not establish

ESTABLISHED: on this screen, with these eight blind regressions, the control's gates catch **none** —
including with several bugs live at once.

NOT ESTABLISHED: that motu would have caught them. That measurement needs a pairing whose region is
fully bundlable. Arm C's shlink region qualifies (green, with flows) but has no control implementation,
and the author of motu writing one would bias it.

Two flaws in the set, both found while running it rather than by inspection: **four of eight
regressions are the same class** (provider cross-wire), so any arm catching that class would score it
four times — results must be read by CLASS, not count; and three of those four are **ambiguous to
apply**, because cross-wiring one provider produces a line identical to another's. The harness refused
them rather than mutating the wrong line, which is the behaviour it was built for.

---

# The defect-detection table (shlink pairing)

The measurement formbricks could not support: one repository, one feature, two implementations, the
same eight blind-authored regressions injected into each, and each side's own checks run against them.
Deterministic, no agent in the loop. Both baselines green before anything was injected — the region's
static AND runtime, which is the precondition formbricks never met.

| gate | caught |
|---|---|
| **props** — `tsc` | 0 / 8 |
| **props** — `oxlint` | 0 / 8 |
| **props** — `npm test` (41 files, 237 tests) | **5 / 8** |
| **region** — `motu check` (static) | 0 / 8 |
| **region** — `archipelago verify --runtime` (4 flows) | **1 / 8** |

**motu lost, five to one.** That is the headline and it should not be softened.

## Why, and the part that is structural rather than a matter of effort

The obvious explanation is volume: shlink's suite is 237 tests written by its own developers over
years, and the region's evidence is four flows written by one agent in one session. The control agent
added no tests at all — the 5/8 is entirely shlink's pre-existing suite catching regressions in code
it already covered.

But volume is not the whole answer, and the rest matters more.

**A flow emits a DECLARED OUTPUT; it does not act on the UI.** `M6` breaks the search box's callback
so it ignores its argument — the user types and nothing filters. The region's flow drives
`emit: { slot: 'server-search', event: 'search-term', detail: 'staging' }`, which enters the region
*past* the broken callback, so the coupling still holds and the flow still passes. The control's tests
use a real interaction, and catch it.

That is a boundary of the model, not a gap in this region's evidence: **motu's flows verify that a
declared coupling carries, and cannot verify the path from a user's action to that declaration.** No
amount of additional flows fixes M6; a flow is the wrong instrument for it.

The two remaining misses (`M5`, `M7` — both about the auto-connect column) are the ordinary kind: no
flow asserts that column, and one could be written. `M1` (search stops matching URLs) is the same —
the flow's search term happens to match a name.

## What this does and does not say about motu

It does NOT say motu detects poorly in general. It says:

- **motu's coverage is exactly the evidence someone wrote, and nothing more.** It is not automatic. A
  region with four flows catches what four flows assert.
- **An established test suite over the same feature is a stronger detector of behavioural regressions**
  than a region's flows, and a project that has one should not be told otherwise.
- **Flows and tests catch different classes.** The five the tests caught are behavioural; motu's one
  catch (`M3`, the empty state inverted) is a RENDER assertion — the class that made the earlier
  perception catches possible, and the class a props-drilling test suite tends not to make.

The honest pitch that survives this table is narrower than "motu catches regressions": it is that
motu makes states ADDRESSABLE and RENDERABLE without a backend, that ownership is declared rather than
conventional, and that a fresh reader can be pointed at a URL. Those claims are supported by four
rounds of evidence. "Better regression detection than the project's own tests" is not, and this table
is the reason to stop implying it.

## Caveats that travel with the numbers

- The set was blind-authored, but **two edits were repaired by me**: `M1` was not type-preserving (it
  left a destructured binding unused, so it failed typecheck — scoring as a control "catch" of a
  malformed mutation), and `M2` could not be reverted because its REPLACEMENT text was not unique,
  which silently contaminated every later mutation in the first run. Both repairs kept the intended
  symptom and were applied symmetrically to both implementations.
- The first props run was invalid for a third reason: `ENOSPC` again, from vitest's own Vite watcher.
  `CHOKIDAR_USEPOLLING=1` fixed it. Fifth distinct place that limit has bitten.
- The two implementations derive from **different ancestor blobs** of the same original component, not
  a linear patch chain — found by the mutation author, not by me.
- One screen, eight regressions, one pairing. A case study with instrumentation.

## CORRECTION: the table above measures the wrong axis

The comparison is invalid as a judgement of motu, and the fault is in how it was designed.

The mutation author was asked for "plausible developer mistakes" on a screen that filters a list. It
produced what that request implies: **six of the eight are pure logic errors inside a component body**
— a narrowed filter predicate, a dropped `toLowerCase`, `some` where `every` was meant, an off-by-one
on a count. Those are unit-test-shaped by construction, and unit testing is a job motu deliberately
does not do. `motu check --help` states the boundary outright: *"motu check runs MOTU's gates only.
Your typecheck/linter are yours: `<host build> && motu check`."* No `tsc` and no test runner is invoked
by any motu check, on purpose.

So the table shows a tool losing a race it declines to enter, and reporting it as "motu lost 5 to 1"
would tell a reader something untrue about what motu attempts. The numbers are real; the framing they
invite is not.

**What survives from it, and is worth keeping:**

- **The structural finding stands, and is the valuable part.** A flow emits a DECLARED OUTPUT, so a
  bug in the path from a user's action to that declaration is invisible to it (`M6`: the search
  callback ignores its argument; the flow emits past the break and passes). That is a real boundary of
  the model, it is not fixable with more flows, and it belongs in the docs.
- **motu's one catch was a RENDER assertion** (`M3`, the empty state inverted) — the class that also
  produced the four perception catches across the rounds, and the class a props-drilling suite tends
  not to make.
- **The control added no tests.** Its 5/8 is shlink's own pre-existing suite catching regressions in
  code it already covered — which says something good about shlink, and nothing about either arm's
  approach to the change.

**The experiment that would actually measure motu** mutates the COMPOSITION rather than a component
body: an island placed in the wrong slot, a region key claimed by two writers, a page that stops
reading the region back, a slot wired to a neighbour's data, a provider removed so the island cannot
mount, a declared write that never fires. Several of those cannot even be expressed against the props
implementation, because it has no declaration to break — which is itself the comparison. That is the
table to build; the one above is not it.

---

# The composition-drift experiment — what motu actually sees

The previous set measured logic inside component bodies, which motu declines to check. This one
mutates the WIRING BETWEEN components: a value severed from its consumer, a component in the wrong
position, a callback dropped, a dependency removed so the page cannot mount. The author's test was
"if you deleted the component's body and kept its interface, would the bug still exist?"

## First, the flaw in my own set

I forbade the author from running any build, so it could not verify its edits were type-preserving —
and **only three of the eight (C3, C7, C8) compile on BOTH sides**. The other five fail `tsc` on one
side or the other, which measures the compiler rather than either arm's detection. That is my
instruction's fault, not the author's, and it shrinks the usable sample to three.

On the three valid ones: **props tests caught 2 (C7, C8); motu caught 0.**

## The finding, which does not depend on the sample size

Every uncaught region drift has one of two structural causes, and both are properties of the design
rather than gaps in this region's evidence:

**1. motu never renders the host page.** C3 (search box moved below the list) and C6 (a dependency
dropped from `withDependencies`, so the page crashes on load) both edit `ManageServers.tsx`. Every
motu runtime check — `region-flow`, `lagoon-render`, and **`archipelago snapshot`** — renders the
region through the LAGOON's own frame. The page is read only by `integrate check`, statically, by
regex. So a page that crashes on load leaves motu completely green.

I tested the snapshot case specifically, because arrangement is exactly what snapshots claim: created
a baseline, applied C3, re-ran `archipelago snapshot` — **PASS**. The arrangement changed on the page
and the picture did not, because the picture is of the region, not the page.

The host rules already gesture at this — *"the lagoon renders every declared slot unconditionally…
NOTHING proves the page reaches it"* — as a caveat about conditional placement. Measured, it is
broader: **the page's composition is unrendered by motu, entirely.**

**2. A flow emits past the component's own handler.** C4 strips `onChange` forwarding inside the
island's component, so the search box is inert; the flow emits the declared event directly and the
coupling still carries. Same boundary the previous set found with a logic mutation, now confirmed on a
wiring one.

## What motu did catch, and it is the right pair

- **C1 — a severed `bind`.** The region declared it reads `searchTerm`; the declaration was removed;
  `region-flow` failed. This is the class motu exists for and no unit test would state it, because in
  the props implementation the equivalent is just a prop nobody passes.
- **C5 — `removal-check`** caught a callback dropped at the composition root.

## What to do with this

The gap is specific and closable: **nothing renders the host page.** `integrate check` reads it with
regexes and cannot see whether the page mounts, whether a slot receives the right data, or whether the
arrangement is what was intended. Closing it means rendering the PAGE — the host's own test runner, or
a motu check that mounts the page rather than the region.

Until then the honest claim is narrow and still worth making: motu catches drift in what is DECLARED
(a binding removed, an owner changed, a region no longer composed) and previews every declared state
without a backend. It does not catch drift in the page that hosts the region, and it never sees inside
a component.

## Caveats

- Three usable mutations out of eight, for the reason above. This is a direction, not a rate.
- The author discarded a two-writer race because the feature has one producer and one setter on each
  side, so forcing a second writer meant inventing plumbing neither implementation has. motu's
  one-producer rule prevents a class this screen is too small to exhibit.
- Both trees restored byte-exactly after every run; all sixteen round-trips pre-verified before
  measuring.
