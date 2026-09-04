// Declared FLOWS for the members region — the couplings, as something that runs.
//
// WHY THIS REGION AND WHY NOW. The members page is the only surface in this repository whose islands
// fetch through the CONTRACT: `member-results` calls `MemberService.search(page, criteria)` itself,
// answered by `MockTransport` from the island's own fixtures. Every other region here reads its data
// through the wire fake or a channel, so until this file existed the contract door was exercised by a
// unit test and by nothing that renders. A door with no flow behind it is a door nobody has opened.
//
// The rows and the filter these steps rely on are the ISLAND's own fixtures
// (`src/islands/member-results/fixtures.mock.ts`) — a functional stub that really filters, which is
// what lets a flow drive a search and assert on the answer rather than on a recorded constant.
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
      { expectRender: { 'member-header': 'Browse and add community members', 'member-actions': 'Paste' } },
      // The chip's own vocabulary: `CRITERIA_LABELS.status` plus the display value the chips island
      // maps it to. The store holds `'active'`; only the chip prints `Active`.
      //
      // The search island is COLLAPSED here — it renders a `Filters` trigger with a count, and the
      // field labels live in a popover nobody has opened. `Member filters` is the dialog's accessible
      // name, which `expectRender` reads as part of what a person can perceive; asserting `Email`
      // asserted a screen this island only shows once clicked.
      { expectRender: { 'member-chips': 'Status', 'member-search-ng': 'Member filters' } },
      { expectRender: { 'member-results': 'Lovelace' } },
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
     * `Chien-Shiung` is the assertion on purpose. Fifteen rows, eight per page — Wu is row 11, so she
     * is NOT on the unfiltered first page and can only appear if the emitted criteria genuinely
     * reached the fetch. Any other stimulus lands on page one (no Wu) or on an empty list, which is
     * what makes this survive `flow-mutation` rather than assert a constant.
     */
    name: 'filtering in one island is what the results are for',
    seed: SEED,
    steps: [
      { expectRender: { 'member-results': { text: 'Lovelace', notText: 'Chien-Shiung' } } },
      {
        emit: { slot: 'member-chips', event: 'criteria-changed', detail: { surname: 'Wu' } },
        expectRender: { 'member-results': 'Chien-Shiung' },
        // The count is produced by `member-results`, not by the island that emitted — a region key
        // that only moves if the whole loop ran.
        expect: { resultCount: 1 },
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
