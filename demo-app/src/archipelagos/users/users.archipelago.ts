// The Users page: create a member, and see the profile that would result.
//
// TWO ISLANDS, ONE KEY, AND THE COUPLING IS THE POINT. The form owns `draft` and publishes it on
// every keystroke; the card binds it and renders. Neither imports the other, and the card cannot
// write the key it reads — the region's type omits a produced key, so a page trying to feed it is a
// compile error rather than a second writer nobody notices.
//
// This replaces the old `x-user-search` island, which is gone: the page is no longer a search box
// looking for members, it is the act of creating one and seeing what results.

import type { ArchipelagoConfig } from '@motu/core';

export const usersArchipelago: ArchipelagoConfig = {
  id: 'users',
  islands: [
    {
      slot: 'member-form',
      element: 'x-member-form',
      // Bound so the fields follow the key: a reset, or a seeded state in the lagoon, lands in the
      // inputs without the form keeping a second copy of the truth.
      bind: { draft: 'draft' },
      // THE ONE PRODUCER of `draft`. Declared rather than implemented in a handler, so the ownership
      // is checkable before anything runs — and so `motu check` fails if a second island claims it.
      writes: { 'member-draft': 'draft' },
      on: {
        'member-reset': (_detail, { store }) => store.set('draft', {}),
      },
    },
    {
      slot: 'member-card',
      element: 'x-member-card',
      // Reads what the form produces. No `writes`, no `on`: a pure projection of one key.
      bind: { draft: 'draft' },
    },
  ],
  layout: `
<div class="gm-arch gm-arch--split">
  <motu-island slot="member-form" theme="motu" fit="native"></motu-island>
  <motu-island slot="member-card" theme="motu" fit="native"></motu-island>
</div>`,
};
