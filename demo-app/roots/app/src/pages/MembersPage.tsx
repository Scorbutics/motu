// The members page — the directory, gamified.
//
// NOTICE WHAT IS HERE AND WHAT IS NOT. The page does not fetch members, does not filter, does not
// hold the criteria, does not count the results and does not compute anyone's level: each of those
// belongs to an island or to the region. What the page DOES own is two host facts — the club's game
// state for today (computed by the app's own `clubSource` over the same port the table reads) and
// which backend this build talks to — and the ARRANGEMENT: which islands, in which order, in which
// column.
//
// STAGE ONE. The islands are placed in the page's own JSX; the region's `layout` template is what
// the lagoon renders, a second description of the same arrangement using the same classes. The
// region earns `root` when the AngularJS ocean no longer embeds it through that template.
import { useEffect } from 'react';
import { todayIso } from 'demo-app';
import { Members } from '../motu/members-region.js';
import { IN_BROWSER_DATA } from '../lib/app-data.js';
// The club's game state for today, computed once per visit from every member — shared with My club.
import { useClubOverview } from '../lib/club-overview.js';

/** Feeds the region its three host-fed keys. Inside the provider, because `provide` reaches it there. */
function MembersFeed() {
  const asOf = todayIso();
  const overview = useClubOverview(asOf);
  useEffect(() => {
    Members.provide('asOf', asOf);
    Members.provide('dataSource', IN_BROWSER_DATA ? 'sandbox' : 'live');
  }, [asOf]);
  useEffect(() => {
    if (overview) Members.provide('overview', overview);
  }, [overview]);
  return null;
}

/**
 * The result count, read back from the region and ANNOUNCED — a screen reader hears "3 members found"
 * after a search, which a sighted reader learns by glancing at the table. Produced by the table; the
 * page only reads it, and could not keep its own copy if it tried.
 */
function ResultAnnouncer() {
  const region = Members.useRegion();
  const count = typeof region.resultCount === 'number' ? region.resultCount : undefined;
  return (
    <p className="cl-sr" aria-live="polite">
      {count === undefined ? '' : `${count} member${count === 1 ? '' : 's'} found`}
    </p>
  );
}

export function MembersPage() {
  return (
    <Members.Region>
      <MembersFeed />
      {/* THE SKIN MARKER: the island stylesheet resolves its tokens on `.motu-root`. */}
      <div className="cl-members cl-scope motu-root" data-motu-theme="motu">
        <Members.Island slot="member-header" />
        <Members.Island slot="member-highlights" />
        <div className="cl-members__body">
          <section className="cl-members__main cl-card" aria-label="All members">
            <div className="cl-card__tools">
              <Members.Island slot="member-quick-search" className="cl-card__search" />
              <Members.Island slot="member-plan-tabs" />
              <Members.Island slot="member-actions" className="cl-card__new" />
            </div>
            <Members.Island slot="member-results" />
          </section>
          <aside className="cl-members__aside">
            <Members.Island slot="weekly-quest" />
            <Members.Island slot="high-scores" />
            <Members.Island slot="chapter-cup" />
            <Members.Island slot="fresh-unlocks" />
          </aside>
        </div>
        <ResultAnnouncer />
      </div>
    </Members.Region>
  );
}
