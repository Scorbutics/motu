// The signin region's invented data, in ONE place.
//
// The island's scenarios and the region's flows both need these strings, and anything both need lives
// in a module they import with a RELATIVE specifier — `@/` does not resolve in the loaders that read
// evidence files, and the failure is silent: the island keeps its scenarios in one check and loses
// them in another.
//
// Typed against the APP's own port with `import type`, which erases at runtime so the loaders are
// unaffected — and a renamed method then fails the build here instead of quietly previewing a port
// production no longer has.
import type { SigninPort } from '../../../app/signin/signin-source'

/**
 * What GitHub says when someone reaches the consent screen and declines.
 *
 * The provider's own words, not ours. It arrives in the URL as `error_description`, so a paraphrase
 * here would be a copy of a vocabulary we do not own — and the day GitHub rewords it, the evidence
 * would keep previewing a sentence nobody has ever been shown.
 */
export const ACCESS_DENIED = 'The user has denied your application access.'

/** What GoTrue says when the authorization code has already been spent or has aged out. */
export const EXPIRED_CODE = 'Invalid or expired OAuth state, please sign in again'

/**
 * What the browser client throws when the provider is not configured on this GoTrue.
 *
 * The one failure a member cannot act on, and the reason `signInError` is a separate key: they never
 * left the page, so "try again" is advice that cannot work.
 */
export const PROVIDER_UNCONFIGURED = 'Unsupported provider: provider is not enabled'

/**
 * The lagoon's sign-in port: what the auth backend does, without an auth backend.
 *
 * DATA AND ONE DECISION, not behaviour — the source itself is the application's and is installed
 * identically on both sides, so a maintainer walking through a failed handoff in the lagoon is
 * walking through the code that runs in production.
 *
 * IT NEVER RESOLVES on the happy path, and that is accurate rather than lazy. In production
 * `signInWithOAuth` hands the browser to GitHub and the page unloads; nothing after the await ever
 * runs. A stub that returned would preview a state the application cannot reach — the button going
 * idle again with the member still sitting there — so it hangs, exactly as the real one appears to.
 */
export const LAGOON_SIGNIN: SigninPort = {
  signInWithGitHub: () => new Promise<void>(() => {}),
}

/**
 * Addresses that mean something to the lagoon's sign-in.
 *
 * THE OUTCOME IS IN THE ASK, which is what makes the refusal testable rather than merely visible. A
 * port that picked its answer from a switch somewhere could only be driven by a human standing in
 * front of the lagoon; because the guard reads what it was ASKED, a flow can walk into either
 * outcome by emitting a different address.
 */
export const A_LAGOON_TO_RETURN_TO = '/motu-review/latest/all'

/** Protocol-relative, so the browser leaves this host entirely. The case a `startsWith('/')` test misses. */
export const AN_OFF_HOST_RETURN = '//evil.example/harvest'

/** What the guard says when the address would take them off this host. Built the way the source builds it. */
export const OFF_HOST_REFUSAL =
  `Cannot return to ${AN_OFF_HOST_RETURN} after signing in — that address would leave this host. ` +
  `Open the lagoon again without it.`

/** The same port, refusing the way a misconfigured GoTrue refuses. */
export const LAGOON_SIGNIN_UNCONFIGURED: SigninPort = {
  signInWithGitHub: () => Promise.reject(new Error(PROVIDER_UNCONFIGURED)),
}
