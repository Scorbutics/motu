// Declared FLOWS for the lagoon view — switching a region, and switching a state.
//
// These are the two verbs the whole surface exists for, and until now the only thing that checked
// them was a person clicking. Each ends on an island that is NOT the one being driven, because
// asserting `region` after emitting `region-changed` would only prove the lagoon stored what it was
// handed — a step that cannot fail is not a check.
//
// The coupling worth proving: the station list and the states list share nothing except the region,
// and picking a station is what makes the states list describe somewhere else.
import type { RegionScenario } from '@motu/runtime/mock';
import { STATIONS, REVIEW_STATES, CORPUS_STATES, NO_STATES } from '../../shared/lagoon-view-evidence.js';

// EVERY SEED STATES THE PRODUCED KEYS. The lagoon carries a region's state across scenarios, so a
// seed that omits `region` or `flow` inherits whichever flow ran last and the order of this array
// becomes load-bearing. Naming both in every one of them is what makes each scenario an ADDRESS.

export const scenarios: RegionScenario[] = [
  {
    // Each slot renders ITS OWN island. Two lists side by side, and a crossed wire between them
    // renders perfectly and means the wrong thing — the failure no static check can see.
    name: 'each slot renders its own list',
    seed: { regions: STATIONS, region: 'review', states: REVIEW_STATES, flow: null },
    steps: [
      { expectRender: { stations: 'signin' } },
      { expectRender: { states: 'picking a shot is what the viewer is for' } },
      // The strip is the SAME island in another placement, so it has to be looked at separately:
      // a slot no flow asserts on is a slot that could be wired to its neighbour's data.
      { expectRender: { statesStrip: 'As seeded' } },
    ],
  },
  {
    // SWITCHING A REGION. Driven through the station list's own declared output, and asserted on the
    // STATES list — the island that is not being driven. That is the promise: picking a station is
    // what makes the rest of the dock describe somewhere else.
    name: 'switching a region changes what the states list describes',
    seed: { regions: STATIONS, region: 'review', states: REVIEW_STATES, flow: null },
    steps: [
      { expectRender: { states: 'browsable, with the project picker' } },
      {
        emit: { slot: 'stations', event: 'region-changed', detail: 'corpus' },
        expect: { region: 'corpus' },
      },
      {
        // The catalogue answers, the way the page answers it: `states` is DERIVED from `region`, so
        // the host provides the new region's flows rather than an island writing them.
        provide: { states: CORPUS_STATES },
        // Text only the corpus region declares. Asserting a name both regions share would have held
        // whatever was picked.
        expectRender: { states: 'narrowing the filter changes what the list shows' },
      },
    ],
  },
  {
    // SWITCHING A STATE, from the panel's list, asserted on the STRIP — the other placement of the
    // same island. This is the bug that shipped: the choice lived in the in-page dock's own DOM, so a
    // second reader lit "As seeded" forever whatever you pressed. One producer, two placements, and
    // they agree because they read the same key.
    name: 'switching a state lights it in both placements',
    seed: { regions: STATIONS, region: 'review', states: REVIEW_STATES, flow: null },
    steps: [
      {
        emit: { slot: 'states', event: 'flow-changed', detail: 'arriving scoped to one project' },
        expect: { flow: 'arriving scoped to one project' },
      },
      { expectRender: { statesStrip: 'arriving scoped to one project' } },
    ],
  },
  {
    // THE STRIP PRODUCES TOO, and this is the step that proves it. `writes-covered` caught that no
    // flow drove the strip's own emit: the coupling was declared on both placements and exercised on
    // one, so the strip could have stopped emitting entirely and every check here would still have
    // passed. Driven from the strip, asserted on the PANEL's list — the mirror of the step above.
    name: 'the phone strip switches state too',
    seed: { regions: STATIONS, region: 'review', states: REVIEW_STATES, flow: null },
    steps: [
      {
        emit: { slot: 'statesStrip', event: 'flow-changed', detail: 'picking a project is what the shot list is for' },
        expect: { flow: 'picking a project is what the shot list is for' },
      },
      { expectRender: { states: 'picking a project is what the shot list is for' } },
    ],
  },
  {
    // AND BACK TO SEEDED, which is `null` rather than a name — the state the page establishes, which
    // every flow is applied on top of. Worth its own step because null is the value a control is most
    // likely to mishandle, and because "you can always get back" is the promise that makes the rest
    // of the list safe to press.
    name: 'coming back to the seeded state',
    seed: { regions: STATIONS, region: 'review', states: REVIEW_STATES, flow: 'the view toggle changes what the viewer shows' },
    steps: [
      { expectRender: { statesStrip: 'the view toggle changes what the viewer shows' } },
      {
        emit: { slot: 'states', event: 'flow-changed', detail: null },
        expect: { flow: null },
      },
    ],
  },
  {
    // A REGION THAT DECLARES NO FLOWS. The strip stands down — it renders nothing rather than a lone
    // "As seeded" chip that cannot act — while the panel's list still offers the seeded state.
    name: 'a region with nothing to switch to',
    seed: { regions: STATIONS, region: 'signin', states: NO_STATES, flow: null },
    steps: [
      { expectRender: { states: 'As seeded' } },
      { expectRender: { stations: 'signin' } },
    ],
  },
];
