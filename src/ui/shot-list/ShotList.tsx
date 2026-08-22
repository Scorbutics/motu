import type { Shot } from "@/lib/host"
import type { ShotRef } from "@/lib/review-region"

/** Group by island, because that is the unit someone accepts. */
function byIsland(shots: Shot[]): [string, Shot[]][] {
  const out = new Map<string, Shot[]>()
  for (const s of shots) {
    const list = out.get(s.island)
    if (list) list.push(s)
    else out.set(s.island, [s])
  }
  return [...out.entries()].sort(([a], [b]) => a.localeCompare(b))
}

const LABEL: Record<Shot["status"], string> = {
  changed: "changed",
  new: "new",
  match: "ok",
}

/**
 * Every shot of the selected project, grouped by island.
 *
 * `changed` first within each island: a review session is about what moved, and making someone scroll
 * past forty green rows to find the one red one is how a tool stops being opened.
 */
export function ShotList({
  shots = [],
  selected = null,
  busy = false,
  onShotSelected,
}: {
  shots?: Shot[]
  selected?: ShotRef | null
  busy?: boolean
  onShotSelected?: (ref: ShotRef) => void
}) {
  if (busy && !shots.length) return <div className="sl-empty">Loading…</div>
  if (!shots.length) return <div className="sl-empty">This project has no shots yet.</div>

  const rank = (s: Shot) => (s.status === "changed" ? 0 : s.status === "new" ? 1 : 2)

  return (
    <div className="sl">
      {byIsland(shots).map(([island, list]) => {
        const pending = list.filter((s) => s.status !== "match").length
        return (
          <section key={island} className="sl-group">
            <h3>
              {island}
              {pending > 0 && <span className="sl-pending">{pending} pending</span>}
            </h3>
            <ul>
              {[...list]
                .sort((a, b) => rank(a) - rank(b) || a.shot.localeCompare(b.shot))
                .map((s) => {
                  const isSelected = selected?.island === s.island && selected?.shot === s.shot
                  return (
                    <li key={s.shot}>
                      <button
                        type="button"
                        className="sl-shot"
                        data-status={s.status}
                        aria-current={isSelected}
                        onClick={() => onShotSelected?.({ island: s.island, shot: s.shot })}
                      >
                        <span className="sl-name">{s.shot}</span>
                        <span className="sl-status">{LABEL[s.status]}</span>
                      </button>
                    </li>
                  )
                })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
