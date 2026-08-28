import type { ReactNode } from "react"
import { Bay } from "@motu/chrome/react"
import { size } from "@/src/host/format"

/**
 * The front page's ARRANGEMENT, as a component the archipelago points at.
 *
 * THE BAY IS NOT AN ISLAND. It shows numbers, but it names no repository and reads no region key that
 * a viewer's access changes — it is the same for everyone who can reach the page at all. motu's own
 * rule is that what merely ARRANGES is not an island, and a chrome bar reporting the host's total
 * size is chrome. The two things that ARE filtered per viewer — the galleries and the repositories —
 * are the islands, and they are the two that could leak.
 */
export function IndexLayout({
  stats,
  composed,
  repositories,
}: {
  stats?: { blobs: number; bytes: number; maxRecords: number }
  composed?: ReactNode
  repositories?: ReactNode
}) {
  const s = stats ?? { blobs: 0, bytes: 0, maxRecords: 1000 }
  return (
    <>
      {/* `children` is the bay's hard-right readout slot — the kit's own word for where the host's
          server-rendered bay puts this line. `titleAs` stays the default `strong`, matching that bay:
          the page's real heading is elsewhere, and promoting this to an <h1> was called out in the
          kit as an accessibility regression the styling cannot show. */}
      <Bay title="motu" subtitle="published lagoons">
        {`${s.blobs} object${s.blobs === 1 ? "" : "s"} · ${size(s.bytes)} · cap ${s.maxRecords}/repo`}
      </Bay>
      <main>
        {composed}
        {repositories}
      </main>
    </>
  )
}
