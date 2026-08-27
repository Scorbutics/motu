// The browser half of identity — one function, and it is the whole port the sign-in source needs.
//
// Kept apart from anything that runs on the server, the way peps keeps `lib/auth/client.ts` and
// `lib/auth/server.ts` apart with no barrel index between them: that split IS the privilege boundary,
// and a barrel is how one import reaches across it.
import { createClient } from '@/src/supabase/client'

/**
 * THE SCOPES, and they are the reason there was nothing to copy from peps.
 *
 * peps calls `signInWithOAuth` with no scopes at all and never touches `provider_token`, because
 * nothing in that app asks GitHub a question. This host's whole access model does: `authorize` answers
 * "may this user read owner/name", and only GitHub knows.
 *
 * `repo` is broader than anyone would choose and it is the narrowest thing that works. Classic OAuth
 * has no read-only repository scope — to learn that somebody may READ a private repo you must hold a
 * grant that could also write it. Worth knowing, worth saying on the consent screen, and worth
 * revisiting if this ever moves to a GitHub App, where per-repository read is expressible.
 *
 * The grant is spent ONCE, at the callback, and turned into rows. See src/auth/repo-access.ts.
 */
const SCOPES = 'read:user read:org repo'

/**
 * Hand the browser to GitHub, and come back to `returnTo`.
 *
 * This function does not resolve on success: `signInWithOAuth` navigates the page away. That is why
 * the sign-in source has no success branch — see its `signIn`.
 *
 * `returnTo` has ALREADY been screened by the source's `isSafeReturn` before it reaches here, and it
 * is screened AGAIN at the callback, because between those two moments it travels through a third
 * party as a query parameter.
 */
export async function signInWithGitHub(returnTo: string | null): Promise<void> {
  const supabase = createClient()
  const origin = window.location.origin
  const callback = new URL('/auth/callback', origin)
  if (returnTo) callback.searchParams.set('next', returnTo)

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: { redirectTo: callback.toString(), scopes: SCOPES },
  })
  // A THROW IS THE ONLY THING THIS CAN REPORT. On success the browser is already leaving; the source
  // turns this into `signInError` and the screen says the handoff never started — which is exactly
  // what an unconfigured provider looks like from here.
  if (error) throw error
}
