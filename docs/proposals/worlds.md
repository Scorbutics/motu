# Proposal: worlds

**Status:** sketch, not implemented. Builds on [08: the lagoon override file](../08-lagoon.md) (`seed`,
`channels`, `wire`) and [10: flows](../10-evidence-and-testing.md).

## The gap

A flow can only drive what the lagoon was handed at boot. The lagoon's answers are fixed once for every
flow:
- the member the app sees;
- what each source's port returns;
- the wire's tables;
- the clock.

Three states can therefore never be reached by any flow, region or screen:

- **a member who is paused**, or who opted out of the directory. These are facts about the member, and
  in Peps the member stand-in is a constant (`motu/roots/lagoon/src/host-stubs/member-context.tsx`).
- **no week created yet** (`hasNoCurrentWeek: true`). The week source answers from one fixture list
  (`WEEKS` in `src/shared/actions-evidence.ts`), so that answer is the same for every flow.
- **a different "now"**. The clock is a constant too (`host-stubs/clock-context.tsx`).

Production reaches all three. `motu archipelago coverage actions --runtime` reports them as
uncovered, and its only advice, "widen the flow seeds", is wrong for them.
- **Seeding a key a source produces pins it.** The source can no longer move it, which is how Peps' week
  navigator came to show a past week while the region still held the current one.
- **A member fact is not a region key at all**, so no seed can set it.

## The idea: a world names answers motu already declares

A **world** is a named overlay on what the lagoon override file already declares. It adds no new kind
of thing. Today's lagoon is the `default` world, and a world only says what differs from it.

```ts
// motu/roots/lagoon/src/lagoon.tsx, beside `regions`. Lagoon-only, like every other override.
export const worlds = defineWorlds({
  'member-paused': {
    // Fields the member stand-in already has (`inactiveFrom`, `inactiveUntil`); a world fills them in.
    facts: { member: { ...LAGOON_MEMBER, inactiveFrom: '2026-08-10', inactiveUntil: '2026-09-07' } },
  },
  'no-week-yet': {
    // Re-answers the week source's PORT. The source itself still runs, so `hasNoCurrentWeek`
    // is derived by the app's own code, not written down here.
    // Same options as the default world's `week` channel; only the port differs.
    regions: { actions: { channels: { week: [actionsWeekFixtures.without(34), WEEK_OPTIONS] } } },
  },
});
```

A world may re-answer **only** these, all of them already declared today:

| Field | Overlays | Already declared as |
| --- | --- | --- |
| `regions.<id>.seed` | a region's starting state | `overridesFor(…, { seed })` |
| `regions.<id>.channels.<source>` | the `args` a source is installed with: its port, its options | `channelFrom({ id, args })` |
| `regions.<id>.wire` | tables and fixtures under the app's own client | `wireFrom({ tables, fixtures })` |
| `regions.<id>.props` | what the page passes an island that is not region state | `overridesFor(…, { props })` |
| `facts.<name>` | a value a lagoon stand-in reads instead of a constant | *new: the one addition* |

**Never in a world:**
- **The arrangement** (`layout`, `slots`, `providers`) and the islands. A world changes what the app is
  answered, never what the app is.
- **The app's code.** A world cannot replace a component or a source; it can only re-answer them.

### Flows name their world

```ts
{ name: 'a paused member sees when they come back', world: 'member-paused', steps: [
  // Asserts the app's own pause banner. The text is read off the rendered state when the flow is
  // written, as with any `expectRender`; it is not chosen here.
  { expectRender: { 'activity-notice': '<the pause banner as the app renders it>' } },
] }
```

- **One optional field, `world`**, on a region flow and on a screen flow. Absent means `default`, so
  every existing flow is unchanged.
- **Flow seeds layer on top of the world.** A flow seeding a key that its world's sources produce is
  the pinning trap above, and is reported (see Checks).

### Every world is an address

- **`?world=<id>` composes with every existing address:** `?region=actions&flow=…&world=no-week-yet`,
  `?screen=club&world=member-paused`.
- **A world that does not exist refuses to render**, as every unresolved address does.
- **`motu lagoon states` lists each flow at the world it names.** It does not list every flow × every
  world: a combination nobody declared is not a state anyone claimed.

## Impact on the host app

The aim is that a host adopts worlds without touching application code. Nothing in the app's
production bundle depends on any of this.

