---
name: motu-evidence
description: The motu rules for EVIDENCE and LOOKING, in full: island scenarios and region flows (seed, emit, click, provide, expect, expectRender, expectCalls), where evidence lives and how it is typed, the lagoon override map (layout, seed, channels, wire), worlds, state addresses (`motu lagoon states`), exploring with `motu lagoon try`, flows that can fail (flow-mutation, null-island, render coverage), undeclared calls, `motu diff`, the fresh-agent final look, visual baselines, the lens, publishing. Load before writing or changing any *.evidence.ts, lagoon override, world or flow, and before the final look.
---

# motu-evidence — Evidence and looking

The rules for evidence and for looking at what you built — the detail behind the short `motu:rules` block in the project's instructions. Read the part you need; each section stands alone.

## The rules

- NEW UI content starts as an island with at least one scenario in its `*.evidence.ts`, and is looked
   at in the lagoon (`motu lagoon serve --watch`, or `motu island verify <name>`) BEFORE it is placed
   on a page. An island must render from defaults alone — every input optional, with a default.

 - AND LOOK AT IT AGAIN AT THE END, whether or not anything failed. Every other instruction to look is
   conditioned on a DIFFERENCE, and new work has none by construction: the snapshot run reports every
   shot as `new`, goes green, and asks for nothing. That is the one moment looking matters most. A
   run with `new` shots says `LOOK` instead of `PASS` for this reason — open the region view, read
   the screen, and only then accept. Twice this has caught what no check could: a fixture inventing a
   vocabulary the application does not use, and an island stylesheet that was bundled and never
   applied. Both passed every check; both were found by opening the page.

 - WHO LOOKS IS PART OF THE CHECK, and it is not you. The look is an AGENT's — a rendered state read
   by something that can perceive it — but the agent that BUILT the region is the worst possible
   reader of it. Both catches above were an INVENTION rather than a drift, and an invention sits in
   its author's context as a PREMISE: a fixture's vocabulary looks right to whoever chose it, every
   time. So spawn a FRESH agent for the final look, and hand it exactly three things — the state's
   URL (`motu lagoon states`), where the application's own vocabulary lives (the types, the modules
   the region names), and the question. Do NOT hand it the diff, the plan, the transcript or your
   reasoning: those are the contamination you are spending a subagent to avoid. Ask it: *does this
   screen belong to THIS application — does anything render a word, a state or a shape the app never
   uses?* One subagent, and it is the only check in the set that can catch something invented whole.
   Two tiers, and they catch different things: ASSERTIONS catch drift — an artifact contradicting
   what it declares, which is why `tsc` is the first and cheapest of them, the app's own types
   failing the moment a rename lands on a region that no longer matches. PERCEPTION catches
   invention — an artifact that contradicts nothing, passes everything, and describes an application
   that does not exist. No mechanical check reaches the second, because every mechanical check
   compares the artifact to itself; rendering is what forces it to be compared to the world.

 - THE SAME GOES FOR THE DECLARATION. Before islands are built on a new or changed archipelago, a fresh
   agent reads it back: given the archipelago, where the app's vocabulary lives, and the question
   *what does this region promise, and what does it permit that a reasonable person would not
   expect?* — a key with no producer, a key nobody reads, an owner its name does not suggest. Never the
   survey, the plan or the transcript. An invented ownership hides in its author's context exactly as
   an invented vocabulary does, and everything built afterwards is proved AGAINST it. The survey marks
   every key, owner and slot as stated, inferred or default; the inferred and default ones, with the
   read-back, are what a person reviews.

 - CHANGED UI starts with the scenario that shows the state you are about to change. Then change it,
   look at it, and keep the scenario as the regression. A scenario set whose members render identically
   fails `data-flow` — that check exists because fake evidence is worse than none.

 - A region declares its FLOWS in `<id>.evidence.ts` beside the archipelago: a seed, an island's
   declared `emit`, and the keys the region must hold afterwards. That is where a coupling becomes
   something that runs — `motu archipelago verify --runtime` fails when a flow no longer ends as
   declared. A flow may only fire a declared output; if you reach for a selector, you have left the
   harness and written a browser test.

 - EVIDENCE lives in evidence files, and the lagoon is not one. An island's scenarios go in
   `<name>.evidence.ts`, a region's flows in `<id>.evidence.ts`, and anything BOTH need goes in one
   module they import with a RELATIVE specifier — `@/` does not resolve in the loaders that read
   these files, and the failure is silent (the island keeps its scenarios in one check and loses them
   in another). Type that module against the APP's own types with `import type`: it erases at
   runtime, so the loaders are unaffected, and a renamed field then fails the build there instead of
   quietly previewing last month's shape. Invented data in a lagoon frame is a third copy nobody
   diffs.

 - The lagoon override file is a MAP, not a page. `layout` points at the APPLICATION's own layout
   component — never a second JSX copy of the arrangement, which drifts for the same reason a second
   copy of the region's vocabulary does. `seed` is data. Anything that REACTS has one of TWO homes,
   and neither is the frame. A `channel` installs the application's own SOURCE over a port, which is
   what answers an island's intent. The WIRE — `wireFrom({ to, appRoutes, tables, fixtures })`, a
   `wire` field beside `channels` — answers HTTP BENEATH the app's real service, so the service itself
   runs instead of being replaced. Reach for the wire when the app's own client code is what you want
   exercised, and for a channel when the region needs a key fed; a region commonly has both. Both are
   installed for every view, which is the property that matters: the checks that drive the region see
   the same answers a human does. What fired is legible either way — the lens shows a channel, and
   `data-reach` / `provenance` show what went over the wire. Behaviour written inside the frame runs
   only in the region view, where those checks are not.

 - VISUAL BASELINES live on the lagoon host, not in the repository: `motu island snapshot --all
   --remote` pictures every island (scenario × viewport) and `motu archipelago snapshot --all --remote`
   pictures the COMPOSED page — the arrangement, which is not declared and which no island shot can
   see. A difference writes `.actual.png` and `.diff.png` under `.motu/snapshots/` — LOOK at them, then
   `motu island snapshot --accept <name>` only when the change is what you intended. Accepting is a
   DECISION, which is why it is its own command: `--update` overwriting files is what made "the
   baseline is stale" and "you broke something" the same red. Never use `--update` on a project whose
   baselines are on the host — it starts a second, drifting copy. A region diff names which member
   islands also changed; when none did, the arrangement moved.

 - EVERY DECLARED STATE IS AN ADDRESS — do not hand-drive the store to look at one. `motu lagoon
   states` lists them (`--json`, `--base <url>`): an island's scenario is
   `/?target=island:<tag>&scenario=<name-or-slug>`, a region's flow is
   `/?region=<id>&flow=<name>&step=<n>`, with `step` stopping the replay early so the states BETWEEN
   the steps are reachable too. A WHAT-IF — an island's scenario played INSIDE its region, the rest
   live — is `/?region=<id>&state=<id>.scenario.<tag>.<slug>`, the same string the dock's Share
   copies, and a screen is `/?screen=<id>`. ALL are the gallery — the entry `serve` and `publish`
   build and the one a person opens. An island opens ALONE there, through the same one-slot mount `island verify`
   drives, so a standalone island (in no region) is addressable too. That is how you
   look at the state you are about to change, and how you hand someone a link to it. A name that
   resolves to nothing REFUSES to render — banner, console error, `window.__motuLagoonState.ok:
   false` — because being handed the default state while believing it is the one you named is the
   failure worth engineering against. Read `window.__motuLagoonState` before believing a screenshot.

 - EXPLORE BEFORE YOU ASSERT, with `motu lagoon try <region> [step…]` — not a hand-written
   `page.evaluate` against `window.__motuLagoon`, and not a flow you run for minutes to read its failure.
   It replays the steps you give it (the verbs a flow has: `in <world>`, `seed <key>=<json>`, `click <name>`,
   `emit <slot>:<event> [json]`, `provide <key>=<json>`) in about five seconds and prints what EACH step
   changed: the region's keys (`old → new`), what each slot shows, the calls that landed; `--shot <dir>`
   pictures every step. Reach for it before writing a flow, and whenever the screen and the state may
   disagree — a state the screen MASKS (the right page drawn over the wrong keys) is invisible to every
   check and to a screenshot, and shows here as a key that moved. When you know what should hold, add
   YOUR assertions (`shows <slot>: <text>`, `hides …`, `holds <key>=<json>`) — never copied from the
   output, which agrees with itself by construction — and `--keep "<name>"` appends the flow to
   `<id>.evidence.ts` only if every step asserts something and all of it held. No selectors and no eval:
   if you need either, you have left the harness. Exit 2 means it could not run — retry, do not repair.

 - The lens is the DOCK's Seams tab — **Ctrl/Cmd-K**, then `Seams` — and it opens on the REGION SHEET:
   one row per key, who owns it, who reads it, what it holds, whether it has moved, and a flag where a
   declared write has never fired or the host answered an island. Read it before reading the
   archipelago; it is the same declaration, proved by the region that is running. Below the sheet,
   FEEDS is the channels and ASKED FOR is every outbound ask through all three doors — contract,
   traced host module, wire — each row naming the door and the owner (`island:<tag>` / `source:<id>`).
   WHERE IT EXISTS MATTERS: the dock is drawn by whoever HOSTS the lagoon — `motu lagoon serve`, or the
   motu host, which wraps every published lagoon in a shell — so the GALLERY and
   any hosted lagoon URL have it, while the focused standalone entry (`lagoon.html`, what
   `motu island verify` drives) does not, and neither does `/__motu_frame`, the artifact by itself.
   Ctrl/Cmd-Shift-G is the OLD standalone debug overlay (`mountDebugOverlay`), which the gallery does
   not mount; pressing it there does nothing.

 - SHOW YOUR WORK on the shared lagoon host, don't stand up another server. `motu lagoon publish
   --remote` (no argument — the URL and token live in `~/.config/motu/host.json`) uploads the
   self-contained page and prints two URLs: `latest`, which follows every publish, and an immutable
   one keyed by the commit. That is how a human looks at what you built without your process staying
   alive. The rule is ONE long-running host plus occasional spawns: `motu lagoon serve --watch` /
   `lagoon serve --watch` while you iterate, killed when you stop. A second permanent preview
   server is what the host replaces.
   Absolute asset paths (`/images/…`) work on a local lagoon and 404 once hosted — the publish output
   warns about them, and the warning is a finding.

## A flow the host drives, asserted on what renders

A region whose islands only READ has no `emit` to declare — and it still has a promise. Use a
`provide` step (the app moving its own state) and end on `expectRender`, not on `expect`.

`expect` names region keys, so a step whose `expect` names the key its own `provide`/`emit` targets
cannot fail unless the lagoon itself is broken. The assertion worth writing is what ANOTHER island
shows: Twenty's record page proves `editingWidgetId` moves exactly one of two widgets, in both
directions, and back to neither. Negate one clause and re-run before believing a green flow — a step
that cannot fail is not a check.

## A call nothing declared fails the flow

Every backend call a flow step causes is held to a declaration (`flow-calls`): one no fixture, table or
route answered fails the step and names what to declare. Never make an island swallow the error to pass
it. A failure a fixture asks for (`status: 500`) does not count. `expectCalls` on a step is the other
half — the calls that state may make, and only those (`[]`: it asks for nothing), answered or not. Screens are held to it too, since the
app's layout makes calls no region's flow does, and a screen can declare flows of its own
(`src/screens/screens.evidence.ts`: `click` the app's link or `navigate`, then `expectScreen` /
`expectRender`). `motu screen verify [id]`; `motu check --runtime` includes it.

With coverage on, prove production reports arrive: `motu coverage doctor --url <production origin>`
after a deploy names the failing hop. `motu coverage init` writes the route (`--mode log` for a server
with no outbound network, collected later by `motu coverage pull --from <log>`).

## Say what a change did to the flows

Before handing over, `motu diff --base <branch point> --json` replays the touched regions' flows at the
base and now and lists every change to keys, renders, calls and declarations. Fix each finding or
explain it (`--explain file.json`, `{ "<id>": "<why it was intended>" }`) until it exits 0, and quote
the explanations in your report. A `locked` finding cannot be explained: behaviour moved in a region
whose archipelago and evidence did not, so fix it or change the declaration. List every SPEC CHANGE
in your report, and every `weakens` one with the reason — never weaken a flow to make it pass.

## A flow step must be able to fail

`flow-mutation` runs with the region's flows and asks whether they could have failed. Two rules:

- **By construction** — a step whose `expect` names only keys that same step `provide`d asserts that
  the lagoon stored what it was handed. Decidable without a browser, and always an error.
- **By mutation** — each assertion-bearing step is re-run with its stimulus changed (a value the
  region cannot mistake for the real one). If the assertion still holds, it does not depend on the
  input and is asserting a constant.

Write flows that survive both: end on a key another island produces, or on `expectRender` of an
island that is NOT the one being driven.

Know the limit. A stand-in's invented vocabulary passes both rules — an assertion on text you wrote
into a stub is perfectly sensitive to its stimulus. Only rendering the application's own component
makes that visible, which is why an island on a host that owns the component IS that component.

## An island ships with evidence that asserts its OWN render

Two agents added an island to one region in parallel. Both wrote correct islands; the merge is where
it went wrong, and no check caught it.

Both had extended the lagoon frame's `rowFor` ternary — whose fallback was the NOTES row — so taking
either side of that conflict alone makes the other agent's widget render as Notes. Wrong, and
rendering. `archipelago verify` was byte-identical between the correct and the naive resolution: the
frame is ARRANGEMENT, it is not declared, and nothing checks it. The only thing that would have
distinguished them is a flow asserting on the new island's own rendered content — which neither agent
wrote, because nothing required it.

So: adding an island means adding a step to `<id>.evidence.ts` that asserts what THAT island renders.
Not the region's existing steps — its own. `render-coverage` names the slots no flow looks at.

`expectRender` asserts what a person can PERCEIVE in that slot, not one DOM property: rendered text,
a control's accessible name (`aria-label`/`alt`/`title`), a field's current value, a checkbox's
`checked`/`unchecked` state, and a control's announced state as `<name> pressed|selected|current`
(`aria-pressed`, `aria-selected`, `aria-current` — a toggle group's value is not text otherwise). `innerText` alone could not see a passenger's name in an input or a
seat's identity in an aria-label, which left an island made of form controls with almost nothing
assertable. Widening the haystack does not weaken the check — a wrong value and another island's text
both still fail — and the failure message prints the whole surface, so what WAS there is visible.

A step may assert with NO stimulus. Some islands take no input — Twenty's tasks and timeline widgets
ignore the row they are bound to and render from the record context — so `provide`ing something just
to have a stimulus produces a constant, and `flow-mutation` will (correctly) reject it. Write
`{ expectRender: { '<slot>': '<text>' } }` alone: the claim is "this slot renders THIS island", which
is not a data flow and is still worth making.

Two smaller ones from the same run. Prefer an append-only LOOKUP over a ternary chain in a frame two
people may extend. And if you use git worktrees, do not symlink `node_modules` into them: `git add -A`
commits the symlink, the merge replaces the real directory with it, and the next build dies on ELOOP.

## A state no flow can reach is a WORLD, not a seed

When the state you need depends on what the app is ANSWERED — a paused member, a slow or empty backend,
no week generated yet — do not seed the keys it shows. A key a running source produces is PINNED once
seeded, and the source can never move it: the flow then proves the lagoon stored what you wrote. Declare
a world (`defineWorlds` in the lagoon override module, exported as `worlds`) that re-answers the source's

PORT (`regions.<id>.channels.<source>: [args]`) or a stand-in's FACT (`worldFact(name, fallback)`), and
name it on the flow (`world: '<id>'`). `world-pins` refuses the seed; `world-differs` replays the flow
without its world and warns when nothing changes; `world-used` flags a world no flow names. A world never
touches the app's code or the arrangement. If the state still cannot be reached because the PAGE derives
it in an effect, that is a finding about the page — say so; do not grow the world to imitate the effect.

## Where an island's input came from

The lagoon replaces a host module so completely that nothing shows a fetch happened: no request, no
network row, and the lens shows the KEYS that resulted, never the question that produced them. Looking
at a region and seeing no HTTP at all is accurate and tells you nothing.

ONE LEDGER, THREE DOORS. An ask leaves by the CONTRACT (a `call()` the transport answers), by a

TRACED HOST MODULE (a stub wrapping its exports in `traced(module, fn, impl)`), or by the WIRE (a fake
`fetch` beneath the app's own client). All three record to `recordOutbound` in `@motujs/core`, and both
readers — `provenance` and the lens's ASKED FOR block — group by door and name who asked:

    ✓ provenance  asked for: contract: shots.list() ×2 · wire: table:shots(select) — by island:shot-list, source:shots

`contract.effects` says which host modules an island IMPORTS; this says which it CALLED, with what arguments,
and how often. Two things become visible that nothing else catches: an island that renders content
while calling NOTHING (its data came from somewhere it never declared), and a module it imports but
never reaches (a stale `effects` entry, or a stub standing in for something unused).

WHO ASKED IS PART OF THE ANSWER, and leaving it out cost a lens that lied. A declared SOURCE reads
inside a channel, at region level, so its ambient island is null — and the lens filtered its

ASKED FOR list on "has an island", which is not a filter but a deletion. On a region fed by a source
it printed 0 asks and *"everything on screen came from the seed"* directly under a FEEDS row saying
that source had fired ×44 a second earlier. An empty list is survivable; an empty list with a
confident wrong explanation is what makes people stop reading the surface built to answer this.

It is also the integration list. The calls recorded here are exactly what the real page has to answer,
which is the closest thing motu has to confronting the lagoon with the page it targets.
