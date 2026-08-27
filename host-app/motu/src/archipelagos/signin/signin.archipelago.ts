// The sign-in page (`/signin`) — the first screen anyone who is not already signed in will see.
//
// SURVEYED FIRST, in docs/plan-lagoon-host.md, before either file here existed. One slot today; the
// region is declared anyway, because the ownership it enforces is what makes the next island cheap
// and the next agent safe.
//
// WHY THIS SCREEN IS A REGION AT ALL, when it is one button: because the button is the part that
// cannot fail interestingly. Everything worth looking at on this page is a state the button is TOLD
// about — the handoff that would not start, the refusal GitHub sent back, the moment between the
// click and the browser leaving. Owned inside the component, none of those is addressable: no
// scenario can seed one, no flow can drive one, and the only way to see one is to break GoTrue by
// hand. That is the whole argument for motu on this screen, and it is the argument for motu.
import { archipelago } from '@motu/core';
// THE REGION'S ROOT — the APPLICATION's own layout, imported. The page renders it with live content
// and the lagoon renders the same component with islands; neither describes the arrangement twice.
import { SigninLayout } from '@/app/signin/signin-layout';
import type { ProducedKeysAre, RegionOwnershipOk } from '@motu/core';
// TYPE-ONLY, from the app: the page's vocabulary is the application's to name.
import type { SigninRegion, ProducedSigninKeys } from '@/app/signin/signin-region';
// The source itself — a VALUE import, and the only one this file has from the app. It is what makes
// "the module the channel installs" and "the module the region declares" the same object.
import { signinSource } from '@/app/signin/signin-source';

export const signinArchipelago = archipelago<SigninRegion, 'x-github-sign-in'>()({
  id: 'signin',
  root: SigninLayout,
  // The app's prop name on the left, motu's slot on the right. The page passes `form`; it never
  // writes a slot name.
  slots: {
    form: { slot: 'signin-form' },
  },
  islands: [
    {
      slot: 'signin-form',
      element: 'x-github-sign-in',
      // WHAT IT IS TOLD. `error` is renamed on the way in: the region calls it `signInError` because
      // `authError` sits beside it and "error" alone would not say which of the two it is.
      // `returnTo` goes IN so the control can hand it back when it asks — a hidden field. `destination`
      // comes back out of the source: what was granted, as opposed to what was requested.
      bind: [
        {
          error: 'signInError',
          authError: 'authError',
          isSubmitting: 'signingIn',
          returnTo: 'returnTo',
          destination: 'destination',
        },
      ],
      // SIGNING IN LEAVES THE REGION as a declared intent, answered by the `signin` source. The
      // control cannot sign anyone in, so it asks.
      intents: { 'sign-in-requested': 'signin-start' },
    },
  ],
  sources: {
    /**
     * The handoff to GitHub, and everything the member is told when it does not happen.
     *
     * The source ITSELF, imported rather than named as a string — a reference cannot disagree with the
     * module a channel installs. Production hands it the Supabase browser client; the lagoon hands it
     * a stub, and both get the same object, so the failures a human previews are production's.
     */
    signin: signinSource,
  },
});

/** Every key an island reads has exactly one owner. */
const _ownership: RegionOwnershipOk<typeof signinArchipelago> = true;
void _ownership;

/** The region's produced keys and the archipelago's `writes` are the same set. */
const _produced: ProducedKeysAre<typeof signinArchipelago, ProducedSigninKeys> = true;
void _produced;
