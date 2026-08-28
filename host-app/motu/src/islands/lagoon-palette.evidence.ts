// Lagoon EVIDENCE for lagoon-palette — a surface that is invisible most of the time.
//
// WHICH IS EXACTLY WHY IT NEEDS THESE. A palette is behind a keystroke: nobody sees its empty result,
// its long list or its ranking unless they go looking, and "go looking" is not a thing a check does.
// Seeded open, each state is an address.
import type { Scenario } from '@motu/runtime/mock';
import { REPOS, GROUPS } from '../shared/index-evidence.js';

export const fixtures = [];
export const roles: string[] = [];

export const scenarios: Scenario[] = [
  {
    // Closed. The component renders NOTHING, which is a state worth pinning: it is what every visitor
    // who never presses ⌘K sees, and an overlay that leaked a scrim would be invisible in every other
    // check and obvious here.
    //
    // SEEDED false, not omitted. An absent prop falls back to the component's default and an explicit
    // false is a value the region produced; `input-coverage` counts them apart, and it is right to —
    // only the second is what a region that has been opened and closed again actually holds.
    name: 'closed, which is almost always',
    seed: { repos: REPOS, groups: GROUPS, open: false },
  },
  {
    // Open with nothing typed: the whole host, ranked as it arrives, capped at eight.
    name: 'open, showing everything it holds',
    seed: { repos: REPOS, groups: GROUPS, open: true },
  },
  {
    // RANKED. "motu" matches a group, four repositories and their lagoons; what this state pins is
    // the order, which is the only part of a fuzzy search anybody can get wrong quietly.
    name: 'a query, ranked',
    seed: { repos: REPOS, groups: GROUPS, open: true, query: 'motu' },
  },
  {
    // The empty result. Its own sentence, naming what was typed — a palette that just shows nothing
    // reads as broken rather than as a miss.
    name: 'nothing matches',
    seed: { repos: REPOS, groups: GROUPS, open: true, query: 'qqzz' },
  },
  {
    // A HOST WITH NOTHING ON IT, palette open. The state that breaks, and the one `input-coverage`
    // asked for: every seeded input crossed, rather than varied one at a time.
    name: 'open over an empty host',
    seed: { repos: [], groups: [], open: true },
  },
  {
    // Closed over an empty host, which is the very first thing a new host renders.
    name: 'closed over an empty host',
    seed: { repos: [], groups: [], open: false },
  },
];
