// Declared FLOWS for the profile region — the coupling, as something that runs.
//
// WHAT IS ASSERTED HERE AND WHAT IS NOT. Three of this region's four islands are `planned: true`:
// the calendar is surveyed and owned but not yet built, so there is nothing of it to drive. The
// flows below cover the one island that DOES exist, and whoever builds a calendar island adds a step
// asserting what THAT island renders — not a step reusing these. A slot no flow looks at is a slot
// that can be wired to its neighbour's data and pass every other check, which is what
// `render-coverage` names.
//
// EVERY STEP USES `provide`, NOT `emit`, AND ENDS ON `expectRender`. The built island only READS:
// the hero is a projection of host-fed keys, so there is no declared output to fire.
// `provide` is the application moving its own state — the page resolving a member id from the URL —
// and the assertion has to be on what RENDERED, because a step whose `expect` names the key its own
// `provide` targets asserts that the lagoon stored what it was handed, which cannot fail.
import type { RegionScenario } from '@motu/runtime/mock';
import { DENNIS, RICH, GUIDO, OPEN_CALENDAR, FULL_CALENDAR, NO_CALENDAR } from '../../shared/profile-evidence.js';
import { EVIDENCE_DAY } from '../../shared/club-evidence.js';

/**
 * The resting state: a route that has not resolved yet.
 *
 * IT SEEDS EVERY KEY THE PAGE SEEDS, including the two the calendar islands will own. That is not
 * ceremony — `flow-shape` compares the two lists, and a flow that seeds fewer keys than the page
 * previews a region shaped differently from the one users get. `undefined` and `null` are not the
 * same thing to a component that distinguishes them, and the difference only ever shows up on the
 * real first paint, which is the one place the lagoon is not.
 */
const EMPTY_SEED = { member: null, calendar: null, asOf: EVIDENCE_DAY, selectedDay: null, selectedSlot: null };

/** A resolved member with published availability — what the page looks like most of the time. */
const DENNIS_SEED = { member: DENNIS, calendar: OPEN_CALENDAR };

export const scenarios: RegionScenario[] = [
  {
    // COVERAGE: the built slot renders its own island, in text that island alone produces. No
    // stimulus at all: the claim is "this slot renders THIS island", which is not a data flow and is
    // still worth making. Providing something merely to have a stimulus would produce a constant,
    // and `flow-mutation` would correctly reject it.
    name: 'each built slot renders its own island',
    seed: EMPTY_SEED,
    steps: [{ expectRender: { 'profile-hero': 'Select a member' } }],
  },
  {
    // ONE KEY, TWO FIELDS OF IT, ASSERTED IN TWO STEPS. The chapter and the membership number come
    // from different columns of the same row; a header that dropped either would fail one of these.
    name: 'resolving a member fills the header',
    seed: EMPTY_SEED,
    steps: [
      { provide: DENNIS_SEED, expectRender: { 'profile-hero': 'Northwest coastal chapter' } },
      { provide: DENNIS_SEED, expectRender: { 'profile-hero': '702564' } },
    ],
  },
  {
    // THE THREE AVAILABILITY STATES ARE THREE SCREENS, and this is the flow that refuses to let two
    // of them collapse into one. "Fully booked" and "publishes nothing" are the pair that gets
    // written as a single grey line by whoever comes next; the counts differ, the copy differs, the
    // colour differs, and one step here fails when they stop differing.
    //
    // THE EMPTY STATES ARE ASSERTED WITH THE MEMBER'S NAME IN THEM. "Publishes no availability" alone
    // is the DEGENERATE render — the hero says it for an empty calendar and equally for a key holding
    // something it does not recognise — so on its own it holds however the step is driven, and
    // `flow-mutation` rejects it. This used to be tied to the stimulus by asserting the member number
    // on the card in the same step; the card has left this page, so the hero's own sentence now names
    // whose calendar it is, and a mutated stimulus loses the name.
    name: 'the hero tells the three availability states apart',
    seed: EMPTY_SEED,
    steps: [
      { provide: DENNIS_SEED, expectRender: { 'profile-hero': 'free times across' } },
      {
        provide: { member: RICH, calendar: FULL_CALENDAR },
        expectRender: { 'profile-hero': 'Rich is fully booked for the next two weeks' },
      },
      {
        provide: { member: GUIDO, calendar: NO_CALENDAR },
        expectRender: { 'profile-hero': 'Guido publishes no availability' },
      },
    ],
  },
  {
    // THE CLUB'S GAME REACHES THE PROFILE. The same rules the directory runs, for the same day: Dennis
    // Shaw is level 10 on the evidence day, 52,722 XP and 77% of the way to level 11, and Rich Stroustrup
    // is on a 7-day streak. Asserted as two members, so a header that stopped reading `member` — or read
    // the wrong one — fails rather than showing somebody's level.
    name: 'the header shows where the member stands in the club',
    seed: EMPTY_SEED,
    steps: [
      { provide: { member: DENNIS, calendar: OPEN_CALENDAR }, expectRender: { 'profile-hero': '52,722 XP · 77% to Lv 11' } },
      { provide: { member: RICH, calendar: FULL_CALENDAR }, expectRender: { 'profile-hero': '7-day streak' } },
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
        provide: { member: GUIDO, calendar: NO_CALENDAR },
        expectRender: { 'profile-hero': 'Suspended' },
      },
    ],
  },
];
