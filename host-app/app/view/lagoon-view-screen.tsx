"use client"
// The lagoon view, as a region — the migrated dock.
//
// WHAT THIS REPLACES. The same screen is drawn today by ~1,700 lines of vanilla JS in
// `@motu/chrome/dock`, injected into a document that a route HANDLER builds as a string. That is why
// it was never declared: a route handler cannot render React, so the chrome could not be islands.
// This is a page, so it can.
//
// STAGED, DELIBERATELY. It serves at `/view/…` while `/<repo>/<project>/<ref>/<slug>` still goes to
// the vanilla dock, because that path carries the live host and the switch is its own decision. The
// slots here are the two the survey builds first; the rest of the dock's panes are declared
// `planned` and land the same way.
import { useCallback, useEffect, useRef, useState } from "react"
import { LagoonView, MotuRegion } from "@/components/motu/lagoon-view-region"
import { DockRegions } from "@/components/lagoon/dock-regions"
import { DockStates } from "@/components/lagoon/dock-states"
import type { LagoonStation, LagoonState } from "@/app/lagoon-view-region"

/** What the framed artifact publishes about itself. Read, never assumed. */
type Catalogue = {
  regions: LagoonStation[]
  states: LagoonState[]
}

/**
 * The artifact's control surface, as this page uses it.
 *
 * Deliberately narrow: the page needs to know what can be opened and to ask for one of them. Every
 * other verb on `__motuLagoonControl` belongs to a pane that is not built yet.
 */
type LagoonControl = {
  regions: () => LagoonStation[]
  current: () => { region: string; flow: string | null }
  show: (id: string) => void
  runFlow: (name: string | null) => void
  subscribe?: (fn: () => void) => () => void
}

const EMPTY: Catalogue = { regions: [], states: [] }

export function LagoonViewScreen({
  frameSrc,
  title,
  subtitle,
}: {
  frameSrc: string
  title: string
  subtitle: string
}) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [catalogue, setCatalogue] = useState<Catalogue>(EMPTY)

  /** The frame's control surface, or null while it is still booting — or if it never does. */
  const control = useCallback((): LagoonControl | null => {
    try {
      const w = frame.current?.contentWindow as (Window & { __motuLagoonControl?: LagoonControl }) | null
      return w?.__motuLagoonControl ?? null
    } catch {
      // A frame from another origin. Not an error: it means this page cannot drive that artifact, and
      // the lists say so by staying empty rather than by throwing.
      return null
    }
  }, [])

  // READ THE CATALOGUE, DO NOT WAIT FOR `load`.
  //
  // `load` fires on a document whose bundle then throws — which is the entire reason the boot guard
  // exists — so a page that waits for it and reads the control surface gets undefined and renders an
  // empty dock over a broken lagoon. Poll for the surface itself, and keep following it afterwards
  // because the artifact's own address bar can change the region without asking this page.
  useEffect(() => {
    let live = true
    let unsubscribe: (() => void) | null = null

    const sync = () => {
      const ctl = control()
      if (!ctl) return false
      const now = ctl.current()
      const w = frame.current?.contentWindow as (Window & { __motuLagoonStates?: { flows?: Record<string, LagoonState[]> } }) | null
      setCatalogue({
        regions: ctl.regions(),
        // The states of the region ON SCREEN. Derived from `region`, which is why no island writes it.
        states: w?.__motuLagoonStates?.flows?.[now.region] ?? [],
      })
      // ESTABLISHED THROUGH THE BINDING, which is the page's only legitimate way to put a value in
      // the region — `<MotuRegion>` takes its seed when the binding is created, so it cannot carry
      // something read out of a frame at runtime. This is the page saying where the artifact already
      // is, not an island's output being laundered back in.
      LagoonView.seed('region', now.region)
      LagoonView.seed('flow', now.flow)
      return true
    }

    const poll = window.setInterval(() => {
      if (!live) return
      if (!sync()) return
      window.clearInterval(poll)
      const ctl = control()
      // Follow it from here rather than polling forever: the artifact reports its own changes.
      unsubscribe = ctl?.subscribe?.(() => sync()) ?? null
    }, 250)

    return () => {
      live = false
      window.clearInterval(poll)
      unsubscribe?.()
    }
  }, [control])

  return (
    <MotuRegion>
      <LagoonView.Root
        title={title}
        subtitle={subtitle}
        frame={<iframe ref={frame} src={frameSrc} title="lagoon" className="dock-frame" />}
        stations={<DockRegions regions={catalogue.regions} />}
        states={<DockStates states={catalogue.states} />}
        statesStrip={<DockStates states={catalogue.states} compact />}
      />
      <DriveTheArtifact control={control} />
    </MotuRegion>
  )
}

/**
 * The region's choices, applied to the artifact.
 *
 * A CHILD, so it can call `useRegion()` — the hook reads the region it is inside, and the screen
 * above establishes that region rather than living in it. This is also the piece `integrate check`
 * asks for by name: a host that feeds a region and never reads it back is feeding a void.
 */
function DriveTheArtifact({ control }: { control: () => LagoonControl | null }) {
  const region = LagoonView.useRegion()
  const applied = useRef<{ region: string; flow: string | null }>({ region: "", flow: null })

  useEffect(() => {
    const ctl = control()
    if (!ctl) return
    const now = ctl.current()
    // `useRegion()` answers with what the region HOLDS, so every key is optional until something has
    // put it there. The defaults are the same two the region starts in.
    const wantRegion = region.region ?? ''
    const wantFlow = region.flow ?? null

    // ONLY WHAT CHANGED, and only when it differs from the artifact. Without both guards this loops:
    // the artifact reports a change, the page seeds it, the seed re-runs this effect, and it asks the
    // artifact for the state it is already in — which for a flow means replaying it.
    if (wantRegion && wantRegion !== now.region && wantRegion !== applied.current.region) {
      applied.current = { region: wantRegion, flow: null }
      ctl.show(wantRegion)
      return
    }
    if (wantFlow !== now.flow && wantFlow !== applied.current.flow) {
      applied.current = { region: wantRegion, flow: wantFlow }
      ctl.runFlow(wantFlow)
    }
  }, [region.region, region.flow, control])

  return null
}
