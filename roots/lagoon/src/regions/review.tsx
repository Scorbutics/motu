// The review console region, for the lagoon: what the page establishes, and where the islands sit.
//
// The arrangement is the page's own — a rail of projects, a list of shots, and a viewer filling the
// rest. Nothing here is invented chrome; when the page grows a layout component worth naming, this
// becomes a call to it.
import type { ReactNode } from 'react';
import type { LagoonOverrides } from '@motu/react';
import { REPOS } from '../../../../src/shared/review-evidence.js';

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
    <div className="rv">
      <header className="rv-head">
        <h1>Baseline review</h1>
        {island('status-summary')}
      </header>
      <div className="rv-body">
        <aside className="rv-rail">{island('repo-picker')}</aside>
        <nav className="rv-shots">{island('shot-list')}</nav>
        <main className="rv-view">
          {island('diff-viewer')}
          {island('accept-bar')}
        </main>
      </div>
    </div>
  );
}
