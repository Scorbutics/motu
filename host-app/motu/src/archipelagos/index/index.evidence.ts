// Declared FLOWS for the index region — what this page promises, as something that runs.
//
// TWO KINDS OF FLOW HERE. The first two assert what an island SHOWS with no stimulus but the seed —
// the only honest kind for a slot that merely renders, and the one that catches a slot wired to its
// neighbour's data, which no static check can see. The last two drive the page's one CONTROL and end
// on a DIFFERENT island's render, because asserting `query` after emitting `query-changed` would only
// prove the lagoon stored what it was handed.
import type { RegionScenario } from '@motu/runtime/mock';
import { REPOS, GROUPS, FILTERED_REPOS, STATS, CAP } from '../../shared/index-evidence.js';

// EVERY SEED STATES THE PRODUCED KEYS, and that is not belt-and-braces. The lagoon carries a region's
// state ACROSS scenarios: the flow that types "no-such-repository" left it there, and the next
// scenario opened with the repositories list already empty — its first step failed on a name the
// unfiltered list plainly renders. A seed that omits a produced key inherits whichever flow ran last,
// which makes the order of this array load-bearing. Naming `query` and `show` in every one of them is
// what makes each scenario an ADDRESS rather than a continuation.

export const scenarios: RegionScenario[] = [
  {
    // Each slot renders ITS OWN island. Two lists of repository names side by side is exactly the
    // shape where a crossed wire renders perfectly and means the wrong thing.
    name: 'each card is its own card',
    seed: { groups: GROUPS, repos: REPOS, stats: STATS, cap: CAP, query: '', show: 'all' },
    steps: [
      { expectRender: { composed: 'product' } },
      { expectRender: { repositories: 'twentyhq/twenty' } },
      // THE BAY'S READOUT IS ASSERTED TOO, because it was the one thing on this screen nothing
      // looked at — and the number it rendered was one the host cannot produce. It is a `Meter` now,
      // so the assertion is the LABELLED value rather than the old run-on sentence; the check caught
      // the change, which is the check doing its job on a reshape rather than a rename.
      { expectRender: { readout: 'OBJECTS 346' } },
      // The filter slot renders the FILTER, and not one of the two lists beside it. Its own label,
      // which nothing else on the page produces — `render-coverage` names a slot no flow looks at,
      // and this one had none until the control existed.
      { expectRender: { filter: 'Repositories' } },
    ],
  },
  {
    // THE PROMISE THIS REGION EXISTS FOR: what the page shows is what the viewer was given, and
    // nothing else. A repository filtered out upstream must not appear — and `provide` moving the
    // list is a real stimulus, so the assertion depends on what the step did.
    name: 'a filtered list shows only what it was given',
    seed: { groups: [], repos: REPOS, stats: STATS, cap: CAP, query: '', show: 'all' },
    steps: [
      { expectRender: { repositories: 'Scorbutics/peps_ta_boite_app' } },
      {
        provide: { repos: FILTERED_REPOS },
        // It renders what it now has…
        expectRender: { repositories: 'motu-review' },
      },
    ],
  },
  {
    // THE QUERY REACHES THE LIST. Ends on the repositories island — not the one being driven — and on
    // the sentence that ONLY appears when a search matched nothing, so the assertion cannot hold with
    // a different stimulus. Asserting a name that is present in the unfiltered list would have passed
    // whatever was typed.
    name: 'typing narrows the repositories',
    seed: { groups: GROUPS, repos: REPOS, stats: STATS, cap: CAP, query: '', show: 'all' },
    steps: [
      { expectRender: { repositories: 'twentyhq/twenty' } },
      {
        emit: { slot: 'filter', event: 'query-changed', detail: 'no-such-repository' },
        expectRender: { repositories: 'No repository matches' },
      },
    ],
  },
  {
    // THE SEGMENT HIDES A WHOLE KIND. `notText` rather than a positive assertion, because what
    // choosing "Groups" does to the repositories list is make it absent — and the repository named
    // here IS rendered under every other value of `show`, so the step fails if the emit does nothing.
    //
    // ITS OWN SCENARIO rather than a third step above: after a query that matches nothing the
    // repositories list is already empty, and an assertion that holds before the emit is not a check.
    name: 'choosing groups hides the repositories',
    seed: { groups: GROUPS, repos: REPOS, stats: STATS, cap: CAP, query: '', show: 'all' },
    steps: [
      { expectRender: { repositories: 'twentyhq/twenty' } },
      {
        emit: { slot: 'filter', event: 'show-changed', detail: 'groups' },
        expectRender: { repositories: { notText: 'twentyhq/twenty' } },
      },
    ],
  },
];
