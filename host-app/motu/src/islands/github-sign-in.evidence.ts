// Lagoon EVIDENCE for github-sign-in — the four things this control can be while somebody looks at it.
//
// Three of the four are failures, and that is not pessimism: the SUCCESS of this screen is a redirect,
// so the happy path has no state to look at. Everything left to see is a way it did not happen, which
// is exactly the set a component that owned its own `useState` would have made unreachable.
//
// A SCENARIO SEEDS THE ISLAND'S OWN PROPS, not the region's keys: a lone island is mounted through a
// synthesised config whose binds are same-named, so these are `error` and `isSubmitting` — the names
// in the component — while the region's flows speak of `signInError` and `signingIn`. Same values,
// two vocabularies, and the archipelago's `bind` maps one to the other.
import type { Scenario } from '@motu/runtime/mock';
import {
  ACCESS_DENIED,
  A_LAGOON_TO_RETURN_TO,
  EXPIRED_CODE,
  PROVIDER_UNCONFIGURED,
} from '../shared/signin-evidence.js';

export const fixtures = [];

export const roles: string[] = [];

export const scenarios: Scenario[] = [
  // What a first-time visitor sees, from the component's own defaults. `seed: {}` MEANS the empty
  // state — the lanes reset between scenarios, so this is not whichever one ran before it.
  //
  // NOT "waiting for a maintainer", which is what this was called until somebody read the screen: the
  // host models no roles at all. `access.mjs` has tokens and secrets, `store.mjs` has repos, records,
  // aliases and groups, and "member" in this host means a lagoon inside a composed group — never a
  // person. A scenario name renders in the lagoon's own badge, so an invented role is a word on screen.
  {
    name: 'a first visit',
    seed: {},
  },
  // Bounced here from a lagoon they were trying to read. The control says where it will bring them
  // back to, because a sign-in that silently forgets is one nobody trusts with a link.
  // NO SCENARIO FOR `returnTo` ALONE, and that is the check being right rather than a gap. It is a
  // hidden field — the control hands it back when it asks and renders nothing from it — so seeding it
  // produced a screen identical to the empty state above, and `data-flow` refused seven scenarios
  // that were only six. The address becomes visible when it becomes a DESTINATION, below.
  // Between the click and the browser leaving. In production this lasts a moment; when the redirect
  // never comes it lasts forever, and this is the only place it can be looked at.
  {
    name: 'handing over to github',
    seed: { isSubmitting: true, destination: '/' },
  },
  // The same moment, for somebody who followed a private link: the promise about coming back is the
  // one thing that makes a bounce through a third party feel survivable.
  {
    name: 'handing over, and saying where they land',
    seed: { isSubmitting: true, returnTo: A_LAGOON_TO_RETURN_TO, destination: A_LAGOON_TO_RETURN_TO },
  },
  // They reached GitHub and said no. The button must still be live underneath — the whole point of
  // separating this from the fault below is that trying again is a real option here.
  {
    name: 'github sent them back',
    seed: { authError: ACCESS_DENIED, isSubmitting: false },
  },
  // Our side failed and they never left. Different words, different colour, and NO suggestion to
  // retry, because retrying cannot work until somebody configures the provider.
  {
    name: 'the handoff could not start',
    seed: { error: PROVIDER_UNCONFIGURED },
  },
  // BOTH AT ONCE, which is not hypothetical: a member returns with an expired code, presses the
  // button again, and the second handoff fails for its own reason. Pinned because the two notices
  // have to stay tellable apart when they are stacked — the state where a single flattened banner
  // would silently show one and drop the other.
  {
    name: 'sent back, and the retry would not start',
    seed: { authError: EXPIRED_CODE, error: PROVIDER_UNCONFIGURED },
  },
];
