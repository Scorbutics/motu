// Lagoon EVIDENCE for lagoon-repos — every shape the repositories card takes.
//
// The state worth pinning hardest is the FIRST one: an empty host. It is what a person sees on the
// day they stand one up, it is the only place on the page that tells them what to do next, and it is
// unreachable on any host that has ever been published to — which is every host anybody develops
// against. Nothing but a scenario can put it on screen.
import type { Scenario } from '@motu/runtime/mock';
import { REPOS, REPOS_WITH_LIVE, ONE_REPO, FILTERED_REPOS, CAP } from '../shared/index-evidence.js';

export const fixtures = [];
export const roles: string[] = [];

export const scenarios: Scenario[] = [
  {
    // `seed: {}` MEANS the empty state — the lanes reset between scenarios, so this is the component's
    // own defaults and not whichever scenario ran before it.
    // SEEDED EXPLICITLY EMPTY, not `seed: {}`. Those are different states: an absent prop falls back
    // to the component's default, an empty array is a value the region actually produced. Only the
    // second is what a real host with nothing published sends, and `input-coverage` is right to
    // count them apart.
    name: 'a host with nothing published',
    seed: { repos: [], cap: CAP },
  },
  {
    name: 'the host as it stands',
    seed: { repos: REPOS, cap: CAP },
  },
  {
    // The singular. "1 lagoon · 1 record" is a different sentence from "1 lagoons · 1 records", and
    // it is only wrong on the smallest host anybody has.
    name: 'one repository, singular everywhere',
    seed: { repos: ONE_REPO, cap: CAP },
  },
  {
    // SOMEBODY IS WORKING ON ONE OF THEM. The badge, and the line under the name that says what it
    // means — a state that exists only while a dev server is running, and therefore only exists on
    // screen here.
    name: 'one of them is being served live',
    seed: { repos: REPOS_WITH_LIVE, cap: CAP },
  },
  {
    // A VIEWER WHO MAY SEE SOME OF IT. Two of five, filtered upstream by `authorize`. This is the
    // state the whole region exists for: rendering a partial list is correct, and rendering the full
    // one to this viewer is the leak.
    name: 'a viewer who may see two of five',
    seed: { repos: FILTERED_REPOS, cap: CAP },
  },
];
