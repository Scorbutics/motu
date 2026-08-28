// SIGNING OUT, deliberately.
//
// POST, NEVER GET. A sign-out on GET is a link anybody can put in an <img> on another page and have
// every reader of it silently signed out — and a browser's own prefetch can fire it without anyone
// clicking. So it is a form submission, which is also what lets it work with no JavaScript at all.
//
// A RELATIVE `Location`, for the reason written up in the auth callback: `new URL(request.url).origin`
// is the request's INTERNAL view behind a proxy, and through the tunnel that read
// `https://localhost:8817`. There is no origin to get wrong if none is sent.
import { createClient } from '@/src/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST() {
  try {
    const supabase = await createClient()
    // `signOut` clears the session cookies through the same writer the middleware uses.
    await supabase.auth.signOut()
  } catch {
    // ALREADY SIGNED OUT IS SIGNED OUT. A session that cannot be read cannot be revoked, and telling
    // somebody their sign-out failed when they are demonstrably signed out is a worse answer than
    // sending them to the front page, which is where they were going.
  }
  // 303, not 302: the request was a POST and the destination is a GET. 302 leaves the method to the
  // browser's discretion, and the discretion some of them exercise is to POST again.
  return new Response(null, { status: 303, headers: { location: '/', 'cache-control': 'no-store' } })
}
