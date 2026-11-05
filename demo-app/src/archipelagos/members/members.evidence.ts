// Declared FLOWS for the members region — the couplings, as something that runs.
//
// THE DATA IS THE APP'S OWN, END TO END. The table's fixture answers through `membersSource` over
// `seedMembersPort`, over the 240 rows of `supabase/seed.sql`; the club's game state is `clubOverview`
// over the same rows on a pinned day (`shared/club-evidence.ts`). Every name, count and level asserted
// below was read off that data, so each step describes a screen a person reaches by doing the same
// thing in the app.
//
// THE PAGE HOLDS 20 ROWS, sorted by surname then first name: page one runs Edsger Allen … Tariq
// Boulos. A name further down the alphabet can only appear if a filter or a sort genuinely reached
// the fetch — which is what makes each step below survive `flow-mutation` rather than assert a
// constant.
import type { RegionScenario } from '@motu/runtime/mock';
import { CLUB, EVIDENCE_DAY, NEXT_WEEK } from '../../shared/club-evidence.js';

// EVERY KEY THE REGION CARRIES — the same list the page seeds (`members-region.ts`), which is what
// `flow-shape` compares. A flow run against a region shaped differently from the one users get is
// internally consistent on both sides, so nothing would notice.
const SEED = {
  criteria: {},
  overview: CLUB,
  asOf: EVIDENCE_DAY,
  dataSource: 'sandbox',
  selectedMember: null,
  resultCount: null,
};

export const scenarios: RegionScenario[] = [
  {
    // COVERAGE: each slot renders its OWN island, in text that island alone produces. Without this a
    // slot wired to a neighbour's data passes every other check — `render-coverage` names the slots
    // no flow looks at.
    name: 'each slot renders its own island',
    seed: SEED,
    steps: [
      {
        expectRender: {
          'member-header': 'Club level 7',
          'member-highlights': 'Leads the',
          'member-quick-search': 'Search members',
          'member-plan-tabs': 'Standard',
          'member-actions': 'New member',
        },
      },
      {
        expectRender: {
          'member-results': 'Allen',
          'weekly-quest': 'Weekly quest',
          'high-scores': 'High scores',
          'chapter-cup': 'Chapter Cup',
          'fresh-unlocks': 'Fresh unlocks',
        },
      },
    ],
  },
  {
    // THE PLAN TABS DRIVE THE TABLE. A tab writes `criteria`, the region carries it, and the TABLE —
    // another island — re-fetches through `MemberService.search`. 76 premium members; Bjarne Cerf is
    // one, and is not on the unfiltered page one.
    name: 'a plan tab filters the table',
    seed: SEED,
    steps: [
      {
        emit: { slot: 'member-plan-tabs', event: 'criteria-changed', detail: { plan: 'premium' } },
        expectRender: { 'member-results': 'Bjarne' },
        // Produced by the table, not by the island that emitted — it only moves if the loop ran.
        expect: { resultCount: 76 },
      },
    ],
  },
  {
    // THE SEARCH BOX DRIVES THE TABLE. Three members are called Grace; Grace Salazar is past page one.
    name: 'a search filters the table',
    seed: SEED,
    steps: [
      {
        emit: { slot: 'member-quick-search', event: 'criteria-changed', detail: { q: 'grace' } },
        expectRender: { 'member-results': 'Salazar' },
        expect: { resultCount: 3 },
      },
    ],
  },
  {
    // A SEARCH AND A PLAN AT ONCE, and the `notText` proves both reached the fetch: of the three
    // Graces only Grace Salazar is premium, so Grace Allen must be gone.
    name: 'a search and a plan narrow together',
    seed: SEED,
    steps: [
      {
        emit: { slot: 'member-quick-search', event: 'criteria-changed', detail: { q: 'grace', plan: 'premium' } },
        expectRender: { 'member-results': { text: 'Salazar', notText: 'Allen' } },
        expect: { resultCount: 1 },
      },
    ],
  },
  {
    // AN EMAIL, the thing people paste. Five addresses contain "salazar".
    name: 'searching by email',
    seed: SEED,
    steps: [
      {
        emit: { slot: 'member-quick-search', event: 'criteria-changed', detail: { q: 'salazar' } },
        expectRender: { 'member-results': 'Elena' },
        expect: { resultCount: 5 },
      },
    ],
  },
  {
    // A SEARCH THAT FINDS NOTHING — the state a list spends real time in, and the one that looks
    // identical to a broken fetch from outside the region. The table names the term back.
    name: 'a search that matches nobody says so',
    seed: SEED,
    steps: [
      {
        emit: { slot: 'member-quick-search', event: 'criteria-changed', detail: { q: 'nobody-by-that-name' } },
        expectRender: { 'member-results': 'nobody-by-that-name' },
        expect: { resultCount: 0 },
      },
    ],
  },
  {
    // THE BACKEND FAILING, driven through the region: the table's fixtures answer this criteria with
    // a 500, so the component's own `.catch` runs — the path a user meets on a bad afternoon.
    name: 'a failing search reaches the error state through the region',
    seed: SEED,
    steps: [
      {
        emit: { slot: 'member-quick-search', event: 'criteria-changed', detail: { surname: 'unreachable-backend' } },
        expectRender: { 'member-results': 'Something went wrong' },
      },
    ],
  },
  {
    // ONE HOST-FED KEY, SIX READERS ASSERTED. The page hands the region the club's game state; the
    // header, the tiles, the quest, the podium, the Cup and the feed all draw from it. This step moves
    // the day a week on — `overview` AND `asOf` together, as the page does, so the table beside them
    // stays the same club — and asserts a DIFFERENT field in each island: 1,236 club XP, 122 streaks,
    // a premium quest, Grace S. on the podium, North at 3,248, Ruth Gosling's anniversary. An island
    // reading the wrong key, or a stale one, fails here rather than looking a week out of date.
    // (The plan tabs' counts do not move in a week; the coverage step above is their check.)
    name: "the club's state reaches every island that shows it",
    seed: SEED,
    steps: [
      {
        provide: { overview: NEXT_WEEK, asOf: '2026-09-14' },
        expectRender: {
          'member-header': '1,236',
          'member-highlights': '122',
          'weekly-quest': 'Bring premium to 80 members',
          'high-scores': 'Grace S.',
          'chapter-cup': '3,248',
          'fresh-unlocks': 'Ruth Gosling',
        },
      },
    ],
  },
  {
    // SORTING ASKS THE BACKEND. A click on the Level header orders the SEARCH, so the club's highest
    // level — Bjarne Perlman, level 14 on the evidence day, far down the alphabet — comes to page one.
    // Sorting only the twenty rows on screen would never show him: this step is the difference.
    name: 'sorting by level ranks the whole club',
    seed: SEED,
    // The header's accessible name is its rendered text, and the display face sets it in capitals.
    steps: [{ click: 'LEVEL', expectRender: { 'member-results': 'Perlman' } }],
  },
];
