// The signin region, for the lagoon: what the page establishes, and what answers the one act.
import { overridesFor } from '@motu/react';
import type { LagoonOverrides } from '@motu/react';
import { channelFrom } from '@motu/core';
import { signinArchipelago } from '../../../../src/archipelagos/signin/signin.archipelago.js';
import { LAGOON_SIGNIN } from '../../../../src/shared/signin-evidence.js';

/**
 * What the PAGE establishes on first paint.
 *
 * Seeded to null rather than to a failure, the opposite of acme's login: that region exists FOR the
 * dead-link screen, and this one exists for the ordinary arrival. The refusals are one flow and two
 * scenarios away, each with its own address.
 */
export const signinSeed: NonNullable<LagoonOverrides['seed']>[string] = {
  authError: null,
};

/** Everything the lagoon is told about `signin`, in one place. */
export const signinRegion = overridesFor(signinArchipelago, {
  seed: signinSeed,
  channels: [
    // THE PAGE'S OWN SIGN-IN, over a port that answers instead of a GoTrue that is not there.
    //
    // The same `signinSource` the screen installs — so the state a human walks through here is
    // produced by the code production runs, not by a second implementation written to look like it.
    // What the port DOES is the only thing this file supplies, and here it does the accurate thing:
    // nothing, forever, exactly as a real redirect appears to from inside the page.
    channelFrom({
      to: signinArchipelago,
      id: 'signin',
      channelName: 'signin: the page’s github handoff',
      args: [LAGOON_SIGNIN],
    }),
  ],
});
