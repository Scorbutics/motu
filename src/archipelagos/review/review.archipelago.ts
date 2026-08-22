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
      bind: [{ repo: 'selectedRepo', shot: 'selectedShot', busy: 'busy' }],
    },
    {
      slot: 'status-summary',
      element: 'x-status-summary',
      bind: [{ shots: 'shots' }],
    },
  ],
});

type _Ownership = RegionOwnershipOk<typeof reviewArchipelago>;
type _Wiring = RegionWiringOk<typeof reviewArchipelago, ElementTypes>;
type _Produced = ProducedKeysAre<typeof reviewArchipelago, ProducedReviewKeys>;
