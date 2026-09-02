// Declared FLOWS for the index region — what this page promises, as something that runs.
//
// TWO KINDS OF FLOW HERE. The first two assert what an island SHOWS with no stimulus but the seed —
// the only honest kind for a slot that merely renders, and the one that catches a slot wired to its
// neighbour's data, which no static check can see. The last two drive the page's one CONTROL and end
// on a DIFFERENT island's render, because asserting `query` after emitting `query-changed` would only
// prove the lagoon stored what it was handed.
import type { RegionScenario } from '@motu/runtime/mock';
import { REPOS, FILTERED_REPOS, STATS, CAP, VIEWER } from '../../shared/index-evidence.js';

// EVERY SEED STATES THE PRODUCED KEYS, and that is not belt-and-braces. The lagoon carries a region's
// state ACROSS scenarios: the flow that types "no-such-repository" left it there, and the next
// scenario opened with the repositories list already empty — its first step failed on a name the
// unfiltered list plainly renders. A seed that omits a produced key inherits whichever flow ran last,
// which makes the order of this array load-bearing. Naming `query` and `show` in every one of them is
// what makes each scenario an ADDRESS rather than a continuation.

export const scenarios: RegionScenario[] = [
  {
    // Each slot renders ITS OWN island. The readout, the filter, the account and the list all sit on
    // one page, and a crossed wire between any two of them renders perfectly and means the wrong thing.
    name: 'each card is its own card',
    seed: { repos: REPOS, stats: STATS, cap: CAP, query: '', paletteOpen: false, paletteQuery: '', viewer: VIEWER },
    steps: [
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
      // The account slot renders the BADGE, and the handle is text no other island on this page
      // produces. Worth its own assertion beyond coverage: a corner that silently renders somebody
      // else's identity is the one mistake here nobody would report as a bug.
      { expectRender: { account: 'Scorbutics' } },
    ],
  },
  {
    // THE PROMISE THIS REGION EXISTS FOR: what the page shows is what the viewer was given, and
    // nothing else. A repository filtered out upstream must not appear — and `provide` moving the
    // list is a real stimulus, so the assertion depends on what the step did.
    name: 'a filtered list shows only what it was given',
    seed: { repos: REPOS, stats: STATS, cap: CAP, query: '', paletteOpen: false, paletteQuery: '', viewer: VIEWER },
    steps: [
      { expectRender: { repositories: 'acme/example-app' } },
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
    seed: { repos: REPOS, stats: STATS, cap: CAP, query: '', paletteOpen: false, paletteQuery: '', viewer: VIEWER },
    steps: [
      { expectRender: { repositories: 'twentyhq/twenty' } },
      {
        emit: { slot: 'filter', event: 'query-changed', detail: 'no-such-repository' },
        expectRender: { repositories: 'No repository matches' },
      },
    ],
  },
  {
    // ⌘K OPENS SOMETHING THAT IS NOT THERE THE REST OF THE TIME. Closed, the palette renders nothing
    // at all, so an assertion on any entry proves the key reached it — and the mutant, which sends
    // null, closes it again and fails.
    name: 'the palette opens over the page',
    seed: { repos: REPOS, stats: STATS, cap: CAP, query: '', paletteOpen: false, paletteQuery: '', viewer: VIEWER },
    steps: [
      {
        emit: { slot: 'palette', event: 'palette-open', detail: true },
        expectRender: { palette: 'twentyhq/twenty' },
      },
    ],
  },
  {
    // AND SEARCHES WHAT THE VIEWER MAY SEE. Ends on the miss rather than on a hit: a name that is in
    // the unfiltered list would render whatever was typed, and this sentence only appears when the
    // query matched nothing — which is what makes the step depend on its own stimulus.
    name: 'typing in the palette narrows it',
    seed: { repos: REPOS, stats: STATS, cap: CAP, query: '', paletteOpen: true, paletteQuery: '', viewer: VIEWER },
    steps: [
      // COVERAGE for the palette's slot: its own footer, which no other island prints.
      { expectRender: { palette: 'esc' } },
      {
        emit: { slot: 'palette', event: 'palette-query', detail: 'qqzz' },
        expectRender: { palette: 'Nothing here matches' },
      },
    ],
  },
];
