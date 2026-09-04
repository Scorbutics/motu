// The members page.
//
// NOTICE HOW LITTLE IS HERE. The page does not fetch, does not filter, does not hold the criteria
// and does not count the results — every one of those belongs to an island or to the region, and
// each is declared somewhere a check can read it. What the page decides is ARRANGEMENT: which
// islands are on this screen, and in what order.
//
// It reads the region back, too, which is the half people skip. `resultCount` is produced by the
// results island; the page renders it in the footer. It cannot keep its own `useState` of that
// number — the region type omits produced keys, so assigning one is a compile error, and
// `integrate check` fails a page that shadows one anyway.
import { Members } from '../motu/members-region.js';

/** The footer line, which exists to prove the page can READ the region, not just fill it. */
function ResultFooter() {
  const region = Members.useRegion();
  const count = typeof region.resultCount === 'number' ? region.resultCount : undefined;
  return (
    <footer className="app__footer">
      {count === undefined ? 'Loading the directory…' : `${count} member${count === 1 ? '' : 's'} in the directory`}
    </footer>
  );
}

export function MembersPage() {
  return (
    <Members.Region>
      {/*
        THE SKIN IS DECLARED BY THE HOST, and it has to be said here.

        The island stylesheet defines its tokens on `:where(:host, .motu-root)` — a marker the
        CUSTOM-ELEMENT path adds for you. The React path renders the component directly, so nothing
        carries the marker and NO tokens resolve: `--_grad` is unset, `background: var(--_grad)`
        collapses to transparent, and the results panel's white heading lands on a cream page.
        Invisible, and identical in the lagoon, which is how it survived this long.
      */}
      <div className="app__page motu-root" data-motu-theme="motu">
        <Members.Island slot="member-header" />
        <div className="app__toolbar">
          <Members.Island slot="member-search-ng" />
          <Members.Island slot="member-chips" />
          <Members.Island slot="member-actions" />
        </div>
        <Members.Island slot="member-results" />
        <ResultFooter />
      </div>
    </Members.Region>
  );
}
