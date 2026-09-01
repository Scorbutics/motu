// The front page (`/`) — what this host holds, and what THIS viewer may see of it.
//
// STAGE 2, like `signin` and unlike `corpus`: this page has a real arrangement — a chrome bay over
// two cards — and declaring it as `root` is what keeps the page and the lagoon composing it the same
// way. See `signin/signin.archipelago.ts`; the trade is written up in its header.
//
// WHY THIS PAGE IS A REGION AT ALL, given that neither island does anything: because both of them can
// LEAK. Every value they render has been filtered by `authorize` upstream, and the failure mode is not
// a crash — it is a repository name appearing in a list for somebody who may not open it. That state
// is invisible in every check motu had here before this file existed: `motu check` looked at the
// signin region and reported PASS while the host's own front page named private repositories.
//
// It is also the page the CLAUDE.md rule was written about. "Every screen motu itself ships — the
// review console, THE LAGOON HOST'S PAGES — is islands and archipelagos." This page was moved into
// the app and rendered from `views.mjs`'s string concatenation, byte-identical and not motu at all.
// That was caught by looking at the screen and asking where it was in the lagoon.
import { archipelago } from '@motu/core';
import type { ElementTypes } from '../../islands/registry';
// THE REGION'S ROOT — the APPLICATION's own layout, imported.
import { IndexLayout } from '@/app/index-layout';
// TYPE-ONLY, from the app: the page's vocabulary is the application's to name.
import type { IndexRegion, ProducedIndexKeys } from '@/app/index-region';

export const indexArchipelago = archipelago<
  IndexRegion,
  // A `Pick` OF THE ELEMENTS MAP, not a bare tag union: same five tags, plus the contracts that make
  // `wiring` assertable.
  Pick<ElementTypes, 'x-lagoon-filter' | 'x-lagoon-palette' | 'x-lagoon-repos' | 'x-lagoon-stats' | 'x-viewer-badge'>,
  ProducedIndexKeys
>()({
  id: 'index',
  root: IndexLayout,
  // The app's prop name on the left, motu's slot on the right. The page passes `repositories`; it
  // never writes a slot name.
  //
  // NO `composed` SLOT ANY MORE. This page listed the composed GALLERIES above the repositories, and
  // they were noise: on this host every group holds very nearly every repository, so the rows said
  // the same thing twice and pushed the actual list down the page. A gallery is a way of LOOKING at
  // lagoons, not a thing to browse alongside them — and every lagoon now carries the rail that lets
  // you move between them, which is what the group listing was really for.
  slots: {
    readout: { slot: 'readout' },
    filter: { slot: 'filter' },
    palette: { slot: 'palette' },
    account: { slot: 'account' },
    repositories: { slot: 'repositories' },
  },
  islands: [
    {
      // The bay's readout. An island because it SHOWS a total, not because of where it sits — see
      // index-layout.tsx for the call I got wrong first and what it cost.
      slot: 'readout',
      element: 'x-lagoon-stats',
      bind: [{ stats: 'stats' }],
    },
    {
      // WHO IS READING THIS. Beside the readout, on the water — an island because it SHOWS an
      // identity and ACTS on one, and the smallest one here with the most at stake: a badge that
      // keeps rendering a handle after the session is gone is the safe-LOOKING failure.
      slot: 'account',
      element: 'x-viewer-badge',
      bind: [{ viewer: 'viewer' }],
    },
    {
      // THE PAGE'S ONE CONTROL, and the region's only producer. Declared here, so a second island
      // claiming either key is a static error rather than a runtime store complaint reached after
      // the work is done.
      slot: 'filter',
      element: 'x-lagoon-filter',
      bind: ['query'],
      writes: { 'query-changed': 'query' },
    },
    {
      // ⌘K. The region's second producer, and the only island that reads BOTH listings — it searches
      // what the viewer may see, which is why it takes the same already-filtered lists the page shows
      // rather than a query of its own.
      slot: 'palette',
      element: 'x-lagoon-palette',
      bind: [{ repos: 'repos', open: 'paletteOpen', query: 'paletteQuery' }],
      writes: { 'palette-open': 'paletteOpen', 'palette-query': 'paletteQuery' },
    },
    {
      slot: 'repositories',
      element: 'x-lagoon-repos',
      bind: [{ repos: 'repos', cap: 'cap' }, 'query'],
    },
  ],
},
/**
 * Every key an island reads has exactly one owner, every wired event exists on the island wired to
 * it, and the region's produced keys are the set the app's own type names — here, none.
 */
{ ownership: true, wiring: true, produced: true });
