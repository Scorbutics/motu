import type { ReactNode } from "react"
import { Bay, Mark, Page } from "@motu/chrome/react"

/**
 * The front page's ARRANGEMENT, as a component the archipelago points at.
 *
 * THE BAY IS ARRANGEMENT; ITS READOUT IS NOT. That distinction cost a bug. This file used to take
 * `stats` and render the readout itself, on the argument that a chrome bar naming no repository is
 * chrome — but the test is SHOWS versus ARRANGES, and a total is shown. Because the region could not
 * reach it, the lagoon rendered a defaulted `0 objects · 0 kB` above five repositories holding 41
 * records, which `store.stats()` cannot produce. The readout is a slot now, filled by an island with
 * its own scenarios; the bar around it stays arrangement.
 *
 * THE MASTHEAD IS THE SAME BAY. `shape="masthead"` is the tall end of one component — the deeper
 * gradient, the looping sheen, the drifting waterline, room for a heading. A second header component
 * for the front page would have been a second thing to keep in step with the console's, which is the
 * drift `@motu/chrome` exists to stop.
 *
 * THE HEADLINE IS COPY, NOT DATA. "Your lagoons" and the sentence under it name no repository and
 * count nothing, which is what keeps them here rather than in an island. The counts a visitor wants
 * are already the readout's, and a second component counting the same host is exactly how the number
 * in the bar stops matching the list below it — `lagoon-stats` says so about its own inputs.
 */
export function IndexLayout({
  readout,
  account,
  filter,
  repositories,
  palette,
}: {
  readout?: ReactNode
  account?: ReactNode
  filter?: ReactNode
  repositories?: ReactNode
  palette?: ReactNode
}) {
  return (
    <>
      {/* `children` is the bay's hard-right readout slot — the kit's own word for where the host's
          server-rendered bay puts this line. `titleAs` stays the default `strong`: the page's real
          <h1> is the masthead's headline, one element below, and promoting this too would give the
          page two first-level headings. */}
      <Bay
        shape="masthead"
        leading={<Mark />}
        title="motu"
        headline="Your lagoons"
        blurb="Every declared state, published and addressable."
      >
        {/* NO REVIEW LINK HERE ANY MORE. Reviewing is something you do TO a project, so the way in
            lives beside the project — in a lagoon's own sidebar, where it names what you are looking
            at. In this masthead it was a link with no subject: it opened a console that then asked
            you to pick a project you had not chosen yet. It is still in the palette, which is a
            different thing: a command you go looking for, not a permanent word in the bar. */}
        {readout}
        {account}
      </Bay>
      {/* The filter rides in the gap the masthead's bottom padding leaves under the waterline. */}
      <Page lift>{filter}</Page>
      {/* ONE COLUMN, not a column inside a column. `PAGE_SHELL_CSS` styles a bare <main> as its own
          centred 940px block, which put these rows two hundred pixels right of the filter bar above
          them. `Page as="main"` makes the two the same column. */}
      <Page as="main" stack>
        {repositories}
      </Page>
      {/* LAST, AND OUTSIDE THE COLUMN. The palette covers the page; nesting it in the content column
          would put a fixed overlay inside a stacking context that has nothing to do with it. */}
      {palette}
    </>
  )
}
