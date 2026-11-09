// Lagoon EVIDENCE for lagoon-palette — a surface that is invisible most of the time.
//
// WHICH IS EXACTLY WHY IT NEEDS THESE. A palette is behind a keystroke: nobody sees its empty result,
// its long list or its ranking unless they go looking, and "go looking" is not a thing a check does.
// Seeded open, each state is an address.
import type { Scenario } from '@motu/runtime/mock';
import { REPOS, REPOS_WITH_LIVE } from '../shared/index-evidence.js';

export const fixtures = [];
export const roles: string[] = [];

export const scenarios: Scenario[] = [
  // NOT HERE: the two CLOSED states (over five repositories, and over an empty host). Closed, the
  // palette renders NOTHING — correctly — and `data-flow` cannot compare a blank render against the
  // others: "if its empty state is deliberate, that scenario does not belong here". Both sank
  // `motu check --runtime` on every push from 5 Nov until they were taken out. What they pinned — no
  // scrim leaking while closed — is a property of the PAGE around the palette, so it belongs in a
  // region flow or a host test rather than in an island scenario that the comparison refuses.
  {
    // Open with nothing typed. MORE THAN IT SHOWS: five repositories with their lagoons and two
    // groups make twelve entries and the palette holds eight, so this is also the state where the
    // count of what is held back has to be on screen. A fresh reader found that missing — the palette
    // listed less than the page it covered and gave no sign of it.
    name: 'open, holding more than it shows',
    seed: { repos: REPOS, open: true },
  },
  {
    // RANKED. "motu" matches a group, four repositories and their lagoons; what this state pins is
    // the order, which is the only part of a fuzzy search anybody can get wrong quietly.
    name: 'a query, ranked',
    seed: { repos: REPOS, open: true, query: 'motu' },
  },
  {
    // The empty result. Its own sentence, naming what was typed — a palette that just shows nothing
    // reads as broken rather than as a miss.
    name: 'nothing matches',
    seed: { repos: REPOS, open: true, query: 'qqzz' },
  },
  {
    // LIVE RANKS FIRST. With nothing typed the palette is the host in its arrival order; a lagoon
    // somebody is editing jumps the queue, because it is the one entry whose content will differ
    // from the last time they looked. Only a scenario can show that ordering.
    name: 'a live lagoon comes first',
    seed: { repos: REPOS_WITH_LIVE, open: true },
  },
  {
    // A HOST WITH NOTHING ON IT, palette open. The state that breaks, and the one `input-coverage`
    // asked for: every seeded input crossed, rather than varied one at a time.
    name: 'open over an empty host',
    seed: { repos: [], open: true },
  },
];
