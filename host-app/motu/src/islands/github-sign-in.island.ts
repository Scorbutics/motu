// Mount point for GithubSignIn: it wraps the application's OWN component rather than a copy, so the
// island cannot drift from what the app already ships. The component stays where it is and keeps
// being used directly elsewhere; this file only declares how it is mounted as an island.
import { islandElement } from '@motu/react';
import { GithubSignIn } from '@/components/auth/github-sign-in';

export const element = islandElement({
  tag: 'x-github-sign-in',
  component: GithubSignIn,
  options: {
    // The island's boundary in one place — input (props), output (events), ambient (host reach).
    contract: {
      // WHAT THE CONTROL IS TOLD, and all three come from outside it. Two failures rather than one
      // because they are different situations for the member: `error` means the handoff never
      // started and there is nothing they can do, `authError` means GitHub sent them back and trying
      // again is real. `isSubmitting` is the source's, not the button's — a button that owned its
      // own pending flag could show it while nothing was in flight.
      input: [
        'error',
        'authError',
        'isSubmitting',
        'returnTo',
        'destination',
      ],
      // WHAT IT ASKS FOR. Renamed from the callback's default (`sign-in`) because the region is where
      // the name is read, and `-requested` is the whole point: the control cannot sign anyone in. The
      // answer is GoTrue's and GitHub's, so it asks and is told.
      output: {
        onSignIn: 'sign-in-requested',
      },
      // NOTHING AMBIENT, and that is a claim worth making explicitly rather than by omission. The
      // control reaches for no host module at all: signing in lives in `app/signin/signin-source.ts`,
      // over a port. If `@supabase/...` ever appears in this array, the source has been bypassed.
      ambient: [],
    },
  },
});
