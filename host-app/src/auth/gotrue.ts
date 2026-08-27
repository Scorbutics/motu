// Where GoTrue is, and what it is called from outside.
//
// THE APP IS GOTRUE'S FRONT DOOR. The plan's smaller honest stack is "GoTrue + Postgres only, with
// GoTrue served at /auth/v1 behind the app's own gateway: @supabase/ssr works against that
// unchanged". So the browser and the server both talk to `<this app>/auth/v1`, never to the auth
// container directly — which is what lets the container bind loopback and keeps one origin, one
// cookie domain and one place where a request can be refused.
//
// It also means `/auth/v1` is a route the APP owns. Without the gateway route beside this file, the
// phase-0 catch-all would hand `/auth/v1/token` to `store.mjs`, which would answer 404 for a reason
// nobody would guess from the symptom.

/** Where the auth container listens. Loopback: the app is the only thing that should reach it. */
export const DEFAULT_GOTRUE = 'http://127.0.0.1:9998';

/** The prefix this app serves GoTrue under. Baked into every Supabase client's URL. */
export const AUTH_PREFIX = '/auth/v1';

export function gotrueOrigin(env: Record<string, string | undefined> = process.env): string {
  return (env.MOTU_GOTRUE_UPSTREAM || DEFAULT_GOTRUE).replace(/\/+$/, '');
}

/**
 * `/auth/v1/token` -> `/token`.
 *
 * GoTrue serves its routes at its own root, so the prefix is this app's and comes off at the hop. A
 * bare `/auth/v1` maps to `/`, not to the empty string, which is what a naive `slice` produces and
 * what turns a health probe into a 404.
 */
export function stripAuthPrefix(pathname: string): string {
  if (!pathname.startsWith(AUTH_PREFIX)) return pathname;
  const rest = pathname.slice(AUTH_PREFIX.length);
  return rest === '' ? '/' : rest;
}
