// AUTH CALLBACK — where a GitHub round-trip becomes a session.
//
// The PKCE half of acme's callback and nothing else: no `verifyOtp` branch, because phase 1 has no
// email path to verify. What it adds, and what acme has nothing to copy for, is spending the provider
// token once — see src/auth/repo-access.ts for why the ANSWER is kept and the token is not.
//
// It issues HTTP redirects rather than rendering, so nobody sees an intermediate page.
import type { NextRequest } from 'next/server'
import { createClient } from '@/src/supabase/server'
import { isSafeReturn } from '@/app/signin/signin-source'
import { recordAccessAtSignIn } from '@/src/auth/repo-access'
import { postgresAccessStore } from '@/src/auth/access-store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * A RELATIVE REDIRECT, and that is the whole point of it.
 *
 * This used to build an absolute URL from `new URL(request.url).origin`, which is the request's own
 * view of where it arrived — and behind a proxy that view is the INTERNAL address. Through the
 * Tailscale funnel it read `https://localhost:8817`: the scheme forwarded, the host did not, so
 * every sign-in ended on a URL outside the tunnel that resolves to the visitor's own machine. It
 * was visible in the phase-1a verification output and read past, because the PATH was right.
 *
 * A relative `Location` is resolved by the browser against the URL it actually used, so it cannot get
 * the origin wrong — there is no origin to get wrong. `unlock` in the catch-all was already doing
 * this, for the same reason, which is what made the difference obvious once it was looked at.
 *
 * Safe as a relative target because every value that reaches it has been through `isSafeReturn`:
 * it starts with `/` and not `//`, so it cannot be read as protocol-relative and leave the host.
 */
function seeOther(location: string) {
  return new Response(null, {
    status: 302,
    headers: { location, 'cache-control': 'no-store' },
  })
}

/** Back to the sign-in screen, carrying what went wrong in the words we were given. */
function refuse(reason: string) {
  return seeOther(`/signin?error_description=${encodeURIComponent(reason)}`)
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  // GoTrue redirects here with error params when the provider refused or a code expired. Passed
  // through verbatim: the sign-in screen renders the provider's own sentence, and a paraphrase here
  // would be a second copy of a vocabulary we do not own.
  const bounced = searchParams.get('error_description') || searchParams.get('error')
  if (bounced) return refuse(bounced)

  const code = searchParams.get('code')
  if (!code) return seeOther('/signin')

  // WHERE THEY WERE GOING, re-checked here and not trusted from the round-trip. It survived a trip
  // through GitHub as a query parameter, so it is exactly as attacker-controlled as it was on the way
  // in — and the guard is the same function the sign-in source uses, so the two cannot disagree.
  const requested = searchParams.get('next')
  const destination = requested && isSafeReturn(requested) ? requested : '/'

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) return refuse(error.message)

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

  return seeOther(destination)
}
