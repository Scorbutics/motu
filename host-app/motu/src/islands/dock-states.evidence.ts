// Scenarios for dock-states — the panel's list and the phone's strip, which are one island.
import type { Scenario } from '@motu/runtime/mock';
import { REVIEW_STATES, CORPUS_STATES, NO_STATES } from '../shared/lagoon-view-evidence.js';

// `compact` is CROSSED rather than varied: every list scenario states it false and every strip one
// states it true, so neither arrangement is only ever seen one way. `input-coverage` asks for this
// because the state nothing renders is the one that breaks.

export const fixtures = [];
export const roles: string[] = [];

export const scenarios: Scenario[] = [
  {
    // DEFAULTS ALONE: no flows and nothing chosen, which is a region that declares none. The list
    // still renders "As seeded", because that state always exists — it is the page, not a flow.
    name: 'a region with no flows',
    seed: { states: NO_STATES, flow: null, compact: false },
  },
  {
    // The seeded state, with somewhere to go from it.
    name: 'as seeded, with six flows to choose from',
    seed: { states: REVIEW_STATES, flow: null, compact: false },
  },
  {
    // A FLOW SHOWING. The one that matters most: it is the state the dock kept getting wrong, lighting
    // "As seeded" whatever you pressed because the choice lived in a DOM nobody else could read.
    name: 'a flow is showing',
    seed: { states: REVIEW_STATES, flow: 'picking a shot is what the viewer is for', compact: false },
  },
  {
    // ANOTHER REGION'S FLOWS. Switching region replaces this list wholesale, and a list that kept the
    // previous region's names would look completely normal.
    name: "another region's flows",
    seed: { states: CORPUS_STATES, flow: 'narrowing the filter changes what the list shows', compact: false },
  },
  {
    // THE STRIP, which is the same island drawn for a phone bar. Its own scenario because the two
    // arrangements are what a person actually looks at, and only one of them is ever on screen.
    //
    // A DIFFERENT REGION'S FLOWS, deliberately: seeded with `review`'s it rendered the same words as
    // the list scenario above and differed only by an attribute, so `data-flow` counted six scenarios
    // producing five distinct renders — correctly. A scenario that shows nothing another does not is
    // evidence of nothing.
    name: 'the phone strip',
    seed: { states: CORPUS_STATES, flow: 'each slot renders its own island', compact: true },
  },
  {
    // The strip STANDS DOWN where there is nothing to switch to — a chip whose only act is the state
    // you are in is a control that cannot do anything, and it made the bar taller for nothing.
    name: 'the phone strip with nothing to switch to',
    seed: { states: NO_STATES, flow: null, compact: true },
  },
];
