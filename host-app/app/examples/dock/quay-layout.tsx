import type { ReactNode } from "react"
import { Page } from "@motujs/chrome/react"

/**
 * The quay's ARRANGEMENT — the repositories, with a place kept at their right.
 *
 * `aside` is a DOCK (`aside: { dock: 'quay-aside' }` in the archipelago): motu fills it with the island
 * another region docks there — the harbour's readout — and the page never passes it. On a phone the
 * place comes FIRST, above the list. Hidden while nothing is in it.
 */
export function QuayLayout({ repositories, aside }: { repositories?: ReactNode; aside?: ReactNode }) {
  return (
    <Page as="main" stack>
      <div data-part="quay" style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
        <div data-part="quay-list" style={{ flex: "1 1 420px", minWidth: 0 }}>{repositories}</div>
        <div data-part="quay-aside" className="quay-aside" style={{ flex: "0 1 280px", minWidth: 0 }}>{aside}</div>
      </div>
    </Page>
  )
}
