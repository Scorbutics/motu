// Lagoon EVIDENCE for viewer-badge — two states, and the difference between them matters more than
// anything else on this page.
//
// SHOWING A NAME IS A CLAIM that the session is good. The failure worth engineering against is the
// safe-LOOKING one: a badge that keeps rendering a handle after the session is gone, so somebody
// believes they are signed in while every gated request quietly 404s. These two states are what a
// person compares to know which they are in, and neither is reachable by looking at the live page —
// you would have to actually sign out to see the other.
import type { Scenario } from '@motu/runtime/mock';

export const fixtures = [];
export const roles: string[] = [];

export const scenarios: Scenario[] = [
  {
    // A VISITOR. `seed: {}` is the component's own default, which is deliberately this one: most
    // readers of a public lagoon are nobody, and the corner shows them the way in.
    name: 'a visitor, with the way in',
    seed: {},
  },
  {
    // SIGNED IN. The handle, and the disc that gets you out of it.
    name: 'signed in, with the way out',
    seed: { viewer: { handle: 'Scorbutics', initial: 'S' } },
  },
  {
    // A LONG HANDLE, because the badge sits at the hard right of a bar that also carries three
    // numbers. GitHub allows 39 characters and this is what one costs.
    name: 'a handle as long as GitHub allows',
    seed: { viewer: { handle: 'a-very-long-github-handle-indeed-abcdef', initial: 'A' } },
  },
];
