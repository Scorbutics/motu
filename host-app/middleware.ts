// REFRESH THE SESSION ON EVERY REQUEST, and write the result where the browser can see it.
//
// The `getAll`/`setAll` shape below is peps' working one, copied deliberately rather than rewritten:
// re-creating `NextResponse.next({ request })` AFTER `setAll` is the part that is easy to get subtly
// wrong, and getting it wrong loses the session on some requests and not others — the worst shape a
// bug can have. See docs/plan-lagoon-host.md.
//
// It does NOT authorize anything. Phase 1a is the session and nothing else; `authorize` is phase 2,
// and it belongs on the one route that matters (resolve → authorize → store.read), not in a prefix
// list here. A middleware that decided who may read a lagoon would be a second answer to that
// question, in front of the one place that is supposed to own it.
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  // NOT CONFIGURED IS NOT AN ERROR HERE. Phase 0 proxying must keep working on a host that has no
  // auth stack yet — this app's whole job until phase 2 is that nothing regresses — so a missing
  // config means "no session to refresh", not a 500 on every lagoon anyone opens.
  if (!url || !key) return response

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(toSet) {
        for (const { name, value } of toSet) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options)
      },
    },
  })

  // The call that does the refreshing. `getUser()` and not `getSession()`: the latter reads the
  // cookie and believes it, while this one asks GoTrue, which is what makes an expired or revoked
  // token actually stop working.
  await supabase.auth.getUser()

  return response
}

export const config = {
  matcher: [
    /**
     * EVERYTHING EXCEPT THE THINGS A SESSION CANNOT MATTER FOR.
     *
     * `/auth/v1` is excluded on purpose and it is the important one: that path is the gateway to
     * GoTrue itself, so refreshing a session in front of a token exchange means asking GoTrue about a
     * session in order to let a request through that is trying to create one. Static assets are
     * excluded because a middleware pass per asset is a GoTrue round-trip per asset.
     */
    '/((?!auth/v1|_next/static|_next/image|favicon.ico).*)',
  ],
}
