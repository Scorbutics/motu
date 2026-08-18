// The shared "new design" layout for the members archipelago: hero + toolbar + results. Rendered
// natively by <motu-archipelago name="members"> in the standalone app, and swapped in as a whole
// region when previewing inside the legacy app. Islands are pinned to the motu skin and the native
// footprint (the modern shape); legacy fit is only used when islands are embedded individually.
export const MEMBERS_LAYOUT = `
<div class="gm-arch">
  <motu-island slot="member-header" theme="motu" fit="native"></motu-island>
  <div class="gm-arch__toolbar">
    <motu-island slot="member-search-ng" theme="motu" fit="native"></motu-island>
    <motu-island slot="member-chips" theme="motu" fit="native" class="gm-arch__grow"></motu-island>
    <motu-island slot="member-actions" theme="motu" fit="native"></motu-island>
  </div>
  <motu-island slot="member-results" theme="motu" fit="native"></motu-island>
</div>`;
