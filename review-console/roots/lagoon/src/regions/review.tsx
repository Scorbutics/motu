// The review console region, for the lagoon: what the page establishes, and where the islands sit.
//
// THE ARRANGEMENT IS THE PAGE'S OWN — `ReviewLayout`, the same component `App.tsx` renders. This file
// used to hold a second copy of that JSX, which is the thing motu's rules forbid ("never a second copy
// of the arrangement, which drifts"): the page grows a phone layout, the preview keeps showing the old
// shape, and the surface a reviewer is judging stops being the surface that ships.
import type { ReactNode } from 'react';
import type { LagoonOverrides } from '@motu/react';
import { REPOS } from '../../../../src/shared/review-evidence.js';
import { ReviewLayout } from '../../../../src/ui/review-layout/ReviewLayout.js';

export const reviewSeed: NonNullable<LagoonOverrides['seed']>[string] = {
  repos: REPOS,
  // A project IS selected on open, because a console that opens on nothing shows nothing. `shots` is
  // NOT seeded: the channel answers the selection, and a seeded list would sit in front of it — the
  // first paint would show one project's shots and never move again, which is the bug this fixes.
  selectedRepo: 'Scorbutics/peps_ta_boite_app',
  viewMode: 'last',
  busy: false,
  error: null,
};

export function ReviewRegionFrame({ island }: { island: (slot: string) => ReactNode }) {
  return (
    <ReviewLayout
      title="Baseline review"
      summary={island('status-summary')}
      projects={island('repo-picker')}
      shots={island('shot-list')}
      viewer={island('diff-viewer')}
      accept={island('accept-bar')}
    />
  );
}
