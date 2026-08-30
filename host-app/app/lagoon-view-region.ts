// The lagoon VIEW's shared state, as a type.
//
// Belongs to the APPLICATION: no motu import, and it erases at runtime.
//
// Unlike the front page, this region is not all host-fed. The viewer's whole job is to CHANGE what
// you are looking at, so the keys below split cleanly in two: what the artifact tells us it can be
// opened in, and what the reader has chosen. Getting that split wrong is the bug this surface keeps
// producing — a control that keeps its own copy of the choice, and a second control that disagrees
// with it. `flow` had exactly that shape: the in-page dock held it in its own DOM, so a panel drawn
// anywhere else lit "As seeded" whatever you pressed.
import type { Viewer } from "@/src/auth/viewer"

/** A region the framed artifact declares — its id, and what the catalogue calls it. */
export type LagoonStation = {
  id: string
  label: string
}

/**
 * A state of the region on screen: a declared flow, by name.
 *
 * "As seeded" is NOT in this list. It is the absence of a flow (`flow: null`) rather than a member of
 * the set, because it is the state the page establishes on its own — every flow is something applied
 * on top of it. A list that carried it as a row would make it something you could fail to find.
 */
export type LagoonState = {
  name: string
}

export type LagoonViewRegion = {
  // ── what the artifact says about itself (host-fed, derived, owned by nobody) ──────────────────

  /** Every region the framed lagoon declares, in catalogue order. */
  regions: LagoonStation[]

  /** The flows the CURRENT region declares. Changes when `region` does — derived, never written. */
  states: LagoonState[]

  /** Who is reading, for the bay. Same rule as the front page: decided where no browser can reach. */
  viewer: Viewer | null

  // ── what the reader has chosen (produced) ────────────────────────────────────────────────────

  /** The region being framed. Written by the station list and by nothing else. */
  region: string

  /**
   * The state being shown, or `null` for the region as the page seeds it.
   *
   * ONE PRODUCER, and it is `x-dock-states` — placed twice (the panel's list, the phone's strip),
   * which is one island in two slots rather than two islands claiming a key.
   */
  flow: string | null
}

/** The keys islands produce. The archipelago's `writes` must be exactly this set. */
export type ProducedLagoonViewKeys = "region" | "flow"
