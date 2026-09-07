// Declared FLOWS for the users region — the coupling, as something that runs.
//
// THE WHOLE REGION IS ONE SENTENCE: the form owns `draft`, the card reads it. So the flow worth
// writing is not "the store kept what we handed it" — that cannot fail — but what the OTHER island
// SHOWS once the form has spoken. Every assertion below is on the card's rendered text while the
// stimulus goes into the form.
import type { RegionScenario } from '@motu/runtime/mock';
import { EMPTY, PARTIAL, PREMIUM, STANDARD } from '../../shared/member-draft-evidence.js';

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
      {
        emit: { slot: 'member-form', event: 'member-draft', detail: PREMIUM },
        expectRender: { 'member-card': 'Ada Lovelace' },
      },
    ],
  },
  {
    name: 'the chapter and member number reach the card',
    seed: SEED,
    steps: [
      {
        emit: { slot: 'member-form', event: 'member-draft', detail: STANDARD },
        // Two different fields of one key: asserting a second one is what makes this more than a
        // smoke test of the name.
        expectRender: { 'member-card': 'South chapter' },
      },
    ],
  },
  {
    // A CARD THAT ONLY EVER GROWS. Filling the card and then taking a field back out is the path a
    // person takes when they change their mind, and it is where a card that keeps what it was once
    // given gets caught: `chapter` must LEAVE the card when it leaves the draft.
    //
    // IT USED TO CLEAR TO `EMPTY`, and asserted the resting placeholder — which `flow-mutation`
    // rejected, correctly. `EMPTY` is `{}`, the mutant emits `null`, and an island handed either one
    // renders the same placeholder: the assertion held whatever the step did, so it proved only that
    // an unusable draft draws the empty state. Asserting an ABSENCE is what every wrong stimulus
    // already produces.
    //
    // Taking ONE field away instead keeps the regression this flow exists for and makes it depend on
    // the stimulus: the card must still show the name (which `null` would erase, so the mutant fails)
    // and must no longer show the chapter (which is the growth being caught). The resting state is
    // still asserted — from the seed, in the coverage flow at the top of this file.
    name: 'a field taken out of the draft leaves the card',
    seed: SEED,
    steps: [
      {
        emit: { slot: 'member-form', event: 'member-draft', detail: PREMIUM },
        expectRender: { 'member-card': 'North chapter' },
      },
      {
        emit: { slot: 'member-form', event: 'member-draft', detail: PARTIAL },
        expectRender: { 'member-card': { text: 'Ada Lovelace', notText: 'North chapter' } },
      },
    ],
  },
];
