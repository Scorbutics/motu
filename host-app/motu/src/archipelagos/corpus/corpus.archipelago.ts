// The corpus page (`/corpus`) — the recorded states this host has ingested for one region.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE STAGE-1 EXAMPLE. Read this beside `signin/signin.archipelago.ts`, which is stage 2.
//
// There is NO `root` here and NO `slots`, on purpose. The page composes the region itself with
// `<Corpus.Island slot="…">` inside its own JSX (`app/corpus/corpus-screen.tsx`), and the lagoon is
// given a frame that holds islands and fragments only
// (`roots/lagoon/src/regions/corpus.tsx`). `motu check`'s `region-root` grades that shape `ok` and
// names `root` without failing on it — which is what lets a project adopt motu without refactoring
// its pages on day one.
//
// WHAT IT COSTS, stated here rather than discovered later: the lagoon shows the region's islands, not
// the page's arrangement. The heading, the summary line and the layout in `corpus-screen.tsx` are the
// page's own and appear nowhere in the preview. That is the honest trade of stage 1, and it is why
// stage 2 exists — see docs/06-composition-and-adoption.md.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
import { archipelago } from '@motu/core';
import type { ProducedKeysAre, RegionOwnershipOk } from '@motu/core';
// TYPE-ONLY, from the app: the page's vocabulary is the application's to name.
import type { CorpusRegion, ProducedCorpusKeys } from '@/app/corpus/corpus-region';

export const corpusArchipelago = archipelago<CorpusRegion, 'x-corpus-filter' | 'x-corpus-states'>()({
  id: 'corpus',
  islands: [
    {
      slot: 'corpus-filter',
      element: 'x-corpus-filter',
      // `value` is the region's `filter` under the component's own name; `unacceptedCount` is
      // host-fed, because the page already has the list and counting it twice is how the two disagree.
      bind: [{ value: 'filter', unacceptedCount: 'unacceptedCount' }],
      // THE REGION'S ONE PRODUCED KEY. Declared here, so a second island claiming it is a static
      // error rather than a runtime store complaint reached after the work is done.
      writes: { 'filter-changed': 'filter' },
    },
    {
      slot: 'corpus-states',
      element: 'x-corpus-states',
      // Reads what the other island decided. Nothing in either component knows the other exists.
      bind: ['states', 'filter', 'regionId'],
    },
  ],
});

/**
 * The two compile-time guards, as constants rather than aliases so a drift fails HERE.
 *
 * `ProducedKeysAre` pins the produced set to what the app's own type says; `RegionOwnershipOk`
 * refuses a region whose islands claim a key the vocabulary does not have.
 */
const _produced: ProducedKeysAre<typeof corpusArchipelago, ProducedCorpusKeys> = true;
const _ownership: RegionOwnershipOk<typeof corpusArchipelago> = true;
void _produced;
void _ownership;
