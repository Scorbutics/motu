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
import type { ElementTypes } from '../../islands/registry';
import type { ReviewRegion, ProducedReviewKeys } from '@/app/console/review-region';
import { shotsSource } from '@/src/review/shots-source';
// THE REGION'S ROOT — the APPLICATION's own layout, imported. It was already shared between the page
// and the lagoon frame by hand; declaring it makes that the same composition rather than two that
// happen to agree, which is what `region-root` asks and what the other three regions here already do.
import { ReviewLayout } from '@/components/review/review-layout/ReviewLayout';

export const reviewArchipelago = archipelago<ReviewRegion, ElementTypes, ProducedReviewKeys>()({
  id: 'review',
  root: ReviewLayout,
  // The app's prop name on the left, motu's slot on the right. The page passes `summary`, `projects`,
  // `shots`, `viewer` and `accept`; it never writes a slot name. `title`, `connect` and `error` are
  // not slots — they pass straight through to the layout.
  slots: {
    summary: { slot: 'status-summary' },
    // EXCLUSIVE ON `scopedRepo`. The page passes null for this slot when it was opened for one
    // project; without naming the condition here the LAGOON would mount the picker anyway and preview
    // a screen the application never shows. It does not move the decision — the page still decides by
    // passing a node or null — it lets the preview follow it.
    projects: { slot: 'repo-picker', unless: 'scopedRepo' },
    shots: { slot: 'shot-list' },
    viewer: { slot: 'diff-viewer' },
    accept: { slot: 'accept-bar' },
  },
  // WHICH OF THIS REGION'S KEYS ARE CLOSED SETS, for the coverage fold. `viewMode` is one of three
  // words wherever this region is mounted, so its value is safe to keep and worth keeping — the
  // difference between "the viewer showed something" and "the viewer showed the ACCEPTED image" is
  // exactly the kind of state a scenario set misses. Everything else stays a category.
  coverage: { enums: ['viewMode'] },
  islands: [
    {
      slot: 'repo-picker',
      element: 'x-repo-picker',
      // `shots` is bound so the SELECTED project can show how many are still waiting on a decision.
      // Only that one has shots in the region, and the picker says so by showing the count on that row
      // alone — an invented number on the others would be worse than none.
      bind: [{ repos: 'repos', value: 'selectedRepo', shots: 'shots' }],
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
} as const,
// THE CROSS-CHECKS THE REGION ASSERTS. Every key is owned, every wired event exists on the island
// that is wired to it, and the produced set is the one the app's own type names. Each property is
// the check's result type, so `true` is the only value that compiles and a drift is an error on
// that line naming the offending key. They were three `const _x: Check<…> = true` lines below this
// config; as an argument they cannot be forgotten wholesale — `ownership` is required.
{ ownership: true, wiring: true, produced: true });
