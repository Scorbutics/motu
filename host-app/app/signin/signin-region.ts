// The signin region's shared state, as a type.
//
// Belongs to the APPLICATION: no motu import, and it erases at runtime. It is the region's SHARED
// vocabulary, not everything the page holds — a key earns a place here when more than one part of the
// region needs it, or when motu binds it.
//
// Everything here is HOST-FED. `authError` is what the page read from the URL; the other two are what
// the sign-in source reports while it works. No island writes any of them, which is the point: the
// button ASKS to sign in and is told how it went, so every way it can go is a value something can
// seed, assert on, and look at.
export type SigninRegion = {
  /**
   * A sign-in is in flight — the browser is being handed to GitHub.
   *
   * In production this state is almost invisible: the page unloads a moment later, so the only place
   * anyone can LOOK at it is the lagoon. That is not an argument for skipping it. A redirect that
   * never happens (GoTrue unreachable, the provider misconfigured) leaves the member sitting in
   * exactly this state, and a state nobody can address is a state nobody checks.
   */
  signingIn: boolean

  /**
   * We could not send them to GitHub, in the auth client's own words, or null.
   *
   * DISTINCT from `authError` below, and the distinction is the member's, not ours: this one means
   * they never left. It is our side that failed — a provider that is not configured, a GoTrue that is
   * down — and there is nothing they can do differently.
   */
  signInError: string | null

  /**
   * GitHub sent them BACK refused, verbatim, or null for an ordinary visit.
   *
   * Host-fed: the page reads it from `searchParams` and seeds it. They got all the way to GitHub and
   * returned — they denied the authorization, or the code expired — so trying again is a real option
   * in a way it is not for `signInError`. Kept in the provider's own words for peps' reason: two
   * different situations flattened into one sentence is how somebody retries the wrong thing.
   */
  authError: string | null

  /**
   * Where they were going when they were bounced here, or null for an ordinary visit.
   *
   * Host-fed: the page reads `?next=` and seeds it. Region state rather than a prop the screen
   * threads down, because the control has to hand it BACK when it asks — and a value that travels
   * out of an island is one the region should be able to see going.
   */
  returnTo: string | null

  /**
   * Where the handoff will actually land them, once it has started. Null until they ask.
   *
   * NOT the same key as `returnTo`, and the difference is the whole point: `returnTo` is what was
   * requested and `destination` is what was granted. An address that would leave this host never
   * becomes a destination — it becomes `signInError` — and an ordinary visit with no `?next=`
   * resolves to the index. Somebody about to be sent to GitHub can therefore read where they are
   * coming back to, which is the one thing that makes following a private link feel safe.
   */
  destination: string | null
}

/**
 * Nothing on this page is island-owned.
 *
 * The button acts and cannot complete its own act — the answer comes from GoTrue, through the source,
 * and lands as host-fed state. So the region has no produced keys, and `ProducedKeysAre` in the
 * archipelago makes it a compile error for that to drift.
 */
export type ProducedSigninKeys = never
