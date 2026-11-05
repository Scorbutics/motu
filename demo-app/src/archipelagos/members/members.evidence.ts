// Declared FLOWS for the members region — the couplings, as something that runs.
//
// WHY THIS REGION AND WHY NOW. The members page is the only surface in this repository whose islands
// fetch through the CONTRACT: `member-results` calls `MemberService.search(page, criteria)` itself,
// answered by `MockTransport` from the island's own fixtures. Every other region here reads its data
// through the wire fake or a channel, so until this file existed the contract door was exercised by a
// unit test and by nothing that renders. A door with no flow behind it is a door nobody has opened.
//
// The rows these steps rely on are the app's own: the island's fixture answers through `membersSource`
// over `seedMembersPort`, over the 240 rows of `supabase/seed.sql` — the same rows, filter and order
// the sandbox build serves. Every name and count asserted below was read off that data, so a step
// here describes a screen a person can reach by typing the same filter into the app.
//
// THE PAGE HOLDS 20 ROWS, sorted by surname then first name. Unfiltered (or active-only) page one runs
// Edsger Allen … Tariq Boulos, so a name further down the alphabet can only appear if a filter
// genuinely reached the fetch — which is what makes each narrowing step below survive
// `flow-mutation` rather than assert a constant.
import type { RegionScenario } from '@motu/runtime/mock';
import { MEMBER_SEARCH_CONFIG } from '../../ui/member-search-ng/search.config.js';

// EVERY KEY THE REGION CARRIES, not just the interesting ones — a flow run against a region shaped
// differently from the one users get is internally consistent on both sides, so nothing notices.
//
// `status: 'active'` rather than `{}` for a reason each flow below depends on: the chips island
// renders NOTHING when no filter is set (`entries.length === 0` -> null), so a region seeded empty
// has a slot that cannot be asserted on and an island that cannot be emitted from.
// THE SAME KEYS A REAL PAGE LOAD ESTABLISHES. `integrate check`'s `flow-shape` compares this list
// against what the page seeds, and it caught `searchConfig` missing here: the page hands the search
// island its field schema on every load, and every flow previewed a region that had never been
// given one. A preview shaped differently from the page is a preview of a page nobody visits.
const SEED = {
  criteria: { status: 'active' as const },
  searchConfig: MEMBER_SEARCH_CONFIG,
  selectedMember: null,
  resultCount: 0,
};

