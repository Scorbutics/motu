import type { ShotRef } from "@/lib/review-region"
import type { Shot } from "@/lib/host"

export type AcceptScope = { repo: string; island?: string; shot?: string }

/**
 * Accepting, at three widths.
 *
 * It emits an INTENT and owns nothing: what the statuses become is the host's answer, after it has
 * POSTed and refetched. An island that wrote the new statuses itself would be claiming a result only
 * the host can produce — which is the laundering the ownership rules exist to stop.
 */
export function AcceptBar({
  repo = null,
  shot = null,
  busy = false,
  shots = [],
  onAcceptRequested,
}: {
  repo?: string | null
  shot?: ShotRef | null
  busy?: boolean
  shots?: Shot[]
  onAcceptRequested?: (scope: AcceptScope) => void
}) {
  if (!repo) return null
  // COUNTED HERE, from the region's own `shots`. Taking it as a `pending` number computed by the page
  // meant the bar could disagree with the summary standing next to it — and did, in the lagoon, where
  // nothing supplies the prop: "CHANGED 1 NEW 1" above "Accept all 0 pending".
  const pending = shots.filter((s) => s.status !== "match").length
  const disabled = busy || pending === 0
  return (
    <div className="ab">
      <button type="button" disabled={disabled || !shot} onClick={() => shot && onAcceptRequested?.({ repo, island: shot.island, shot: shot.shot })}>
        Accept this shot
      </button>
      <button type="button" disabled={disabled || !shot} onClick={() => shot && onAcceptRequested?.({ repo, island: shot.island })}>
        Accept {shot ? shot.island : "island"}
      </button>
      <button type="button" className="ab-all" disabled={disabled} onClick={() => onAcceptRequested?.({ repo })}>
        Accept all {pending} pending
      </button>
      {busy && <span className="ab-busy">working…</span>}
    </div>
  )
}
