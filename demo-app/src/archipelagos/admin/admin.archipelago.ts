// The company-lookup demo page (admin): a lookup island that publishes its selection into the store,
// and a companion island that renders whatever is selected.

import type { ArchipelagoConfig } from '@motu/core';

export const adminArchipelago: ArchipelagoConfig = {
  id: 'admin',
  islands: [
    {
      slot: 'company-lookup',
      element: 'x-company-lookup',
      on: {
        'company-selected': (detail, { store }) => store.set('selectedCompany', detail),
      },
    },
    {
      slot: 'selected-company',
      element: 'x-selected-company',
      bind: { company: 'selectedCompany' },
    },
  ],
  layout: `
<div class="gm-arch">
  <motu-island slot="company-lookup" theme="motu" fit="native"></motu-island>
  <motu-island slot="selected-company" theme="motu" fit="native"></motu-island>
</div>`,
};
