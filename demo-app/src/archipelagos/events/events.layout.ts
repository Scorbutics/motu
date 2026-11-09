// The events region's arrangement as the LAGOON renders it — the second description of the page
// (`EventsPage.tsx`), in the page's own classes and order: the header, then the filters and the list
// beside the detail panel. Stage one, like every region in this app.
export const EVENTS_LAYOUT = `
<div class="cl-events cl-scope motu-root" data-motu-theme="motu">
  <motu-island slot="events-header" theme="motu" fit="native"></motu-island>
  <div class="cl-events__body">
    <section class="cl-events__main cl-card" aria-label="Upcoming events">
      <div class="cl-card__tools">
        <motu-island slot="event-filters" theme="motu" fit="native"></motu-island>
      </div>
      <motu-island slot="event-list" theme="motu" fit="native"></motu-island>
    </section>
    <div class="cl-events__aside">
      <motu-island slot="event-detail" theme="motu" fit="native"></motu-island>
    </div>
  </div>
</div>`;
