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
  // THE ARRANGEMENT TRAVELS WITH THE TEMPLATE, and the <style> is why.
  //
  // This markup is rendered by `<motu-archipelago>`, in ITS root — not inside an island's shadow
  // root, which is where the shared island stylesheet is adopted. So a `.gm-arch--split` rule written
  // in that sheet never reaches this div: the first version put the two-column grid there and the
  // region rendered as a narrow stacked column at 1400px wide, with nothing to say why.
  //
  // Scoped to this template's own class, so it styles the region's arrangement and nothing else.
  layout: `
<style>
  .gm-arch--split { display: grid; grid-template-columns: 1fr; gap: 16px; align-items: start;
    max-width: 1120px; margin: 20px auto; padding: 0 16px; }
  .gm-arch--split > motu-island { display: block; min-width: 0; }
  @media (min-width: 900px) { .gm-arch--split { grid-template-columns: minmax(0, 5fr) minmax(0, 6fr); } }
</style>
<div class="gm-arch gm-arch--split">
  <motu-island slot="member-form" theme="motu" fit="native"></motu-island>
  <motu-island slot="member-card" theme="motu" fit="native"></motu-island>
</div>`,
};
