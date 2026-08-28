"use client"
// The bay's readout: what this host holds in total.
//
// AN ISLAND, though I first called it chrome. The rule is "what the region SHOWS or ACTS ON is an
// island; what merely ARRANGES it is not", and this shows data — I argued it was arrangement because
// it names no repository, which is not the test. A fresh reader found the consequence before the
// reasoning: with `stats` unreachable from the region, the layout fell back to a default and rendered
// `0 objects · 0 kB` above five repositories holding 41 records. `store.stats()` cannot produce that.
// The invented state was the price of the wrong call.
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
  return (
    <>{`${stats.blobs} object${stats.blobs === 1 ? "" : "s"} · ${size(stats.bytes)} · cap ${stats.maxRecords}/repo`}</>
  )
}
