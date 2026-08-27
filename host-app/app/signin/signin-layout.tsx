import type { ReactNode } from "react"

/**
 * The sign-in page's ARRANGEMENT, as a component the archipelago points at.
 *
 * A component rather than JSX inside the lagoon frame, and that is the rule this file exists to keep:
 * the page and the lagoon render THE SAME arrangement, so a change to the shape of this screen cannot
 * show up in one and not the other. A second copy in the lagoon drifts for exactly the reason a second
 * copy of the region's vocabulary does.
 *
 * ONE SLOT today. It stays a component anyway — when the screen grows a footer or a second way in,
 * the growth happens here and both sides get it.
 */
export function SigninLayout({ form }: { form?: ReactNode }) {
  return (
    <main className="motu-signin-page">
      {form}
      {/* NO FOOTNOTE. It read "Published lagoons that are public stay readable without signing in",
          whose first half is true of `isPublic`'s default and whose second half makes the same claim
          the control's lede was removed for: it implies signing in is the alternative read path, and
          today it is not one. See github-sign-in.tsx. */}
    </main>
  )
}
