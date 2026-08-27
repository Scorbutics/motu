"use client"
// The sign-in screen: the page's own client boundary, and where the sign-in source is installed.
//
// APPLICATION CODE, deliberately — not beside the composition root. Installing the source needs the
// real Supabase browser client, and the composition root is 100% motu so that the pattern stays the
// one an adopting app can follow. So the port lives here, with the rest of the application.
//
// It also exists because `/signin` is a SERVER component: it awaits `searchParams`, and the source
// needs effects. This file is the boundary between the two.
import { useEffect, useMemo, useSyncExternalStore } from "react"
import { MotuRegion, Signin } from "@/components/motu/signin-region"
import { createSigninSource } from "@/app/signin/signin-source"
import { GithubSignIn } from "@/components/auth/github-sign-in"
import { signInWithGitHub } from "@/src/auth/client"

export function SignInScreen({ authError, returnTo }: { authError: string | null; returnTo: string | null }) {
  const source = useMemo(() => createSigninSource({ signInWithGitHub }), [])
  useEffect(() => () => source.dispose(), [source])

  const { signingIn, signInError, destination } = useSyncExternalStore(
    source.subscribe,
    source.getState,
    source.getState,
  )

  // NO NAVIGATION EFFECT HERE, unlike peps' login screen — and the absence is the point. A successful
  // OAuth handoff navigates the browser itself, to GitHub, and comes back to the callback route. There
  // is no `signedIn` fact for this screen to read and act on: the next thing that knows anything is a
  // different request. That asymmetry is why the source has no success branch.

  // THE WRAP FORM: this screen renders the real component with the real values, and the island wrapper
  // publishes what it was handed into the region. The lagoon renders the same island from the region
  // instead, with the same source over a stub port.
  //
  // `integrate check` warns that nothing calls `Signin.useRegion()`, and that warning is ACCEPTED
  // rather than unnoticed. It is right in general — a host that feeds a region and never reads it
  // back usually has a second copy of the state somewhere. Here there is nothing to read: this screen
  // owns the source, so it already holds every key the region has, and a `useRegion()` call would be
  // a second path to values it is looking at. The moment a second island lands, or anything outside
  // this component needs `signingIn`, that stops being true and the warning becomes a to-do.
  return (
    <MotuRegion>
      <Signin.Root
        form={
          <GithubSignIn
            error={signInError}
            authError={authError}
            isSubmitting={signingIn}
            destination={destination}
            returnTo={returnTo}
            onSignIn={(request) => void source.signIn(request)}
          />
        }
      />
    </MotuRegion>
  )
}

/**
 * WHY THE VALUES ARE PROPS AND NOT A REGION READ.
 *
 * The first version read `authError` back with `Signin.useRegion()`, seeded from a `useLayoutEffect`
 * in the composition root. It rendered correctly in the browser and WRONG on the server: an effect
 * does not run during SSR, so the region was empty, the refusal banner was missing from the delivered
 * HTML, and it appeared only after hydration. On the one screen whose entire job is to explain a
 * failure, that is the failure arriving late.
 *
 * The declared path was there all along: the page renders the real component with the real values
 * inside the island wrapper, and the WRAPPER publishes what it was handed into the region. So the
 * prop is the seed. `motu check --runtime` was green either way — every check that drives this region
 * drives it in a browser, where the effect does run. It took fetching the page.
 */
