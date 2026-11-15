// « The harbour » — the dock example's OUTER region, as a type. Belongs to the application: no motu
// import, erases at runtime. Everything here is host-fed, read by the server like the front page.
import type { Viewer } from "@/src/auth/viewer"

export type HarbourRegion = {
  /** What the host holds in total — the readout, which DOCKS beside the quay's list when there is one. */
  stats: { blobs: number; bytes: number; maxRecords: number }
  /** Whoever is reading this, or null for a visitor. */
  viewer: Viewer | null
}

/** No island produces region state here. */
export type ProducedHarbourKeys = never
