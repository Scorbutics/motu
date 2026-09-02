// The BROWSER half of identity.
//
// Kept apart from `./server` with no barrel index between them, the way acme keeps `lib/auth/client`
// and `lib/auth/server` apart: that split IS the privilege boundary, and a barrel is how one import
// reaches across it. Nothing in this file may ever hold the service-role key.
import { createBrowserClient } from '@supabase/ssr'

/**
 * The app's own origin, not the auth container's.
 *
 * `@supabase/ssr` appends `/auth/v1` to whatever it is given, which is exactly the gateway path this
 * app serves — so pointing it at this origin makes the browser talk to GoTrue through the app, on one
 * origin and one cookie domain. See src/auth/gotrue.ts.
 */
function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  // FAIL HERE, not on the first call. A client built from `undefined` throws somewhere inside the
  // library on whichever action happens first, which reads as a sign-in bug rather than a config one.
  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required — copy .env.example to .env.local',
    )
  }
  return { url, key }
}

export function createClient() {
  const { url, key } = config()
  return createBrowserClient(url, key)
}
