# Cold-start bench — how motu behaves for a stranger

A replayable measurement of what happens when an agent that has never seen motu adopts it into an
application it has never seen, builds a region, and lands that region on a real page.

It exists because the questions motu needs answered before a public release are not answerable from
inside this repository. Every consumer in here — `demo-app`, `host-app`, the review console — was
built by someone who already knew the model. The friction that decides whether a stranger gets past
the first hour is invisible to all of them.

## What it measures, and why each number

The instrument is `shim/motu`: it replaces `~/.local/bin/motu` for the duration of a run and appends
one JSONL record per invocation (argv, cwd, exit code, duration). Nothing an agent reports about
itself is trusted for the countable half — an agent that ran the same failing command twice almost
never says so.

| Number | Question it answers |
|---|---|
| invocations from `init` to the first opened lagoon state | how long the on-ramp is |
| failed-invocation ratio | how often the CLI says no |
| **verbatim retries** — same argv, again, after a non-zero exit | whether the error message *taught*. The sharpest single reading in the set: an agent that understood the failure changes the command |
| exit 1 vs exit 2 | whether the three-outcome design holds under an agent that cannot ask a human |
| doc dives / source dives (journal) | how much of the framework lives outside the CLI's own speech. A Show HN reader has `--help` and a README, not `packages/` |
| last-mile delta (journal) | files touched, and surprises, between "green in the lagoon" and "green on the page". Uneventful = ≤2 files, 0 surprises |
| did the fresh-eyes look catch an invention | whether the perception tier earns the subagent it costs |

Pre-registered expectations, written before the run so they cannot be fitted afterwards, are in
`EXPECTATIONS.md`.

## Arms

| Arm | Repo | Host | Kit | Tests |
|---|---|---|---|---|
| `arm-a-next` | formbricks `apps/web` | `--host next` | CLI + docs, **no skills** | the flagship Next path: `@/` alias, Tailwind, `next/*` stubs; a sign-in region (form, pending, server failure, navigation) |
| `arm-b-vite` | novu `apps/dashboard` | Vite + TS | CLI + docs + **skills** | contexts, react-query, page-level `useState` that several parts share |
| `control` | formbricks worktree | — | the app's own toolchain, no motu | the same change by hand: did it ever get *looked at*, and where did the shared state end up |

The `motu init` rules block is NOT a variable: `init` writes it into every adopting repo, so having
it is what a stranger actually gets. The skills are the variable between A and B — with the caveat
that host and kit are confounded across the two arms, which is a cost of running two arms instead of
four and is reported as such rather than papered over.

## Replaying it

```sh
sh install-shim.sh                 # trace every motu invocation
# ... run the arms (prompts/) ...
node analyze.mjs                   # the countable half
sh uninstall-shim.sh               # restore ~/.local/bin/motu
```

`prompts/_journal-spec.md` is shared by every arm and defines the journal each one writes to
`/home/scorbutics/dev/motu-bench/runs/<arm>/journal.md`. `analyze.mjs` attributes invocations to arms
by working directory, so a new arm means one line in its `ARMS` table.

Environment prep — cloning, installing, and getting each app's own typecheck GREEN before motu is
introduced — is done by the orchestrator, not the arms. A red baseline makes the last-mile number
meaningless, and an agent that spends its budget repairing someone else's build measures nothing.

## What this bench cannot tell you

- One run per arm. These are case studies with instrumentation, not a sample.
- Host and kit are confounded (above).
- The agent is not a person. It reads faster, complains less, and never walks away — so the
  friction counts here are a *lower* bound on what a human would feel, not an estimate of it.

## After every run: look at what it left behind

An arm's journal says what the agent believes it did. The trace says what it ran. **Neither says
whether the result is any good**, and for three rounds nothing checked that — the gap was noticed by
the person reading the reports, not by the protocol. So this is a step, not a habit:

1. **Does the HOST still work?** Run the application's own gate — `pnpm typecheck`, `npm run types`,
   `yarn typecheck` — and diff against the arm's recorded baseline. A region that landed on a page
   while breaking the app's build is a failed run however green motu is.
2. **Does the lagoon still render, and does it look like the application?** Boot it
   (`motu lagoon dev`, or `serve` when the build survives), open a state from `motu lagoon states`,
   and read the screen. **This must be a FRESH agent** — the one that built the region is the worst
   reader of it, for the reason CLAUDE.md gives — handed only the URL, the app's own components and
   vocabulary, and the question "does this screen belong to THIS application?".
3. **Read the code the agent wrote.** Not the diff stat — the files. An island wrapper that duplicates
   a component instead of wrapping it, a frame that redraws the page's arrangement, a `bind` that
   launders one island's output into another's input, an evidence file whose scenarios do not differ:
   all of these pass every check and are the wrong shape. `motu check` cannot see taste.
4. **Record the answer in RESULTS.md even when it is "fine"** — an unlooked-at run is not evidence,
   and "we looked and it was fine" is a different claim from "we did not look".

The first three rounds were graded on journals, traces and the arms' own fresh-eyes looks. Steps 1
and 3 were done ad hoc where something drew attention, and not systematically — so any claim in this
file about code QUALITY, as opposed to defects found, is weaker than the claims about the defects.

## Grading

The countable half is `analyze.mjs` and needs no judgement. The qualitative half — reading the
journals, deciding which FRICTION entries are motu's model versus this repository's accidents — is
done by the orchestrator, not by a separate grader agent. That is a deliberate cost trade and it
leaves a known bias: the orchestrator is the person who wrote the prompts. Two mitigations, both
weak, both stated rather than hidden: the pre-registered expectations in `EXPECTATIONS.md` fix the
claims before the data arrives, and every count in the report traces back to a line in
`trace.jsonl` or a quoted journal entry, so a reader can re-grade it.

The one judgement that is NOT the orchestrator's is the perception check (`prompts/perception.md`) —
a fresh agent, given three things and nothing else, because the whole value of that check is that its
reader has no premises from the build.
