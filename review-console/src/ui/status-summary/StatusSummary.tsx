import type { Shot } from "@/lib/host"

/**
 * How much is waiting on you.
 *
 * Reads only — it produces nothing and cannot be clicked. It exists because the number that decides
 * whether to open this screen at all ("is anything pending?") should not require reading a list.
 */
export function StatusSummary({ shots = [] }: { shots?: Shot[] }) {
  if (!shots.length) return null
  const changed = shots.filter((s) => s.status === "changed").length
  const fresh = shots.filter((s) => s.status === "new").length
  const settled = shots.length - changed - fresh
  return (
    <dl className="ss">
      <div data-tone="changed"><dt>changed</dt><dd>{changed}</dd></div>
      <div data-tone="new"><dt>new</dt><dd>{fresh}</dd></div>
      <div data-tone="match"><dt>accepted</dt><dd>{settled}</dd></div>
    </dl>
  )
}
