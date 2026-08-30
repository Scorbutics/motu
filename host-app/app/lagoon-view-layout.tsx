"use client"
// The lagoon view's ARRANGEMENT — the page's own component, declared once as the region's root so the
// page and the lagoon compose it the same way.
//
// A MAP, NOT A SECOND COPY OF THE SCREEN. Everything here is placement: what is beside what, and
// which of the two states placements is on screen at this width. The dock's chrome — the water
// gradient, the rail, the sheet's grab handle — still comes from `@motu/chrome`, because it is drawn
// identically when this dock is injected into somebody else's artifact.
//
// TWO PLACEMENTS OF ONE ISLAND. `states` is the panel's column and `statesStrip` is the phone bar's
// line of chips; CSS decides which is visible, and the region has one producer either way. Rendering
// both and hiding one is deliberate: a placement that only mounts at some widths is a slot no flow
// can drive at the other, and `render-coverage` would be right to call it uncovered.
import type { ReactNode } from "react"

export interface LagoonViewLayoutProps {
  /** One prop per declared slot — the archipelago's `slots` maps each to its name. */
  stations?: ReactNode
  states?: ReactNode
  statesStrip?: ReactNode
  /** What is being framed, for the bay. Host-computed text — it shows nothing the region owns. */
  title?: string
  subtitle?: string
  /** The artifact itself, which is the thing being viewed rather than a view of the region. */
  frame?: ReactNode
}

export function LagoonViewLayout({
  stations,
  states,
  statesStrip,
  title = "—",
  subtitle = "",
  frame,
}: LagoonViewLayoutProps) {
  return (
    <div className="dock-view">
      <header className="dock-bay">
        <b>{title}</b>
        <small>{subtitle}</small>
      </header>

      {/* THE ARTIFACT, framed. Its own document — its own React, its own stylesheet — which is the
          isolation that makes composing somebody else's lagoon possible at all.
          RENDERED ONLY IF THERE IS ONE: in the lagoon this region has no artifact to frame, and an
          empty <main> with a border and a min-height is a large blank box that reads as a broken
          frame rather than as an absent one. */}
      {frame ? <main className="dock-stage">{frame}</main> : null}

      {/* The phone bar's strip: first among the controls because it is the one you reach without
          opening anything, and a reader tabbing through the dock should meet it before the panel. */}
      <div className="dock-strip">{statesStrip}</div>

      <div className="dock-panes">
        <section className="dock-pane" aria-label="Regions">
          <h2 className="dock-pane-title">Regions</h2>
          {stations}
        </section>
        <section className="dock-pane" aria-label="States">
          <h2 className="dock-pane-title">States</h2>
          {states}
        </section>
      </div>
    </div>
  )
}
