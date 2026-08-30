// The Org Lookup arrangement: the lookup and its readout across the top, then the drill-down —
// structure, people, person — as three columns that fill left to right as you choose.
export const ADMIN_LAYOUT = `
<div class="org-screen">
  <div class="org-screen__bar">
    <div class="org-screen__lookup">
      <motu-island slot="company-lookup" theme="motu" fit="native"></motu-island>
      <motu-island slot="selected-company" theme="motu" fit="native"></motu-island>
    </div>
    <motu-island slot="org-headcount" theme="motu" fit="native"></motu-island>
  </div>
  <div class="org-screen__cols">
    <section class="org-screen__col">
      <h3 class="org-screen__title">Structure</h3>
      <motu-island slot="org-tree" theme="motu" fit="native"></motu-island>
    </section>
    <section class="org-screen__col">
      <h3 class="org-screen__title">People</h3>
      <motu-island slot="org-people" theme="motu" fit="native"></motu-island>
    </section>
    <section class="org-screen__col">
      <h3 class="org-screen__title">Selected</h3>
      <motu-island slot="org-person" theme="motu" fit="native"></motu-island>
    </section>
  </div>
</div>`;
