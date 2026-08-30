"use client"
// The station list: every region the framed lagoon declares, and which one is being framed.
//
// AN ISLAND, because it ACTS — picking a row is what changes the artifact on screen. It is also the
// region's first producer: `region` is written here and nowhere else, which is what the archipelago's
// `writes` records and what makes a second claim on the key a compile error rather than a runtime
// complaint reached after the work is done.
//
// IT OWNS NO ARTIFACT. It never touches the frame, the control surface or the address — it emits the
// id somebody asked for. What that means for the page is the page's business, which is the coupling
// the region exists to declare.
import { useCallback } from "react"
import { List } from "@motu/chrome/react"
import type { LagoonStation } from "@/app/lagoon-view-region"

export interface DockRegionsProps {
  /** Every declared region. Empty is a real state — an artifact that has not booted yet. */
  regions?: LagoonStation[]
  /** Which one is framed. Held by the region, not here, so a link or a flow can set it. */
  region?: string
  onRegionChange?: (id: string) => void
}

export function DockRegions({ regions = [], region = "", onRegionChange }: DockRegionsProps) {
  const pick = useCallback((id: string) => () => onRegionChange?.(id), [onRegionChange])

  // Same reason as the states list: this catalogue is read off a framed artifact, so it is only
  // supposed to be an array. Mapping a non-array throws and the slot reports as never mounted.
  const list = Array.isArray(regions) ? regions : []

  // THE EMPTY STATE SAYS WHICH EMPTY IT IS. "No regions" and "the lagoon has not answered yet" look
  // identical as a blank list, and they are opposite problems — one is an artifact with nothing
  // declared, the other is one that is still booting. The dock spent a week showing the first
  // sentence for the second case.
  if (list.length === 0) {
    return (
      <List aria-label="Regions">
        <p className="dock-empty">Waiting for the lagoon to say what it declares…</p>
      </List>
    )
  }

  return (
    <List aria-label="Regions">
      {list.map((station) => (
        <button
          key={station.id}
          type="button"
          className="dock-opt"
          // `aria-current`, not `aria-pressed`: these are places you can be, and exactly one of them
          // is where you are. A pressed toggle would say each row is independently on or off.
          aria-current={station.id === region ? "true" : "false"}

          onClick={pick(station.id)}
        >
          {/* The framed one, marked in TEXT — see dock-states for why an attribute was not enough. */}
          <span className="dock-lamp" aria-hidden="true">{station.id === region ? "▸" : ""}</span>
          {station.label}
        </button>
      ))}
    </List>
  )
}
