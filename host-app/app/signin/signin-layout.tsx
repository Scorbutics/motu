import type { ReactNode } from "react"
import { Shore } from "@motu/chrome/react"

/**
 * The sign-in page's ARRANGEMENT, as a component the archipelago points at.
 *
 * A component rather than JSX inside the lagoon frame, and that is the rule this file exists to keep:
 * the page and the lagoon render THE SAME arrangement, so a change to the shape of this screen cannot
 * show up in one and not the other. A second copy in the lagoon drifts for exactly the reason a second
 * copy of the region's vocabulary does.
 *
 * THE WATER IS THE PAGE HERE, not a band above it. Every other surface on this host heads a LISTING —
 * a masthead over the repositories, over a repo's history, over a gallery — so the water is a band
 * and the list is the page. This screen has no listing: it is one card and one decision, and a card
 * floating in the middle of a pale ground read as a page that had failed to load its own design. The
 * `Shore` is the same gradient, the same looping sheen, the same foam and the same drifting waterline
 * as the masthead — shared by selector, not copied — given the whole viewport instead of 74px of it.
 *
 * ONE SLOT still. It stays a component anyway — when the screen grows a footer or a second way in,
 * the growth happens here and both sides get it.
 */
export function SigninLayout({ form }: { form?: ReactNode }) {
  // NO HEADLINE OVER THE WATER. The card below already says "Sign in to the lagoon host", and it has
  // to — the island renders alone in the lagoon, where there is no page around it to say so. A second
  // heading forty pixels above it was the same sentence twice. The mark says whose product this is,
  // the blurb says what is behind the door, and the card says what to press.
  return (
    <Shore title="motu" blurb="Published lagoons, and the ones you have access to.">
      {/* The sheet is the kit's; what goes on it is the island's. */}
      <div className="motu-shore__sheet">{form}</div>
      {/* NO FOOTNOTE. It read "Published lagoons that are public stay readable without signing in",
          whose first half is true of `isPublic`'s default and whose second half makes the same claim
          the control's lede was removed for: it implies signing in is the alternative read path, and
          today it is not one. See github-sign-in.tsx. */}
    </Shore>
  )
}
