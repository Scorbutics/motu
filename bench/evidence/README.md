# Does motu refuse fake evidence? — design

**Status:** designed, not run. Pre-registered here before any result exists, so the expectations
cannot be fitted to the outcome afterwards.

## The question

`bench/coupling` asks whether motu *detects* defects injected by hand. Agents rarely produce those
defects any more. What they do produce is **evidence that agrees with itself**: a test that cannot
fail, two states that are really one, a fixture in a vocabulary the app does not use, a call nobody
answered and the app swallowed.

A component catalogue is only as good as its stories, and the stories are exactly what an agent
writes. So the question is not "does motu catch bugs" but:

> Given the same lie told to both, which tool refuses it?

If motu refuses most of them and a catalogue refuses few, the claim is "a catalogue you can trust".
If not, that is the finding, and the README changes.

## Setup

One target app, two harnesses over the SAME components:

- **motu** — islands, a region, `*.evidence.ts`, run with `motu check --runtime` and
  `motu integrate check`.
- **Storybook**, in two configurations. Scoring only the default would be a strawman:
  - **default** — what `storybook init` gives, plus `@storybook/test-runner`;
  - **strict** — CSF3 with `satisfies Meta<typeof C>` (args typed against props), MSW with
    `onUnhandledRequest: 'error'`, and the test-runner failing on console errors.

Each cheat is injected into both, one at a time, from a clean tree. As in `bench/coupling`, a cheat
counts as caught when the tool's **failure signature changes**, not when it is merely red. The edit
must match exactly once, and the restore is checked byte for byte.

## The cheats

| | the lie | motu — expected | Storybook default | Storybook strict |
|---|---|---|---|---|
| E1 | a play function / flow step whose assertion holds whatever the input (it asserts text the fixture itself contains) | **caught** — `flow-mutation` | missed | missed |
| E2 | two stories / scenarios with different names and identical renders | **caught** — `data-flow` | missed | missed |
| E3 | a fixture with a field the app's type does not have | **caught** — evidence typed with `import type`, so `tsc` | missed | **caught** — `satisfies Meta` |
| E4 | a fixture value the type allows and the app never uses (`status: 'archived'` where the type is `string`) | missed | missed | missed |
| E5 | a backend call no mock answers, swallowed by the component into an empty state | **caught** — `flow-calls` | missed | **caught?** — MSW errors; whether the run FAILS depends on the component surfacing it |
| E6 | a link to a state that does not exist (a renamed scenario / story) | **caught** — refuses to render | **caught** — "Couldn't find story" | **caught** |
| E7 | the story and the page drift: the page stops placing the component, or passes it different props | **caught** — `integrate check` | missed | missed |
| E8 | a slot no evidence ever looks at, wired to a neighbour's data | **caught** — `render-coverage` (warning) | n/a — no notion of a page | n/a |
| E9 | a stylesheet bundled and never applied (a real incident) | `LOOK`, not caught — perception only | missed | missed |

E4 and E9 are in on purpose: no mechanical check can catch them, and saying so is part of the
result. E3 and E6 are expected ties: Storybook strict does its job there, and a table with no ties
would be a pitch.

## Scoring and reporting

- One matrix like `bench/coupling/RESULTS.md`: cheat × {motu, SB default, SB strict}.
- Headline: how many each tool refused, out of the cheats it COULD refuse (E4 and E9 excluded, and
  stated).
- Every miss of motu's is a finding to report, not to tune away. The expectations above may not be
  edited after the first run; a surprise goes in RESULTS.md as a surprise.
- Cost per tool: wall-clock for a clean run, so "motu catches more" is never read without "and costs
  this much more".

## Open

- **Target app.** It should be third-party, like `bench/coupling`'s shlink, so the result does not
  come from a codebase motu was built around. `demo-app` is the fallback: in-repo and already wired,
  but motu's own, so say so in the result.
- E5's Storybook-strict outcome depends on the component. Pick a component that renders an empty
  state on error, because that is the case that hid four 404'd tables on Peps.
