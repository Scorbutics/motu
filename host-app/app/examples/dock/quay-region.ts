// « The quay » — the dock example's INNER region, as a type: the repositories, laid out with a place
// kept beside them for ANOTHER region's island. Application-owned; no motu import.
import type { LagoonRepo } from "@/app/index-region"

export type QuayRegion = {
  /** The repositories this viewer may see. Filtered upstream. */
  repos: LagoonRepo[]
  /** The per-repo record cap the rows draw against. */
  cap: number
  /** No search on this page — the list shows everything it is given. Host-fed, empty. */
  query: string
}

export type ProducedQuayKeys = never
