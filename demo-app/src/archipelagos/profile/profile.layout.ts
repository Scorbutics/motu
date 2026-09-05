// The profile page's ARRANGEMENT, in one place the page and the lagoon both render.
//
// This is the template `<motu-archipelago>` mounts, so it is the region's own root rather than a
// second drawing of the page. The `<style>` travels WITH it for a reason worth stating once: this
// markup is rendered in the archipelago's root, not inside an island's shadow root, which is where
// the shared island stylesheet is adopted. A grid rule written in that sheet never reaches this div
// — the first version of the users region put its two-column grid there and rendered as a narrow
// stacked column at 1400px wide, with nothing on screen to say why.
//
// THE SLOTS FOR THE CALENDAR ARE HERE BEFORE THE CALENDAR IS. Three of the five islands below are
// `planned: true` in the archipelago — surveyed, owned, not yet built. Their `<motu-island>` holders
// sit in the arrangement so the shape of the page is settled before anyone writes a component into
// it, which is the whole point of surveying a region up front.
export const PROFILE_LAYOUT = `
<style>
  .gm-profile {
    display: grid;
    grid-template-columns: 1fr;
    gap: 18px;
    align-items: start;
    max-width: 1120px;
    margin: 20px auto;
    padding: 0 16px;
  }
  .gm-profile > motu-island,
  .gm-profile .gm-profile__col > motu-island { display: block; min-width: 0; }
  .gm-profile__hero { grid-column: 1 / -1; }
  .gm-profile__col { display: grid; gap: 18px; align-content: start; min-width: 0; }
  /* Two columns only when there is room for both to be usable. The booking column carries the card
     and the summary, which are narrow by design; the calendar wants the wider half. */
  @media (min-width: 900px) {
    .gm-profile { grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); }
  }
</style>
<div class="gm-arch gm-profile">
  <motu-island class="gm-profile__hero" slot="profile-hero" theme="motu" fit="native"></motu-island>
  <div class="gm-profile__col">
    <motu-island slot="calendar-days" theme="motu" fit="native"></motu-island>
    <motu-island slot="calendar-slots" theme="motu" fit="native"></motu-island>
  </div>
  <div class="gm-profile__col">
    <motu-island slot="member-card" theme="motu" fit="native"></motu-island>
    <motu-island slot="booking-summary" theme="motu" fit="native"></motu-island>
  </div>
</div>`;
