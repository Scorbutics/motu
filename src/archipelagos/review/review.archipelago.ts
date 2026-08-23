// The baseline review console — one page, five islands.
//
// Declared WHOLE before any island exists, with `planned: true` on each. That is what makes the
// ownership real: `selectedShot` has exactly one producer from the first commit, so a second island
// claiming it fails on the next `motu check` rather than after both are written.
//
// The coupling this region exists to hold: picking a repo changes what the list shows, picking a shot
// changes what the viewer shows, and accepting changes the statuses the list renders. None of those
// travel by prop between islands — they go through the region or they are not declared.
import { archipelago } from '@motu/core';
import type { ProducedKeysAre, RegionOwnershipOk, RegionWiringOk } from '@motu/core';
import type { ElementTypes } from '../../islands/registry';
import type { ReviewRegion, ProducedReviewKeys } from '@/lib/review-region';
import { shotsSource } from '@/lib/shots-source';

export const reviewArchipelago = archipelago<ReviewRegion, keyof ElementTypes>()({
  id: 'review',
  islands: [
    {
      slot: 'repo-picker',
      element: 'x-repo-picker',
      bind: [{ repos: 'repos', value: 'selectedRepo' }],
      writes: { 'repo-selected': 'selectedRepo' },
    },
    {
      slot: 'shot-list',
      element: 'x-shot-list',
      bind: [{ shots: 'shots', selected: 'selectedShot', busy: 'busy' }],
      writes: { 'shot-selected': 'selectedShot' },
    },
    {
      slot: 'diff-viewer',
      element: 'x-diff-viewer',
      // `shotUrl` stays the PAGE's to supply — where the host lives is not region state.
      bind: [{ shots: 'shots', shot: 'selectedShot', mode: 'viewMode' }],
      writes: { 'view-changed': 'viewMode' },
    },
    {
      // ACCEPTING IS AN INTENT, not a write. What the statuses become is the host's answer — it POSTs,
      // then refetches — so this island produces no key. An island that wrote `shots` itself would be
      // claiming an answer only the host can give.
      slot: 'accept-bar',
      element: 'x-accept-bar',
      // `shots` IS bound, and how many are pending is worked out from it here. It used to be counted
      // in the page and handed over as a prop — a value derived from region state, travelling by prop
      // between two islands that both read the region. The lagoon showed exactly what that costs: the
      // summary said "CHANGED 1 NEW 1" while the bar beside it said "Accept all 0 pending", because
      // in the lagoon there is no page to do the counting.
      bind: [{ repo: 'selectedRepo', shot: 'selectedShot', busy: 'busy', shots: 'shots' }],
      // ACCEPTING LEAVES THE REGION as a declared intent, answered by the `shots` source. The page
      // used to pass an `onAcceptRequested` callback that POSTed and refetched — so accepting was a
      // thing only the page could do, and the lagoon's accept buttons did nothing at all.
      intents: { 'accept-requested': 'review-accept' },
    },
    {
      slot: 'status-summary',
      element: 'x-status-summary',
      bind: [{ shots: 'shots' }],
    },
  ],
  sources: {
    // The source ITSELF, imported: the region points at what produces its keys, not at a string.
    // This is what makes "picking a repo changes what the list shows" a declaration rather than two
    // effects in the page — the lagoon installs the same object over fixtures.
    shots: shotsSource,
  },
});

// The three cross-checks, as CONSTANTS. They were `type _Ownership = …` aliases, which assert nothing:
// a type alias NAMES the result, so a failing check quietly resolves to its error object and no one
// reads it. Only the assignment to `true` makes the compiler reject it.
const _everyKeyIsOwned: RegionOwnershipOk<typeof reviewArchipelago> = true;
const _everyWiredEventExists: RegionWiringOk<typeof reviewArchipelago, ElementTypes> = true;
const _producedKeysMatchTheApp: ProducedKeysAre<typeof reviewArchipelago, ProducedReviewKeys> = true;
void _everyKeyIsOwned;
void _everyWiredEventExists;
void _producedKeysMatchTheApp;
