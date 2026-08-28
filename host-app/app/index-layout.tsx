import type { ReactNode } from "react"
import { Bay } from "@motu/chrome/react"

/**
 * The front page's ARRANGEMENT, as a component the archipelago points at.
 *
 * THE BAY IS ARRANGEMENT; ITS READOUT IS NOT. That distinction cost a bug. This file used to take
 * `stats` and render the readout itself, on the argument that a chrome bar naming no repository is
 * chrome — but the test is SHOWS versus ARRANGES, and a total is shown. Because the region could not
 * reach it, the lagoon rendered a defaulted `0 objects · 0 kB` above five repositories holding 41
 * records, which `store.stats()` cannot produce. The readout is a slot now, filled by an island with
 * its own scenarios; the bar around it stays arrangement.
 */
export function IndexLayout({
  readout,
  composed,
  repositories,
}: {
  readout?: ReactNode
  composed?: ReactNode
  repositories?: ReactNode
}) {
  return (
    <>
      {/* `children` is the bay's hard-right readout slot — the kit's own word for where the host's
          server-rendered bay puts this line. `titleAs` stays the default `strong`, matching that bay:
          the page's real heading is elsewhere, and promoting this to an <h1> was called out in the
          kit as an accessibility regression the styling cannot show. */}
      <Bay title="motu" subtitle="published lagoons">
        {readout}
      </Bay>
      <main>
        {composed}
        {repositories}
      </main>
    </>
  )
}
