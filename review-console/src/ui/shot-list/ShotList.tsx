import { Cap, Empty, Grow, Pill, Row } from "@motu/chrome/react"
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
 * A shot's status, as one of motu's four verdicts.
 *
 * A shot that moved is `warn` — look at this — and a shot with no baseline is `ok`. Those are the two
 * this console used to call `--changed` and `--new`, spelled `#b45309` and `#0f766e`: MOTU_VERDICT's
 * own values, arrived at separately. A settled shot has nothing to say, which is what `neutral` is.
 */
const TONE: Record<Shot["status"], "warn" | "ok" | "neutral"> = {
  changed: "warn",
  new: "ok",
  match: "neutral",
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
  if (busy && !shots.length) return <Empty className="sl-empty">Loading…</Empty>
  if (!shots.length) return <Empty className="sl-empty">This project has no shots yet.</Empty>

  const rank = (s: Shot) => (s.status === "changed" ? 0 : s.status === "new" ? 1 : 2)

  return (
    <div className="sl">
      {byIsland(shots).map(([island, list]) => {
        const pending = list.filter((s) => s.status !== "match").length
        return (
          <section key={island} className="sl-group">
            <Cap as="h3" className="sl-head">
              {island}
              {pending > 0 && <span className="sl-pending">{pending} pending</span>}
            </Cap>
            <ul>
              {[...list]
                .sort((a, b) => rank(a) - rank(b) || a.shot.localeCompare(b.shot))
                .map((s) => {
                  const isSelected = selected?.island === s.island && selected?.shot === s.shot
                  return (
                    <li key={s.shot}>
                      <Row
                        as="button"
                        current={isSelected}
                        className="sl-shot"
                        data-status={s.status}
                        onClick={() => onShotSelected?.({ island: s.island, shot: s.shot })}
                      >
                        <Grow className="sl-name">{s.shot}</Grow>
                        <Pill tone={TONE[s.status]} className="sl-status">
                          {LABEL[s.status]}
                        </Pill>
                      </Row>
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
