// The users page. Add islands with `motu island integrate <name> --archipelago users`.

import type { ArchipelagoConfig } from '@motu/core';

export const usersArchipelago: ArchipelagoConfig = {
  id: 'users',
  islands: [
    {
      slot: 'user-search',
      element: 'x-user-search',
      // Keep the search fields in sync with resets elsewhere, and publish criteria for the (future)
      // Users results island to self-fetch on.
      bind: { criteria: 'criteria' },
      on: {
        'criteria-changed': (detail, { store }) => store.set('criteria', detail),
        reset: (_detail, { store }) => store.set('criteria', {}),
      },
    },
  ],
  layout: `
<div class="gm-arch">
  <motu-island slot="user-search" theme="motu" fit="native"></motu-island>
</div>`,
};
