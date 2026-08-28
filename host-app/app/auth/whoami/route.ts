// WHO AM I — the least a page can ask about the person reading it.
//
// EXISTS FOR THE PAGES THE APP DOES NOT RENDER. The front page reads the session on the server and
// hands it straight to a region, which is better in every way: no request, no flash of the wrong
// state. The COMPOSED view (`/g/<name>`) is still rendered by the node host and proxied, and that
// process has no session — so its account control asks here instead. When phase 4 moves that route
// into the app, this stays useful and that page stops needing it.
//
// IT ANSWERS 200 FOR A STRANGER, with `signedIn: false`. A 401 would be a claim that the caller did
// something wrong; nobody did — the honest answer to "who am I" from a visitor is "nobody yet".
import { createClient } from '@/src/supabase/server'
import { viewerFrom } from '@/src/auth/viewer'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  let viewer = null
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    viewer = viewerFrom(data.user)
  } catch {
    // An unreadable session is NOBODY, not an error — the same rule the front page's `viewerOf` keeps.
  }
  return new Response(JSON.stringify({ signedIn: Boolean(viewer), ...(viewer ?? {}) }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // NEVER CACHED, and not only because it changes: a cached identity is one visitor's name served
      // to the next, which is the worst thing a shared proxy could do with this route.
      'cache-control': 'no-store, private',
    },
  })
}
