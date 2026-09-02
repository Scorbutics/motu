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
