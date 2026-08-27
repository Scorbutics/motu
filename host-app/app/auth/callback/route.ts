// AUTH CALLBACK — where a GitHub round-trip becomes a session.
//
// The PKCE half of peps' callback and nothing else: no `verifyOtp` branch, because phase 1 has no
// email path to verify. What it adds, and what peps has nothing to copy for, is spending the provider
// token once — see src/auth/repo-access.ts for why the ANSWER is kept and the token is not.
//
// It issues HTTP redirects rather than rendering, so nobody sees an intermediate page.
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/src/supabase/server'
import { isSafeReturn } from '@/app/signin/signin-source'
import { recordAccessAtSignIn } from '@/src/auth/repo-access'
import { postgresAccessStore } from '@/src/auth/access-store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Back to the sign-in screen, carrying what went wrong in the words we were given. */
function refuse(origin: string, reason: string) {
  const url = new URL('/signin', origin)
  url.searchParams.set('error_description', reason)
  return NextResponse.redirect(url)
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)

  // GoTrue redirects here with error params when the provider refused or a code expired. Passed
  // through verbatim: the sign-in screen renders the provider's own sentence, and a paraphrase here
  // would be a second copy of a vocabulary we do not own.
  const bounced = searchParams.get('error_description') || searchParams.get('error')
  if (bounced) return refuse(origin, bounced)

  const code = searchParams.get('code')
  if (!code) return NextResponse.redirect(new URL('/signin', origin))

  // WHERE THEY WERE GOING, re-checked here and not trusted from the round-trip. It survived a trip
  // through GitHub as a query parameter, so it is exactly as attacker-controlled as it was on the way
  // in — and the guard is the same function the sign-in source uses, so the two cannot disagree.
  const requested = searchParams.get('next')
  const destination = requested && isSafeReturn(requested) ? requested : '/'

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) return refuse(origin, error.message)

  // THE ONE MOMENT THE PROVIDER TOKEN EXISTS. GoTrue returns it on this exchange and does not keep
  // it; neither do we. It is spent here, turned into rows, and goes out of scope with this request.
  const providerToken = data.session?.provider_token
  const userId = data.user?.id
  if (providerToken && userId) {
    try {
      await recordAccessAtSignIn(userId, providerToken, postgresAccessStore())
    } catch (err) {
      // NOT FATAL, and this is a judgement rather than a shrug: they ARE signed in — the session is
      // real and every public lagoon is theirs to read. Failing the sign-in over a GitHub API blip
      // would refuse an identity that was correctly established. What it costs is that private
      // lagoons read as "no answer" until they sign in again, which `decide()` fails closed on, so
      // the failure mode is too little access rather than too much.
      console.error('[auth/callback] could not record repo access:', (err as Error)?.message ?? err)
    }
  }

  return NextResponse.redirect(new URL(destination, origin))
}
