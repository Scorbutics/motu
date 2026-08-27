// The browser half of identity — PHASE 1a's seam, standing in for itself until 1a lands.
//
// One function, and it is the whole port the sign-in source needs. Kept apart from anything that runs
// on the server, the way peps keeps `lib/auth/client.ts` and `lib/auth/server.ts` apart with no barrel
// index between them: that split IS the privilege boundary, and a barrel is how one import reaches
// across it.
//
// TODO(phase-1a): replace the body with the Supabase browser client. The signature does not change,
// which is the point of it being a port — the region, the flows and the screen are already written
// against it, and 1a is done when this function stops throwing.
//
// What 1a has to do here that peps never did: ask for the SCOPES that can read repository membership,
// because `authorize` answers "may this user read owner/name". peps calls `signInWithOAuth` with no
// scopes at all and never touches `provider_token`, so there is nothing to copy for this part.
export async function signInWithGitHub(_returnTo: string | null): Promise<void> {
  throw new Error('GitHub sign-in is not configured on this host yet')
}
