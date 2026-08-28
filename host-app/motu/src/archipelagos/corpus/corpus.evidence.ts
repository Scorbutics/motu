// Declared FLOWS for the corpus region — what this page promises, as something that runs.
//
// Sibling file, never the config: evidence must not travel into whatever bundles the archipelago.
//
// WHAT THIS REGION CAN PROMISE, and it is more than `signin` can: there are two islands and a key
// that travels between them, so the flow below drives a real coupling rather than asserting on one
// island's own render. `corpus-filter` emits, the region stores `filter`, and `corpus-states` — which
// is not the island being driven — shows something different afterwards.
import type { RegionScenario } from '@motu/runtime/mock';
// RELATIVE, like every other evidence import: these files are read by plain node, where the app's
// `@/…` alias does not resolve, and the failure is a silent "flows could not be read".
import { CORPUS_REGION_ID, CORPUS_STATES, CORPUS_UNACCEPTED } from '../../shared/corpus-evidence.js';

/** The one state nobody has accepted — what narrowing must leave behind, and what it must remove. */
const UNACCEPTED = CORPUS_STATES.find((s) => !s.accepted)!;
const ACCEPTED = CORPUS_STATES.find((s) => s.accepted)!;

export const scenarios: RegionScenario[] = [
  {
    // Each slot's own coverage step: this slot renders THAT island. No stimulus, because the claim is
    // not a data flow — and `flow-mutation` is right to reject an assertion on a constant that
    // pretends otherwise. Worth making anyway: it is what catches a slot rewired to a neighbour's
    // content after a merge, which no static check can see.
    name: 'each slot renders its own island',
    seed: {
      states: CORPUS_STATES,
      unacceptedCount: CORPUS_UNACCEPTED,
      regionId: CORPUS_REGION_ID,
    },
    steps: [
      { expectRender: { 'corpus-filter': 'Not yet accepted' } },
      { expectRender: { 'corpus-states': UNACCEPTED.id } },
    ],
  },
  {
    // THE COUPLING, DRIVEN END TO END — and this is the flow the region exists for.
    //
    // The step fires `corpus-filter`'s declared output. The region stores it under `filter`, and the
    // assertion is on what `corpus-states` shows — a DIFFERENT island from the one being driven,
    // which is what makes the step able to fail. Asserting `filter` after emitting `filter` would
    // only prove the lagoon stored what it was handed.
    name: 'narrowing the filter changes what the list shows',
    seed: {
      states: CORPUS_STATES,
      unacceptedCount: CORPUS_UNACCEPTED,
      regionId: CORPUS_REGION_ID,
    },
    steps: [
      // Everything, so an accepted row IS on screen to begin with — otherwise the disappearance
      // below proves nothing.
      { expectRender: { 'corpus-states': ACCEPTED.id } },
      {
        // ASSERTS THE CAPTION, not a row id, and the difference is what `flow-mutation` taught. The
        // unaccepted row renders under EVERY filter — it is in the list either way — so asserting its
        // id held when the stimulus was mutated, which means the step was asserting a constant. The
        // caption exists only while `filter === 'unaccepted'`, so it is the one thing on screen that
        // this emit actually decides.
        emit: { slot: 'corpus-filter', event: 'filter-changed', detail: 'unaccepted' },
        expectRender: { 'corpus-states': 'Showing only states nobody has accepted.' },
      },
    ],
  },
];
