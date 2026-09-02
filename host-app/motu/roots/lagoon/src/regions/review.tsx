// The review console region, for the lagoon: what the page establishes on first paint.
//
// A SEED AND NOTHING ELSE, now that `ReviewLayout` is the archipelago's `root`. This file used to
// carry a `ReviewRegionFrame` — a second copy of the page's JSX — and then a component the page also
// imported, which was better and still two calls. Declaring the root made it one, and the frame went
// away with the project around it.
import { overridesFor, wireFrom } from '@motu/react';
import type { LagoonOverrides } from '@motu/react';
import { channelFrom } from '@motu/core';
import { listShots, acceptShots } from '@/src/review/host';
import { reviewArchipelago } from '../../../../src/archipelagos/review/review.archipelago.js';
import { REPOS, SHOTS_BY_REPO } from '../../../../src/shared/review-evidence.js';

/**
 * MOCKED AT THE WIRE, not at the module — the review console is motu's in-tree consumer for this.
 *
 * The port used to be `shotsFixturePort`, a hand-written `{ list, accept }`. That ran the SOURCE for
 * real and stopped there: `src/review/host.ts` — the URL it builds, `credentials: 'same-origin'`, the
 * status check, and the error mapping that prefers a JSON `error` over raw body text — never executed
 * in the lagoon at all. Nobody noticed, because a module swap is silent by construction.
 *
 * Faking one layer down runs all of it. `listShots` and `acceptShots` are the application's own
 * functions here, called with `base: ''` so their paths are the same relative routes the page uses,
 * and answered by fixtures keyed by PATH. What a human previews is what production's client code does.
 *
 * It is also what makes `data-reach` a check rather than a readout in this repository: the routes
 * below are recorded as the region runs, and compared against the `reaches` that `shotsSource`
 * declares. Without an in-tree consumer that comparison could only be proved by unit tests.
 *
 * DECLARED, not installed here. `wireFrom({ to })` binds the fake to the region the way
 * `channelFrom({ to })` binds a channel, and the lagoon installs it for every view of that region —
 * so the route list is written once instead of twice, and a second region with a wire of its own is
 * no longer silently ignored.
 */
const wire = wireFrom({
  to: reviewArchipelago,
  appRoutes: ['/api/repos', '/api/baselines', '/api/baseline/accept'],
  fixtures: [
    { service: '/api/repos', method: 'GET', response: { repos: REPOS } },
    // A FUNCTION OF THE QUERY, because the region's whole coupling is "picking a project changes what
    // the list shows". A fixed array would answer every project with the same shots and the flow that
    // proves the coupling would pass without it holding.
    {
      service: '/api/baselines',
      method: 'GET',
      // `FixtureResponder` takes the call's ARGS ARRAY, not spread parameters — here
      // `[body, searchParams]`, as `handleAppRoute` passes them.
      response: (args: unknown[]) => ({ shots: SHOTS_BY_REPO[(args[1] as Record<string, string>)?.repo] ?? [] }),
    },
    // An ANSWER, not a re-implementation of the host: no storage, no hashes.
    { service: '/api/baseline/accept', method: 'POST', response: { accepted: [], count: 0 } },
  ],
});

/** The application's own host client, pointed at the fake. `base: ''` keeps the paths relative. */
const shotsWirePort = {
  list: (repo: string) => listShots({ base: '' }, repo),
  accept: (repo: string, island?: string, shot?: string) => acceptShots({ base: '' }, repo, island, shot),
};

export const reviewSeed: NonNullable<LagoonOverrides['seed']>[string] = {
  repos: REPOS,
  // A project IS selected on open, because a console that opens on nothing shows nothing. `shots` is
  // NOT seeded: the channel answers the selection, and a seeded list would sit in front of it — the
  // first paint would show one project's shots and never move again, which is the bug this fixes.
  selectedRepo: 'acme/example-app',
  viewMode: 'last',
  busy: false,
  error: null,
};

/**
 * THE PAGE'S OWN SOURCE, over fixtures.
 *
 * `createShotsSource` runs here exactly as it does in the console — same timeout, same generation
 * guard, same error mapping — and so does `src/review/host.ts` beneath it, because what is swapped is
 * now the WIRE rather than the port (see `wire`, above). A channel rather than a seed, because
 * it must ANSWER: the shot list is fetched when a project is picked, and a seeded array would sit in
 * front of that and never move.
 *
 * LOST IN THE FOLD, and the region said so within the hour: this lived in the review console's own
 * lagoon root, which was deleted with the project around it. `region-flow` failed with the shot list
 * rendering LOAD-ERROR — the source was real, the port was missing, and it reported the failure it
 * actually had. Worth keeping as the reason a region's flows are worth running after a move.
 */
export const reviewRegion = overridesFor(reviewArchipelago, {
  seed: reviewSeed,
  wire,
  channels: [
    channelFrom({
      to: reviewArchipelago,
      id: 'shots',
      channelName: 'review: the page’s shot fetch',
      args: [shotsWirePort],
    }),
  ],
});
