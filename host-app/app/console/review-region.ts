// The review console's shared state, as a type.
//
// Belongs to the APPLICATION. Three keys are OWNED by islands — the whole point of this screen is that
// picking a repo changes what the list shows, picking a shot changes what the viewer shows, and
// accepting changes the status the list renders. Everything else the page fetches.
import type { HostRegion } from "@motu/types"
import type { RepoSummary, Shot } from "@/src/review/host"

/** A shot's identity within a repo: the island that owns it, and `<scenario>@<viewport>`. */
export interface ShotRef {
  island: string
  shot: string
}

export interface ReviewRegion {
  /** Every project the host holds. HOST-FED — the page fetches it once. */
  repos: RepoSummary[]
  /** Which project is being reviewed. OWNED by the repo picker. */
  selectedRepo: string | null
  /** The selected repo's shots. HOST-FED: the page refetches when the selection moves, and again
   *  after an accept, so the list's statuses are the host's answer rather than a local guess. */
  shots: Shot[]
  /** Which shot the viewer is showing. OWNED by the shot list. */
  selectedShot: ShotRef | null
  /** Which image the viewer is showing for it. OWNED by the viewer. */
  viewMode: "accepted" | "last" | "diff"
  /** A fetch or an accept is in flight. HOST-FED — the page knows, the islands only render it. */
  busy: boolean
  /** The last thing that went wrong, or null. HOST-FED. */
  error: string | null
}

/**
 * The keys an ISLAND produces. Accepting is deliberately NOT here: the accept bar emits an intent and
 * the HOST performs it, because the result is whatever the host then says the statuses are. An island
 * that wrote `shots` itself would be claiming an answer it cannot produce.
 */
export type ProducedReviewKeys = "selectedRepo" | "selectedShot" | "viewMode"

export type ReviewHostRegion = HostRegion<ReviewRegion, ProducedReviewKeys>
