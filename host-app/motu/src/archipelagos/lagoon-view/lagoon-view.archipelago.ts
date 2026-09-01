// The lagoon VIEW — the page that frames a published artifact and puts its controls around it.
//
// THE SURFACE THIS PROJECT KEPT NOT DECLARING. `docs/survey-lagoon-view.md` is the survey; the short
// version is that roughly 3,900 lines of dock across three packages had no islands, no evidence and
// no flows, so `motu check` reported PASS over four regions while the screen a person actually uses
// to look at a lagoon was outside motu entirely. That is the same finding `index.archipelago.ts`
// records about itself one page earlier, and it was caught the same way: by looking at the screen and
// asking where it was in the lagoon.
//
// WHY IT IS A REGION rather than chrome. Its keys are shared and its bugs are coupling bugs, every
// one of them: the panel's list lighting "As seeded" whatever you pressed, the phone strip and the
// list disagreeing about which state is showing, switching region leaving the address claiming an
// island you had left. A key two controls read and one writes is exactly what an archipelago is for.
import { archipelago } from '@motu/core';
import type { ElementTypes } from '../../islands/registry';
// THE REGION'S ROOT — the APPLICATION's own arrangement, imported.
import { LagoonViewLayout } from '@/app/lagoon-view-layout';
// TYPE-ONLY, from the app: this screen's vocabulary is the application's to name.
import type { LagoonViewRegion, ProducedLagoonViewKeys } from '@/app/lagoon-view-region';

export const lagoonViewArchipelago = archipelago<
  LagoonViewRegion,
  // A `Pick` OF THE ELEMENTS MAP, not a bare tag union: same two tags, plus the contracts `wiring`
  // needs to check `flow-changed` against the island that dispatches it.
  Pick<ElementTypes, 'x-dock-regions' | 'x-dock-states'>,
  ProducedLagoonViewKeys
>()({
  id: 'lagoon-view',
  root: LagoonViewLayout,
  slots: {
    stations: { slot: 'stations' },
    states: { slot: 'states' },
    statesStrip: { slot: 'statesStrip' },
  },
  islands: [
    {
      // THE FIRST PRODUCER: which region is framed. Nothing else may write it.
      slot: 'stations',
      element: 'x-dock-regions',
      bind: ['regions', 'region'],
      writes: { 'region-changed': 'region' },
    },
    {
      // THE SECOND PRODUCER, and the panel's half of it.
      slot: 'states',
      element: 'x-dock-states',
      bind: ['states', 'flow'],
      writes: { 'flow-changed': 'flow' },
    },
    {
      // THE SAME ISLAND ON THE PHONE BAR. Ownership is grouped by ELEMENT, not by slot, so one island
      // in two placements stays one producer — which is the honest model here. Declaring a second
      // element for the strip would have made "either of these writes flow" the claim, and the
      // ownership guard would have been right to refuse it.
      slot: 'statesStrip',
      element: 'x-dock-states',
      bind: ['states', 'flow'],
      writes: { 'flow-changed': 'flow' },
    },
  ],
},
/**
 * Every key an island reads has exactly one owner, every wired event exists on the island wired to
 * it, and the produced keys are the set the app's own type names.
 */
{ ownership: true, wiring: true, produced: true });
