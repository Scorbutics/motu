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
import type { ProducedKeysAre, RegionOwnershipOk } from '@motu/core';
// THE REGION'S ROOT — the APPLICATION's own layout, imported.
import { IndexLayout } from '@/app/index-layout';
// TYPE-ONLY, from the app: the page's vocabulary is the application's to name.
import type { IndexRegion, ProducedIndexKeys } from '@/app/index-region';

export const indexArchipelago = archipelago<
  IndexRegion,
  'x-lagoon-filter' | 'x-lagoon-groups' | 'x-lagoon-repos' | 'x-lagoon-stats'
>()({
  id: 'index',
  root: IndexLayout,
  // The app's prop name on the left, motu's slot on the right. The page passes `composed` and
  // `repositories`; it never writes a slot name.
  slots: {
    readout: { slot: 'readout' },
    filter: { slot: 'filter' },
    composed: { slot: 'composed' },
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
      // THE PAGE'S ONE CONTROL, and the region's only producer. Declared here, so a second island
      // claiming either key is a static error rather than a runtime store complaint reached after
      // the work is done.
      slot: 'filter',
      element: 'x-lagoon-filter',
      bind: ['query', 'show'],
      writes: { 'query-changed': 'query', 'show-changed': 'show' },
    },
    {
      slot: 'composed',
      element: 'x-lagoon-groups',
      bind: [{ groups: 'groups' }, 'query', 'show'],
    },
    {
      slot: 'repositories',
      element: 'x-lagoon-repos',
      bind: [{ repos: 'repos', cap: 'cap' }, 'query', 'show'],
    },
  ],
});

/** Every key an island reads has exactly one owner. */
const _ownership: RegionOwnershipOk<typeof indexArchipelago> = true;
void _ownership;

/** The region's produced keys and the archipelago's `writes` are the same set — here, none. */
const _produced: ProducedKeysAre<typeof indexArchipelago, ProducedIndexKeys> = true;
void _produced;
