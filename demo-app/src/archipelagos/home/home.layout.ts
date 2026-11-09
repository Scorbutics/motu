// My club's arrangement as the LAGOON renders it — the second description of `HomePage.tsx`, in the
// page's own classes: your standing across the top, your events and chapter beside the club's quest
// and Cup.
export const HOME_LAYOUT = `
<div class="cl-home cl-scope motu-root" data-motu-theme="motu">
  <motu-island slot="my-standing" theme="motu" fit="native"></motu-island>
  <div class="cl-home__body">
    <div class="cl-home__main">
      <motu-island slot="my-events" theme="motu" fit="native"></motu-island>
      <motu-island slot="my-chapter" theme="motu" fit="native"></motu-island>
    </div>
    <aside class="cl-home__aside">
      <motu-island slot="home-quest" theme="motu" fit="native"></motu-island>
      <motu-island slot="home-cup" theme="motu" fit="native"></motu-island>
    </aside>
  </div>
</div>`;
