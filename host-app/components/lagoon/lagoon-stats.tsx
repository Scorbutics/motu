"use client"
// The bay's readout: what this host holds in total.
//
// A METER, not a sentence. `351 objects · 77.9 MB · cap 1000/repo` is three separate facts run
// together in prose, which is the shape a footnote takes; every reference design gives its numbers a
// LABEL over a VALUE and tabular figures, so they line up and can be compared at a glance. The kit's
// `Meter` is exactly that — dt/dd pairs, uppercase labels, `font-variant-numeric: tabular-nums` — and
// the first version reimplemented none of it as one template string.
import { Meter } from "@motu/chrome/react"
import { size } from "@/src/host/format"

export interface LagoonStatsProps {
  /**
   * Null when the host has not been asked yet — which is NOT the same as a host holding nothing.
   * Rendering nothing is the honest answer to "we do not know"; `0 objects` is an answer, and a wrong
   * one anywhere except a genuinely empty host.
   */
  stats?: { blobs: number; bytes: number; maxRecords: number } | null
}

export function LagoonStats({ stats = null }: LagoonStatsProps) {
  if (!stats) return null
  // `items`, not children — the kit builds the dt/dd pairs itself, which is what keeps every meter on
  // every motu surface the same object rather than three hand-assembled definition lists.
  return (
    <Meter
      items={[
        { label: "Objects", value: stats.blobs.toLocaleString("en") },
        { label: "Size", value: size(stats.bytes) },
        { label: "Cap", value: `${stats.maxRecords.toLocaleString("en")}/repo` },
      ]}
    />
  )
}
