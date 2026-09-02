// How a click becomes a GitHub redirect — ONCE, for both places that need it.
//
// A source rather than a call inside the button, for the reason acme's login source records: a
// component that calls the auth client itself makes signing in something only that component can do,
// and makes every way it can FAIL unreachable from anywhere else. Here that matters more than usual,
// because the happy path leaves the page — so the failures are the ONLY states left to look at, and
// they are exactly the ones a component would have swallowed.
//
// It owns no framework and no motu: plain functions and a subscription, so it runs in a React effect,
// in a motu channel, and in a node test.
import type { Source } from "@motu/types"
import type { SigninRegion } from "./signin-region"

/**
 * What the source needs from the world.
 *
 * Production passes the Supabase browser client's `signInWithOAuth`; the lagoon passes a stub. One
 * method, and it does not return a session: OAuth ANSWERS by navigating the browser away, so the only
 * thing this port can report is that the handoff itself failed.
 */
export interface SigninPort {
  /**
   * Hand the browser to GitHub, and come back to `returnTo` afterwards.
   *
   * `returnTo` is what makes a private lagoon linkable at all: somebody follows a link, is bounced
   * here because they have no session, and has to land back on the lagoon rather than on a generic
   * page. It is already validated by the time it reaches this port — see `isSafeReturn`.
   */
  signInWithGitHub(returnTo: string | null): Promise<void>
}

/**
 * May we send them here after GitHub?
 *
 * ONLY a path on this host. `returnTo` arrives from the query string, so it is attacker-controlled:
 * an absolute URL here turns the sign-in screen into an open redirect that borrows this host's
 * credibility to land somebody on a page they did not choose. `//evil.example` is the case a naive
 * "must start with a slash" test lets through — the browser reads it as protocol-relative and leaves.
 */
export function isSafeReturn(returnTo: string): boolean {
  return returnTo.startsWith('/') && !returnTo.startsWith('//')
}

/** What the control hands over when somebody asks to sign in. */
export interface SignInRequest {
  /** Where they were going before they were bounced here, or null for an ordinary visit. */
  returnTo: string | null
}

export type SigninKeys = "signingIn" | "signInError" | "destination"

const IDLE: Pick<SigninRegion, SigninKeys> = { signingIn: false, signInError: null, destination: null }

/** Where an ordinary visit lands after signing in: the index, which lists what they may read. */
export const DEFAULT_DESTINATION = "/"

export function createSigninSource(port: SigninPort) {
  let state = IDLE
  // Which attempt the answer belongs to. Someone who double-clicks a slow button gets two in flight,
  // and the slower failure must not overwrite the faster one's outcome.
  let generation = 0
  const listeners = new Set<() => void>()

  /** A NEW object on change and the SAME one otherwise, so `useSyncExternalStore` can trust it. */
  const set = (next: Partial<Pick<SigninRegion, SigninKeys>>) => {
    state = { ...state, ...next }
    listeners.forEach((l) => l())
  }

  const api = {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getState: () => state,

    /**
     * Hand the browser to GitHub, and report the outcome as REGION STATE rather than performing it.
     *
     * There is no success branch on purpose. When this works the browser is already leaving, so
     * "signed in" is not something this module can observe or report — the callback route is what
     * knows, one navigation later. `signingIn` staying true IS the success state here, and that
     * asymmetry is worth saying out loud rather than discovering from a flow that never ends.
     */
    async signIn({ returnTo }: SignInRequest = { returnTo: null }) {
      const mine = ++generation
      // REFUSED BEFORE ANYTHING LEAVES, and reported like any other failure rather than thrown: the
      // member sees why, and the state is one a scenario can seed and a flow can drive. Silently
      // dropping it to null would be worse than refusing — they would sign in and land nowhere near
      // where they were going, with nothing saying so.
      if (returnTo !== null && !isSafeReturn(returnTo)) {
        // THE ADVICE TRAVELS WITH THE CAUSE. This failure and an unconfigured provider land on the
        // same key and the control cannot tell them apart, so a fixed line under the banner was
        // wrong for one of them however it was worded. Here the cause is known.
        set({
          signingIn: false,
          signInError:
            `Cannot return to ${returnTo} after signing in — that address would leave this host. ` +
            `Open the lagoon again without it.`,
          destination: null,
        })
        return
      }
      // WHAT WAS GRANTED, reported separately from what was asked. An absent `?next=` is not a
      // failure — it is an ordinary visit — so it resolves rather than refuses.
      const destination = returnTo ?? DEFAULT_DESTINATION
      set({ signingIn: true, signInError: null, destination })
      try {
        await port.signInWithGitHub(returnTo)
      } catch (e) {
        if (mine !== generation) return
        // The auth client's own message. What it called the failure is what a maintainer needs to see
        // in a screenshot, and flattening it to "sign-in failed" throws that away.
        set({ signingIn: false, signInError: (e as Error)?.message || "Could not reach GitHub", destination: null })
      }
    },

    /**
     * What this source answers when an ISLAND asks the host for something.
     *
     * The button cannot sign anyone in — the answer is whatever GoTrue and GitHub say — so it asks,
     * and this is the answer. Declaring it here means no composition root names it: the host passes
     * intents on, and whatever source claims one handles it. The lagoon's channel installs this same
     * object, so signing in works there too, against a stub.
     */
    intents: {
      "signin-start": (detail: unknown) => {
        const { returnTo } = (detail ?? {}) as Partial<SignInRequest>
        void api.signIn({ returnTo: typeof returnTo === "string" ? returnTo : null })
      },
    },

    dispose() {
      generation++
      listeners.clear()
    },
  }
  return api
}

/** The source, as the region refers to it. */
export const signinSource: Source<SigninRegion, SigninKeys, [SigninPort]> = {
  create: createSigninSource,
  produces: ["signingIn", "signInError", "destination"],
}
