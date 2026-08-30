// Scenarios for dock-regions — every state the station list can be in.
//
// A CONTROLLED CONTROL: the region holds both keys, so each state here is reachable by seeding, which
// is also what lets a link or a flow put the list into any of them.
import type { Scenario } from '@motu/runtime/mock';
import { STATIONS } from '../shared/lagoon-view-evidence.js';

export const fixtures = [];
export const roles: string[] = [];

export const scenarios: Scenario[] = [
  {
    // WHAT AN ARTIFACT THAT HAS NOT ANSWERED YET LOOKS LIKE — and it is the default state, because
    // an island must render from defaults alone. It is a different sentence from "this lagoon
    // declares no regions", which is the distinction the dock got wrong for a week.
    name: 'before the lagoon has answered',
    seed: {},
  },
  {
    // The ordinary state: four regions, one of them framed.
    name: 'four regions, one of them framed',
    seed: { regions: STATIONS, region: 'review' },
  },
  {
    // FRAMING A DIFFERENT ONE, so the set of scenarios cannot render identically — `data-flow` fails
    // a scenario set whose members look the same, and this pair is what proves the lit row follows
    // the key rather than sitting on row one.
    name: 'the first region is the framed one',
    seed: { regions: STATIONS, region: 'corpus' },
  },
  {
    // A REGION NOBODY DECLARES. The address said one thing and the catalogue says another, so no row
    // is lit — the honest rendering, rather than lighting the nearest one.
    name: 'the framed region is not in the catalogue',
    seed: { regions: STATIONS, region: 'no-such-region' },
  },
];