export const scenarios: RegionScenario[] = [
  {
    // COVERAGE: each slot renders its OWN island, in text that island alone produces. Without this a
    // slot wired to a neighbour's data passes every other check — `render-coverage` names the slots
    // no flow looks at, and it named all five of these.
    name: 'each slot renders its own island',
    seed: SEED,
    steps: [
      { expectRender: { 'member-header': 'Browse and add community members', 'member-actions': 'New member' } },
      // The chip's own vocabulary: `CRITERIA_LABELS.status` plus the display value the chips island
      // maps it to. The store holds `'active'`; only the chip prints `Active`.
      //
      // The search island is COLLAPSED here — it renders a `Filters` trigger with a count, and the
      // field labels live in a popover nobody has opened. `Member filters` is the dialog's accessible
      // name, which `expectRender` reads as part of what a person can perceive; asserting `Email`
      // asserted a screen this island only shows once clicked.
      { expectRender: { 'member-chips': 'Status', 'member-search-ng': 'Member filters' } },
      { expectRender: { 'member-results': 'Allen' } },
    ],
  },
  {
    /**
     * THE COUPLING THE PAGE EXISTS FOR, and the one that crosses the contract.
     *
     * A filter changes in one island, the region carries it, and ANOTHER island re-fetches through
     * `MemberService.search` and renders the answer. Nothing about that is visible from either island
     * alone: `member-chips` proves it emitted, `member-results` proves it can render rows, and only
     * the region proves the first causes the second.
     *
     * `Amira` is the assertion on purpose. There are three Wirths, all far past page one, so Amira
     * Wirth can only appear if the emitted criteria genuinely reached the fetch. Any other stimulus
     * lands on page one (no Wirth) or on an empty list.
     */
    name: 'filtering in one island is what the results are for',
    seed: SEED,
    steps: [
      { expectRender: { 'member-results': { text: 'Allen', notText: 'Wirth' } } },
      {
        emit: { slot: 'member-chips', event: 'criteria-changed', detail: { surname: 'Wirth' } },
        expectRender: { 'member-results': 'Amira' },
        // The count is produced by `member-results`, not by the island that emitted — a region key
        // that only moves if the whole loop ran.
        expect: { resultCount: 3 },
      },
    ],
  },
  {
    // A SEARCH THAT FINDS NOTHING — the state a list spends real time in, and the one that looks
    // identical to a broken fetch from outside the region.
    name: 'a filter that matches nobody says so',
    seed: SEED,
    steps: [
      {
        emit: { slot: 'member-chips', event: 'criteria-changed', detail: { surname: 'nobody-by-that-name' } },
        expectRender: { 'member-results': 'No members found' },
        expect: { resultCount: 0 },
      },
    ],
  },
  {
    /**
     * THE BACKEND FAILING, driven through the region.
     *
     * The island's fixtures answer `{ surname: 'unreachable-backend' }` with a 500, so this drives the
     * component's own `.catch` — `MotuError` in, `status: 'error'` out — rather than a state a seed
     * asserted into place. The island's scenario set already pictures this; what it could not show is
     * that a FILTER ARRIVING FROM ANOTHER ISLAND reaches the failure, which is how a user meets it.
     */
    name: 'a failing search reaches the error state through the region',
    seed: SEED,
    steps: [
      {
        emit: { slot: 'member-chips', event: 'criteria-changed', detail: { surname: 'unreachable-backend' } },
        expectRender: { 'member-results': 'Something went wrong' },
      },
    ],
  },
  {
    // THE SUSPENDED MEMBERS — twenty of them, and the list a coordinator actually opens this page for.
    // Guido Clarke is suspended and far past page one; the chip prints the status in its own words.
    name: 'filtering to suspended members',
    seed: SEED,
    steps: [
      {
        emit: { slot: 'member-chips', event: 'criteria-changed', detail: { status: 'suspended' } },
        expectRender: { 'member-results': 'Clarke', 'member-chips': 'Suspended' },
        expect: { resultCount: 20 },
      },
    ],
  },
  {
    // THE PLAN FILTER. 76 premium members; Bjarne Cerf is one of them and is not on page one.
    name: 'filtering to the premium plan',
    seed: SEED,
    steps: [
      {
        emit: { slot: 'member-chips', event: 'criteria-changed', detail: { plan: 'premium' } },
        expectRender: { 'member-results': 'Bjarne', 'member-chips': 'Premium' },
        expect: { resultCount: 76 },
      },
    ],
  },
  {
    // TWO FILTERS AT ONCE, and the `notText` is what proves BOTH reached the fetch. Suspended alone
    // would list Guido Clarke; he is on the standard plan, so with premium applied as well he must be
    // gone — 11 rows, Nadia Kowalska among them.
    name: 'two filters narrow together',
    seed: SEED,
    steps: [
      {
        emit: { slot: 'member-chips', event: 'criteria-changed', detail: { status: 'suspended', plan: 'premium' } },
        expectRender: { 'member-results': { text: 'Kowalska', notText: 'Clarke' } },
        expect: { resultCount: 11 },
      },
    ],
  },
  {
    // THE SEARCH ISLAND DRIVING THE OTHER TWO. Every flow above emits from the chips; this one starts
    // where a person starts — the search — and asserts on BOTH islands it does not own: the chip that
    // appears for the new filter, and the list it narrows. Grace Salazar is past page one.
    name: 'a search reaches the chips and the list',
    seed: SEED,
    steps: [
      {
        emit: { slot: 'member-search-ng', event: 'criteria-changed', detail: { firstname: 'Grace' } },
        expectRender: { 'member-results': 'Salazar', 'member-chips': 'Grace' },
        expect: { resultCount: 3 },
      },
    ],
  },
  {
    // A SEARCH BY EMAIL, the field people paste. Five addresses contain "salazar".
    name: 'searching by email',
    seed: SEED,
    steps: [
      {
        emit: { slot: 'member-search-ng', event: 'criteria-changed', detail: { email: 'salazar' } },
        expectRender: { 'member-results': 'Elena', 'member-chips': 'salazar' },
        expect: { resultCount: 5 },
      },
    ],
  },
  // NO FLOW FOR CLEARING THE FILTERS, and `flow-mutation` is the reason.
  //
  // One was written — seed `{ surname: 'Wu' }`, emit `criteria-changed` with `{}`, expect `Hopper`
  // back — and the check refused it: the assertion still held when the stimulus was changed, so it was
  // asserting a constant. It is right, and the flow cannot be repaired. The fixture's filter ignores
  // any criteria field it does not recognise, so EVERY stimulus that is not a valid narrowing filter
  // produces the same full list — "cleared" and "garbage" are indistinguishable by what renders, which
  // is exactly what "this step could not have failed" means.
  //
  // Left as a note rather than as a weakened step: the narrowing flow above already proves the region
  // carries `criteria` to the fetch, and a step that cannot fail would only make the set look larger.
];
