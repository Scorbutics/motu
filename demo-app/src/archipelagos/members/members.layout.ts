// The members region's arrangement as the LAGOON renders it — the second description of the page,
// which is this region's stage-one shape (see MembersPage.tsx). Kept to the page's own classes
// (`.cl-members*`, `.cl-card*`, in the shared stylesheet) and the page's own order, so the two can be
// read side by side: header, tiles, then the members card beside the side column.
export const MEMBERS_LAYOUT = `
<div class="cl-members cl-scope">
  <motu-island slot="member-header" theme="motu" fit="native"></motu-island>
  <motu-island slot="member-highlights" theme="motu" fit="native"></motu-island>
  <div class="cl-members__body">
    <section class="cl-members__main cl-card" aria-label="All members">
      <div class="cl-card__tools">
        <motu-island class="cl-card__search" slot="member-quick-search" theme="motu" fit="native"></motu-island>
        <motu-island slot="member-plan-tabs" theme="motu" fit="native"></motu-island>
        <motu-island class="cl-card__new" slot="member-actions" theme="motu" fit="native"></motu-island>
      </div>
      <motu-island slot="member-results" theme="motu" fit="native"></motu-island>
    </section>
    <aside class="cl-members__aside">
      <motu-island slot="weekly-quest" theme="motu" fit="native"></motu-island>
      <motu-island slot="high-scores" theme="motu" fit="native"></motu-island>
      <motu-island slot="chapter-cup" theme="motu" fit="native"></motu-island>
      <motu-island slot="fresh-unlocks" theme="motu" fit="native"></motu-island>
    </aside>
  </div>
</div>`;
