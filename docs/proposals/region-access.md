# Proposal — region access: motu's vocabulary on a running app

**Status:** stage 1 built (`motu lagoon try`, 2026-11-12). Stages 2–4 proposed.

## The gap

Playwright and motu see two halves of a running application, and neither half is enough alone.

| | Playwright | motu (today) |
|---|---|---|
| where | the real page | the lagoon (fixtures behind each port) |
| sees | DOM, network, pixels | regions, keys, who owns each, declared outputs, which source asked for which call |
| drives | selectors | declared outputs, accessible names |
| answers | "what does the screen show?" | "what does the region declare, and does the lagoon hold it?" |

Playwright does not know that `links` belongs to a source, that `revoke-requested` is the list's
declared output, or that the screen is MASKING a wrong state. motu knows all of that — inside the
lagoon only. Two consequences, both named in the host rules as unproven:

- **"NOTHING proves the page reaches it."** The lagoon renders every slot unconditionally and
  `integrate check` reads source; whether the real page's branches ever mount a slot is unasked.
- **"The adapter is yours to prove."** A source runs for real in the lagoon, but over a fixture port;
  the few lines that turn the backend's answer into the port's shape are exercised by nothing.

And one that only an agent's own work surfaced: **exploring needs a door.** Every motu check answers
"does this hold?" — a question you can only ask once you know what to assert. Before that, agents
explored by hand-writing `page.evaluate` against `window.__motuLagoon` (a private surface, rediscovered
by guessing) or by writing a flow and running a minutes-long verification to read its failure. A real
bug was found that way: a placeholder week holding another week's cards, masked by the island's own
guard — invisible to every check and to a screenshot, visible only in `snapshot()`.

## The idea

**Expose motu's declared vocabulary wherever the region runs**, with the same verbs everywhere:
read the keys (`snapshot`), see what each slot shows, fire a declared output (`emit`), let the host
move its state (`provide`), click by accessible name, list the calls that landed and who asked. Then an
agent with a browser drives and reads a running region in the APPLICATION'S terms, not the DOM's.

What it is NOT: remote eval. Every verb above is one the flows already have. Free-form JavaScript is the
escape hatch that turns the harness into "a browser test suite that happens to live in the repo"; the
declared verbs covered every diagnosis this proposal came from, and read-only state access is the one
piece of "eval" that earned its place — `snapshot()` already exists.

## Four stages, each useful alone

### 1. `motu lagoon try` — explore the lagoon (BUILT)

`motu lagoon try <region> [step…]` replays steps given on the command line as a one-off flow (the
`runRegionFlows` engine `motu diff` uses, traced) and prints what each step changed — keys `old → new`,
each slot's perceivable surface, calls. `--shot <dir>` pictures each step; `--keep "<name>"` appends it
to `<id>.evidence.ts`, only with the agent's own assertions and only if every step asserted something
and all of it held. Reference: [03-cli-reference](../03-cli-reference.md#motu-lagoon-try-region-step).

Measured on host-app: **~5s a run**, lagoon boot included — fast enough that no persistent session was
needed. A kept flow (`picking a shot opens it and arms its island's accept`) passed
`archipelago verify review --runtime` like any hand-written one.

Decisions worth keeping:
- **Assertions are never derived from the output.** Copied, they agree with themselves by construction.
  Steps the agent did not assert run under a placeholder that is never reported and never kept.
- **A run that did not happen says so** (exit 2): a lagoon that never mounted, or a port Chromium
  refuses (the first random port landed on 6668, the IRC range — the range is now 7300–7599).

### 2. A dev bridge on the real page — the same verbs, against the real backend

`createRegion` (dev builds only) exposes the same surface on the real page — `snapshot`, `emit`,
`provide`, `calls`, slot surfaces — under a stable name, so `motu lagoon try --target
http://localhost:3000/share?repo=…` drives the REAL page by region vocabulary with the command unchanged.
This is where the port's adapter finally runs: the real source over the real routes.

To find out first: what `@motu/adapter-next` already exposes in dev mode. Constraints:
- **Never in a production build** — gated at build time, not by a runtime flag a request can flip.
- **Write verbs reach a real backend.** `emit revoke-requested` on a real page revokes a real link, so
  the bridge belongs on dev/staging environments with seeded data, and asks for a token.
- **A host with its own store** (Jotai, Zustand…) is read through its existing `StoreAdapter`; motu only
  audits such a store, so the bridge writes through declared outputs only, as everywhere else.

### 3. `motu diff --against <url>` — the lagoon and the real page, flow by flow

Replay a region's flows in the lagoon AND on the real page (stage 2), and compare per step what
`motu diff` already compares between two commits: keys, slot surfaces, calls. A slot the lagoon renders
and the page never reaches, a key the real adapter shapes differently from the fixture, a call the page
makes that no flow declared — each becomes a finding with an id, explained or fixed like any `diff`
finding. This is the stage that closes both gaps named at the top.

The real environment is not deterministic (clock, data, timing; no worlds). The comparison must name
which keys and calls it holds equal and which it tolerates, or it cries wolf.

### 4. Production, read-only — folded into coverage

The same bridge with READ verbs only, in production: snapshots of region state, recorded as shapes
rather than values, which is what `motu coverage` already collects ("which states did production
reach that no flow previews?"). Stage 4 is coverage generalised, not a new channel.

## What this does not change

motu still checks composition. None of this tests the logic inside a component, and none of it makes
a green run on a real page proof that the backend is correct — only that the region, the page and the
port agree on what they exchange.
