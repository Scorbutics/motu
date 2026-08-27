"use client"
// The sign-in control: one button, and the two ways it can fail.
//
// Every prop is optional with a default, because an island must render from its defaults alone — the
// lagoon mounts this with nothing and has to get a real screen. The defaults are the IDLE state, which
// is also the one a first-time visitor sees.
import "motu-host-islands/styles.css"

export interface GithubSignInProps {
  /**
   * Why the handoff to GitHub could not START, or null. Our side failed and they never left, so this
   * is reported as a fault rather than as something to retry differently.
   */
  error?: string | null
  /**
   * Why GitHub sent them BACK, or null. They got there and returned refused — a denied authorization,
   * an expired code — so the button below is a real second chance, and the copy says so.
   */
  authError?: string | null
  /** The browser is being handed over. In production the page unloads a moment later. */
  isSubmitting?: boolean
  /**
   * Where they were going before they were bounced here, or null for an ordinary visit.
   *
   * A hidden field in everything but markup: the region tells this control, and it hands the value
   * back when it asks. Never rendered — what a reader sees is `destination` below, which is what was
   * GRANTED rather than what was requested.
   */
  returnTo?: string | null
  /**
   * Where the handoff will land them, once it has started. Null until they ask.
   *
   * Rendered, and only in the pending state, because that is the moment it means something: they are
   * about to leave for GitHub and this is the promise about coming back.
   */
  destination?: string | null
  /**
   * They asked to sign in. The control's whole output.
   *
   * A no-op default like every input here: an island that throws when nobody is listening is not
   * previewable.
   */
  onSignIn?: (request: { returnTo: string | null }) => void
}

function GithubMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  )
}

export function GithubSignIn({
  error = null,
  authError = null,
  isSubmitting = false,
  returnTo = null,
  destination = null,
  onSignIn,
}: GithubSignInProps) {
  return (
    <div className="motu-signin">
      <h1 className="motu-signin__title">Sign in to the lagoon host</h1>
      {/* NO EXPLANATORY LINE, and its absence is the finding rather than an oversight.
          Two were written and both were untrue. "Your access is your GitHub access: if you can read
          the repository, you can read its lagoons" describes a mechanism `access.mjs` does not have.
          Its replacement, "A repository can publish its lagoons privately. Signing in is how you read
          those", was wrong on both clauses: `store.mjs`'s `publish()` takes no visibility argument, so
          privacy is not a publish act and not per-lagoon — it is a per-REPO policy an operator writes
          with `motu-host access --private` — and `canRead()` admits a private repo by an admin token,
          a per-repo secret or the host-wide one, never by a session. `signInWithGitHub` still throws.
          So there is no true sentence to write here yet: signing in has no consequence until phases
          1a and 2 give `authorize` a session to read. The heading and the button are both true.
          Write the line when there is a mechanism to describe, and check it against `authorize`. */}


      {/* TWO FAILURES, SAID DIFFERENTLY. Flattening them into one banner is what makes somebody retry
          a thing that cannot work — see the region type for why they are separate keys. */}
      {authError && (
        <div className="motu-signin__notice motu-signin__notice--returned" role="status">
          <strong>GitHub sent you back.</strong>
          <span>{authError}</span>
          {/* ONLY WHEN A RETRY IS ACTUALLY AVAILABLE. With a fault below it this read "You can try
              again" directly above "Sign-in could not start", which instructs an action the next
              notice proves impossible — the retry has already happened and failed. */}
          {!error && <span className="motu-signin__hint">You can try again.</span>}
        </div>
      )}
      {error && (
        <div className="motu-signin__notice motu-signin__notice--fault" role="alert">
          <strong>Sign-in could not start.</strong>
          {/* NO FIXED ADVICE HERE. It read "This one is our side — nothing you can do differently",
              which is true when the provider is unconfigured and false when the refusal is a tampered
              return address in the link somebody followed — and directly contradicted "You can try
              again" above it when both notices were on screen at once. Only the source knows which
              cause it is, so whatever can be done about it is said in the message it builds. */}
          <span>{error}</span>
        </div>
      )}

      <button
        type="button"
        className="motu-signin__button"
        disabled={isSubmitting}
        onClick={() => onSignIn?.({ returnTo })}
      >
        <GithubMark />
        {isSubmitting ? "Redirecting to GitHub…" : "Sign in with GitHub"}
      </button>

      {isSubmitting && destination && (
        <p className="motu-signin__hint">You will come back to {destination}</p>
      )}
    </div>
  )
}
