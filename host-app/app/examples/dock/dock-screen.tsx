"use client"
// The dock example's client boundary — two regions, one island docked from the outer into the inner.
//
// What is NOT here is the point: no `useState` for a DOM node, no ref handed up from the quay, no
// `createPortal`, no "is the quay on?" prop threaded into the harbour's layout. The harbour declares
// that its readout goes into the quay's dock; the quay declares the dock; `<Harbour.Root>` places it.
import { Harbour, MotuHarbourRegion } from "@/components/motu/harbour-region"
import { Quay, MotuQuayRegion } from "@/components/motu/quay-region"
import { LagoonRepos } from "@/components/lagoon/lagoon-repos"
import { LagoonStats } from "@/components/lagoon/lagoon-stats"
import { ViewerBadge } from "@/components/lagoon/viewer-badge"
import type { HarbourRegion } from "./harbour-region"
import type { QuayRegion } from "./quay-region"

export function DockScreen({
  stats,
  viewer,
  repos,
  cap,
  quay,
}: HarbourRegion & Omit<QuayRegion, "query"> & { /** `?quay=off`: the inner region is not on this screen. */ quay: boolean }) {
  return (
    <MotuHarbourRegion>
      <Harbour.Root
        readout={<LagoonStats stats={stats} />}
        account={<ViewerBadge viewer={viewer} />}
        // The quay, when it is on screen. Absent, the readout renders in the bay — its declared fallback.
        quay={
          quay ? (
            <MotuQuayRegion>
              <Quay.Root repositories={<LagoonRepos repos={repos} cap={cap} query="" />} />
            </MotuQuayRegion>
          ) : null
        }
      />
    </MotuHarbourRegion>
  )
}
