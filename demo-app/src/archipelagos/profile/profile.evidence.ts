// Declared FLOWS for the profile region — the coupling, as something that runs.
//
// WHAT IS ASSERTED HERE AND WHAT IS NOT. Three of this region's five islands are `planned: true`:
// the calendar is surveyed and owned but not yet built, so there is nothing of it to drive. The
// flows below cover the two islands that DO exist, and whoever builds a calendar island adds a step
// asserting what THAT island renders — not a step reusing these. A slot no flow looks at is a slot
// that can be wired to its neighbour's data and pass every other check, which is what
// `render-coverage` names.
//
// EVERY STEP USES `provide`, NOT `emit`, AND ENDS ON `expectRender`. Both built islands only READ:
// the hero and the card are projections of host-fed keys, so there is no declared output to fire.
// `provide` is the application moving its own state — the page resolving a member id from the URL —
// and the assertion has to be on what RENDERED, because a step whose `expect` names the key its own
// `provide` targets asserts that the lagoon stored what it was handed, which cannot fail.
import type { RegionScenario } from '@motu/runtime/mock';
import { draftFromMember } from '../../shared/member-draft.js';
import { ADA, RASMUS, OPEN_CALENDAR, FULL_CALENDAR, NO_CALENDAR } from '../../shared/profile-evidence.js';

/**
 * The resting state: a route that has not resolved yet.
 *
 * IT SEEDS EVERY KEY THE PAGE SEEDS, including the two the calendar islands will own. That is not
 * ceremony — `flow-shape` compares the two lists, and a flow that seeds fewer keys than the page
 * previews a region shaped differently from the one users get. `undefined` and `null` are not the
 * same thing to a component that distinguishes them, and the difference only ever shows up on the
 * real first paint, which is the one place the lagoon is not.
 */
const EMPTY_SEED = { member: null, draft: {}, calendar: null, selectedDay: null, selectedSlot: null };

/** A resolved member with published availability — what the page looks like most of the time. */
const ADA_SEED = { member: ADA, draft: draftFromMember(ADA), calendar: OPEN_CALENDAR };

export const scenarios: RegionScenario[] = [
  {
    // COVERAGE: each BUILT slot renders its own island, in text that island alone produces.
    name: 'each built slot renders its own island',
    seed: EMPTY_SEED,
    steps: [
      // The hero's empty state. No stimulus at all: the claim is "this slot renders THIS island",
      // which is not a data flow and is still worth making. Providing something merely to have a
      // stimulus would produce a constant, and `flow-mutation` would correctly reject it.
      { expectRender: { 'profile-hero': 'Select a member' } },
      { expectRender: { 'member-card': 'Their name appears here' } },
    ],
  },
  {
    // ONE KEY, TWO ISLANDS, AND THE ASSERTIONS ARE ON DIFFERENT FIELDS OF IT. The page resolves one
    // member; the hero draws their chapter and the card draws their membership number. Asserting the
    // same name in both places would pass even if one island were reading the other's slot.
    name: 'resolving a member fills the hero and the card',
    seed: EMPTY_SEED,
    steps: [
      {
        provide: ADA_SEED,
        expectRender: { 'profile-hero': 'Northwest coastal chapter' },
      },
      { expectRender: { 'member-card': '702508' } },
    ],
  },
  {
    // THE THREE AVAILABILITY STATES ARE THREE SCREENS, and this is the flow that refuses to let two
    // of them collapse into one. "Fully booked" and "publishes nothing" are the pair that gets
    // written as a single grey line by whoever comes next; the counts differ, the copy differs, the
    // colour differs, and one step here fails when they stop differing.
    name: 'the hero tells the three availability states apart',
    seed: EMPTY_SEED,
    steps: [
      { provide: ADA_SEED, expectRender: { 'profile-hero': 'free times across' } },
      {
        provide: { member: RASMUS, draft: draftFromMember(RASMUS), calendar: FULL_CALENDAR },
        expectRender: { 'profile-hero': 'Fully booked for the next two weeks' },
      },
      {
        provide: { member: RASMUS, draft: draftFromMember(RASMUS), calendar: NO_CALENDAR },
        expectRender: { 'profile-hero': 'Publishes no availability' },
      },
    ],
  },
  {
    // A SUSPENDED MEMBER IS A DIFFERENT PAGE, and the badge is the only thing that says so. It is
    // rendered by the hero out of the same `member` key everything else reads, so a hero that
    // stopped binding the key would fail here rather than merely looking a bit emptier.
    name: 'a suspended membership is visible on the hero',
    seed: EMPTY_SEED,
    steps: [
      {
        provide: { member: RASMUS, draft: draftFromMember(RASMUS), calendar: NO_CALENDAR },
        expectRender: { 'profile-hero': 'Suspended' },
      },
    ],
  },
];
