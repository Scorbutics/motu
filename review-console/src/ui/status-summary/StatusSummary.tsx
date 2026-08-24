import { Meter } from "@motu/chrome/react"
import type { Shot } from "@/lib/host"

/**
 * How much is waiting on you.
 *
 * Reads only — it produces nothing and cannot be clicked. It exists because the number that decides
 * whether to open this screen at all ("is anything pending?") should not require reading a list.
 *
 * A `Meter` from motu's kit, which is what this shape has always been: a run of counts read at a
 * glance. It had its own `.ss` rules for the label size, the tabular numerals and the baseline
 * alignment — all of them the same values the kit already carried, arrived at twice.
 */
export function StatusSummary({ shots = [] }: { shots?: Shot[] }) {
  if (!shots.length) return null
  const changed = shots.filter((s) => s.status === "changed").length
  const fresh = shots.filter((s) => s.status === "new").length
  const settled = shots.length - changed - fresh
  // THE KIT'S FOUR VERDICTS, which is what these three always were: a shot that moved is `warn` (look
  // at this), a shot with no baseline is `ok`, a settled one is `neutral`. They used to be `--changed`
  // and `--new`, two names for two of MOTU_VERDICT's own colours.
  return (
    <Meter
      className="ss"
      items={[
        { label: "changed", value: changed, tone: "warn" },
        { label: "new", value: fresh, tone: "ok" },
        { label: "accepted", value: settled, tone: "neutral" },
      ]}
    />
  )
}
