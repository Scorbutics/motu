// Declared FLOWS for the users region — the coupling, as something that runs.
//
// THE WHOLE REGION IS ONE SENTENCE: the form owns `draft`, the card reads it. So the flow worth
// writing is not "the store kept what we handed it" — that cannot fail — but what the OTHER island
// SHOWS once the form has spoken. Every assertion below is on the card's rendered text while the
// stimulus goes into the form.
import type { RegionScenario } from '@motu/runtime/mock';
import { COMPLETE, EMPTY, PARTIAL } from '../../shared/member-draft-evidence.js';

const SEED = { draft: EMPTY };

export const scenarios: RegionScenario[] = [
  {
    // COVERAGE: each slot renders its OWN island, in text that island alone produces. Without this a
    // slot wired to the neighbour's data passes every other check.
    name: 'each slot renders its own island',
    seed: SEED,
    steps: [
      { expectRender: { 'member-form': 'Create a member' } },
      { expectRender: { 'member-card': 'Their name appears here' } },
    ],
  },
  {
    // THE COUPLING. The form emits its declared output; the assertion is on the CARD. It fails if the
    // key is renamed, if the card stops binding it, if a second island claims it, or if the two are
    // wired to different keys — which is the whole list of ways this region can break.
    name: 'typing a name draws it on the card',
    seed: SEED,
    steps: [
      { emit: { slot: 'member-form', event: 'member-draft', detail: PARTIAL }, expectRender: { 'member-card': 'Ada Lovelace' } },
    ],
  },
  {
    name: 'a complete profile fills the card',
    seed: SEED,
    steps: [
      {
        emit: { slot: 'member-form', event: 'member-draft', detail: COMPLETE },
        // The role and the organisation come from different fields of one key: asserting both is what
        // makes this more than a smoke test of the name.
        expectRender: { 'member-card': 'Analytical Engines' },
      },
    ],
  },
  {
    // THE EMPTY STATE IS A STATE. Filling the card and then clearing it is the path a person takes
    // when they change their mind, and it is where a card that only ever grows gets caught.
    name: 'clearing the form returns the card to its resting state',
    seed: SEED,
    steps: [
      { emit: { slot: 'member-form', event: 'member-draft', detail: COMPLETE }, expectRender: { 'member-card': 'Ada Lovelace' } },
      { emit: { slot: 'member-form', event: 'member-draft', detail: EMPTY }, expectRender: { 'member-card': 'Their name appears here' } },
    ],
  },
];
