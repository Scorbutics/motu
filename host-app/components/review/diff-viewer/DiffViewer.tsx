import { Button, Empty, Panel, PanelHead } from "@motu/chrome/react"
import type { Shot } from "@/src/review/host"
import type { ShotRef } from "@/app/console/review-region"

type Mode = "accepted" | "last" | "diff"

const MODES: { id: Mode; label: string }[] = [
  { id: "accepted", label: "Accepted" },
  { id: "last", label: "Last run" },
  { id: "diff", label: "Difference" },
]

/**
 * The three images a decision needs, one at a time.
 *
 * Side by side was the first instinct and it is wrong at these sizes: a 1280px baseline beside a
 * 1280px actual is two thumbnails, and the whole question is "what moved". Toggling in place keeps
 * the frame still so the eye does the diffing.
 *
 * THE FRAME IS THE KIT'S PANEL — the same frosted sheet the seam lens floats over a page. This card
 * had its own border, radius and head rule, one pixel and two hundredths of an alpha away from the
 * framework's; the two were meant to look like one product and did not quite.
 */
export function DiffViewer({
  shot = null,
  mode = "diff",
  shots = [],
  shotUrl,
  onViewChanged,
}: {
  shot?: ShotRef | null
  mode?: Mode
  /**
   * The region's shots. The viewer finds its OWN record rather than being handed one: a `detail` prop
   * derived by the page is a key the page computes from two region keys and passes to a third island,
   * which is the laundering the ownership rules exist to stop — and it left this island unable to
   * render anything in the lagoon, where there is no page to derive it.
   */
  shots?: Shot[]
  /** How to turn a content hash into a URL. Injected: the viewer must not know where the host is. */
  shotUrl?: (hash: string) => string
  onViewChanged?: (mode: Mode) => void
}) {
  if (!shot) return <Empty pad="block" className="dv-empty">Pick a shot to see what changed.</Empty>

  const detail = shots.find((s) => s.island === shot.island && s.shot === shot.shot) ?? null
  const hash = mode === "accepted" ? (detail?.accepted ?? null) : (detail?.last?.hash ?? null)
  const missing =
    mode === "accepted" && !detail?.accepted
      ? "Nothing accepted yet — this shot has never had a baseline."
      : !hash
        ? "This shot has not been rendered yet."
        : null

  return (
    <Panel shape="window" className="dv">
      <PanelHead title={shot.island} sub={<span className="dv-shot">{shot.shot}</span>} className="dv-head">
        <div className="dv-modes" role="group" aria-label="Which image to show">
          {MODES.map((m) => (
            <Button
              key={m.id}
              shape="pill"
              weight="quiet"
              aria-current={m.id === mode}
              disabled={m.id === "diff" && detail?.status !== "changed"}
              onClick={() => onViewChanged?.(m.id)}
            >
              {m.label}
            </Button>
          ))}
        </div>
      </PanelHead>
      {mode === "diff" ? (
        // The diff image is produced locally by `motu island snapshot`, not by the host — so the
        // viewer says where to look rather than pretending it has one.
        <Empty pad="block" className="dv-empty">
          The pixel diff lives beside the run that produced it:
          <code>.motu/snapshots/{shot.island}/{shot.shot}.diff.png</code>
        </Empty>
      ) : missing ? (
        <Empty pad="block" className="dv-empty">{missing}</Empty>
      ) : (
        <img className="dv-img" alt={`${shot.island} ${shot.shot} (${mode})`} src={shotUrl?.(hash!) ?? ""} />
      )}
    </Panel>
  )
}
