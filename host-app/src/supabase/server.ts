// The SERVER half of identity. Never imported from a browser module — see ./client.
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required — copy .env.example to .env.local',
    )
  }
  return { url, key }
}

/**
 * A request-scoped client that reads and writes the session cookie.
 *
 * The `setAll` swallow is REQUIRED and is not laziness: a Server Component may not set a cookie, so
 * refreshing a token there throws. The middleware refreshes on every request and writes the result,
 * so the tokens this client is holding are already fresh — which is the whole reason the middleware
 * exists. Losing that pairing is how a session silently stops refreshing.
 */
export async function createClient() {
  const { url, key } = config()
  const store = await cookies()
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return store.getAll()
      },
      setAll(toSet) {
        try {
          for (const { name, value, options } of toSet) store.set(name, value, options)
        } catch {
          /* a Server Component cannot set cookies; the middleware already did */
        }
      },
    },
  })
}
