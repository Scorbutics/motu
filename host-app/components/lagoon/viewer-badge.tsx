"use client"
// WHO IS READING THIS, and the way out.
//
// AN ISLAND, because it SHOWS an identity and it ACTS on one. It is also the smallest island on the
// page and the one with the most at stake: the state it renders decides whether the person looking
// believes they are signed in, and getting that wrong in the safe-looking direction — showing a name
// when the session is gone — is what makes somebody trust a page they should not.
//
// IT OWNS NOTHING. Signing out is a form POST to `/auth/signout`, not a callback: the region has no
// key for "signed out" because the consequence is a NAVIGATION, and a no-JavaScript form is the
// smallest thing that can do it. The sign-in region records the same shape for the same reason.
import { Avatar } from "@motu/chrome/react"
import type { Viewer } from "@/src/auth/viewer"

export interface ViewerBadgeProps {
  /**
   * Whoever is signed in, or null for a visitor.
   *
   * NULL IS THE DEFAULT, and it renders the way IN rather than nothing. An island must render from
   * its defaults alone, and the honest default here is the state most readers of a public lagoon are
   * actually in — nobody. A blank corner would have been a badge that fails invisibly.
   */
  viewer?: Viewer | null
}

export function ViewerBadge({ viewer = null }: ViewerBadgeProps) {
  if (!viewer) {
    return (
      <a className="motu-account" href="/signin">
        <span className="motu-account__name">Sign in</span>
      </a>
    )
  }
  return (
    // A FORM, so this works with scripting off and cannot be fired by a prefetch or an <img> on
    // somebody else's page. The route refuses GET for that reason.
    <form className="motu-account" action="/auth/signout" method="post">
      <span className="motu-account__name">{viewer.handle}</span>
      {/* The disc is the button. It is the only round thing in the bar, which is what makes it read
          as a person — and `title` plus the label say what pressing it does, because a picture of
          somebody is not an obvious way to leave. */}
      <button type="submit" className="motu-account__out" title={`Sign out ${viewer.handle}`}>
        <Avatar aria-hidden="true">{viewer.initial}</Avatar>
        <span className="motu-account__hint">Sign out</span>
      </button>
    </form>
  )
}