| Part of the host | Change |
| --- | --- |
| **Application code** (pages, components, services, sources) | **None.** Sources are already installed with `args` from the override file, and a world only supplies different args. |
| **Production bundle, deploy, coverage beacon** | **None.** Worlds are lagoon-only, like `seed` and `channels`. |
| **The lagoon override file** (`motu/roots/lagoon/src/…`) | Add `worlds`, only when a flow needs one. A project with none changes nothing. |
| **Lagoon stand-ins that hard-code a fact** | One line each: the constant becomes `worldFact('member', LAGOON_MEMBER)`. In Peps that is two files, `member-context.tsx` and `clock-context.tsx`, both in `motu/roots/lagoon`. A project whose stand-ins read data from the wire needs nothing. |
| **Fixture modules** (`src/shared/*-evidence.ts`) | Only where a world needs a variant of an answer. A port fixture becomes a small factory (`actionsWeekFixtures.without(34)`) instead of a constant. These are motu-side files, typed against the app's types as today. |
| **Flows** (`*.evidence.ts`) | `world: '<id>'` on the flows that need one. |
| **`removal-check`** | Unaffected. Everything above is under `motu/`, which removal deletes. |

**The one real cost** falls on projects whose stand-ins hold facts as constants: they make each such
fact readable once. It is a lagoon-file change, never an app change, and it is the same move Peps
already made for its sources: install the app's own object over answers chosen in the lagoon.

## How it runs

- **Switching world re-aims; it does not reboot.** The lagoon remounts the regions on screen and
  reinstalls their channels with that world's args. That is the same path a scenario reset already
  takes, so a check that runs flows in three worlds pays for three remounts, not three boots.
- **`facts` are read by stand-ins through `worldFact(name, fallback)`** from `@motu/react`. It returns
  the fallback when no world sets the fact, so a stand-in that adopts it changes nothing until a world
  uses it.
- **The dock's States tab groups flows by world**, and shows the world beside the flow on the bar
  ("a paused member … · member-paused").

## Checks: each catches a way it goes wrong

| Check | Fails when | Why |
| --- | --- | --- |
| `world-declared` | a flow names a world that does not exist; a world overrides a region, source or slot that does not exist | the same "a name must resolve" rule as addresses |
| `world-used` | a world no flow names (a warning) | the roadmap's rule: nothing without a caller. An unused world is a removal candidate |
| `world-pins` | a flow in a world seeds a key one of that region's sources produces | the trap that hid the past week. The source must stay the producer |
| `world-differs` | a world's flows render the same as `default` (by mutation: drop the world and replay) | a world that changes nothing is decoration. Same bar as `flow-mutation` |

`motu diff` traces each flow at its own world, so a change to a world's answers shows up as a change to
the flows that use it.

## Coverage: why this is the piece "Later" needs

An uncovered production state is described by the keys it differs on from the nearest previewed one.
motu already knows which source **produces** each key (`sources.<id>.produces`). So the report can say
which world is missing instead of "widen the seeds":

```
50%  hasNoCurrentWeek:true isCurrentWeek:false
     produced by source `week` — a world where its port answers no current week
     (no flow previews it; `motu lagoon states` has no such world)
```

- **Keys the region owns** keep today's advice: write a flow.
- **Keys a source produces** get this one: re-answer the source in a world. Hand-writing them into a
  seed was the wrong advice.
- **Member facts** get a fact name. Production cannot send member facts (the corpus holds region keys
  only), so the report can only point at the keys a member fact drives (`activityNoticeKind`,
  `pausedUntil`).

## What it does not do

- **It does not combine worlds automatically.** A world may `extends: 'member-paused'` to build on
  another, explicitly. Cartesian products of worlds are not states anyone declared.
- **It does not change the app's sources or services.** If a state is unreachable because the app's own
  code cannot produce it from any answer, no world will reach it, and that is a finding about the app.
- **It does not replace screen flows.** A screen flow chooses a world like a region flow does. Worlds
  are what both kinds of flow start from.

## Open questions

1. **Per-world clock.** Should `now` be one more fact, or something every world has? Peps today has two
   clocks (the stand-in's 19 Aug 10:00, the channels' 18 Aug 09:00), and a world-level `now` would make
   it one. That fixes a real inconsistency, at the cost of making the clock mandatory.
2. **Facts versus wire.** Where the member already comes from the wire (a `members` row), should a world
   re-answer the row instead of a fact? Reaching the app's own service is better whenever it is
   possible. Facts are for stand-ins that cannot.
3. **Exclusive slots.** The [exclusive-slots](exclusive-slots.md) proposal makes each alternative of a
   slot group its own address. A world plus an alternative is then just two query parameters. Worth
   checking that the two listings in `motu lagoon states` read as one.
4. **Scale.** Should `world-used` also require each world to cover at least one production state once
   coverage has data? That would make worlds earn their place the way the roadmap asks of features.
