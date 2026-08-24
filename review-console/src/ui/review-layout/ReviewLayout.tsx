import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import { Bay } from "@motu/chrome/react"

/**
 * WHERE THE CONSOLE'S PARTS SIT — once, for the page and for the lagoon.
 *
 * The lagoon frame used to be a second copy of this JSX. That is the thing motu's own rules forbid
 * ("never a second copy of the arrangement, which drifts"), and it drifts for the same reason a second
 * copy of a region's vocabulary does: someone changes the page and the preview keeps showing the old
 * shape, which is exactly the surface a reviewer is trusting.
 *
 * TWO ARRANGEMENTS, ONE DECLARATION. The islands, their ownership and their bindings are identical in
 * both; only where they sit changes:
 *
 *   desktop   projects | shots | viewer + accept        three columns, everything at once
 *   phone     a deck   — one shot fills the screen, the shots are a strip you thumb through,
 *                        and the projects move into a sheet you pull up
 *
 * The phone form exists because the four panels were competing for one column: everything was visible
 * and nothing was usable, least of all the picture, which is the entire reason to open this screen.
 */
export function ReviewLayout({
  title,
  summary,
  projects,
  shots,
  viewer,
  accept,
  error,
}: {
  title: string
  summary: ReactNode
  projects: ReactNode
  shots: ReactNode
  viewer: ReactNode
  accept: ReactNode
  error?: ReactNode
}) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const sheetRef = useRef<HTMLElement>(null)

  // Escape closes it, like every other sheet on the platform. A panel that can only be dismissed by
  // finding the one control that opened it is a panel people leave open.
  useEffect(() => {
    if (!sheetOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheetOpen(false)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [sheetOpen])

  // DRAG TO DISMISS, the same gesture the lagoon host's switcher uses. A sheet a thumb can only close
  // by reaching past it to the backdrop is a sheet people leave open, and two sheets in one product
  // that close differently is worse than either.
  const drag = useRef<{ from: number; by: number } | null>(null)
  const onPointerDown = (e: ReactPointerEvent) => {
    drag.current = { from: e.clientY, by: 0 }
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    setDragging(true)
  }
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!drag.current || !sheetRef.current) return
    drag.current.by = Math.max(0, e.clientY - drag.current.from)
    sheetRef.current.style.transform = `translateY(${drag.current.by}px)`
  }
  const endDrag = () => {
    const by = drag.current?.by ?? 0
    drag.current = null
    setDragging(false)
    if (sheetRef.current) sheetRef.current.style.transform = ""
    // A short pull springs back; past a third of the sheet it is a dismissal.
    const h = sheetRef.current?.offsetHeight ?? 0
    if (by > Math.min(120, h / 3)) setSheetOpen(false)
  }

  return (
    <div className={`rv${sheetOpen ? " rv-sheet-open" : ""}${dragging ? " rv-sheet-dragging" : ""}`}>
      {/* THE BAY, from motu's kit — not a second drawing of it.
          This header spelled out the same `linear-gradient(160deg, var(--w-deep), var(--w-mid) 60%,
          var(--w-shallow))` the framework's bay already carried, and missed the crest and the mono
          readout face that go with it. Two pieces of motu chrome a person sees at once — a published
          page and the console that reviews it — read as two products when only one of them has the
          foam. `compact`, because this is a screen's header rather than a page's masthead. */}
      <Bay
        className="rv-head"
        compact
        title={title}
        titleAs="h1"
        leading={
          /* PHONE ONLY. On a wide screen the projects are already on screen, so a control to reveal
             them would be a button that does nothing visible. */
          <button
            type="button"
            className="rv-sheet-toggle"
            aria-expanded={sheetOpen}
            aria-controls="rv-projects"
            onClick={() => setSheetOpen((v) => !v)}
          >
            <span aria-hidden="true">☰</span> Projects
          </button>
        }
      >
        {summary}
      </Bay>

      {error}

      <div className="rv-body">
        <aside className="rv-rail" id="rv-projects" ref={sheetRef} aria-label="Projects">
          <div
            className="rv-grab"
            aria-hidden="true"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <i />
          </div>
          {projects}
        </aside>
        {/* The same island either way: a column beside the viewer on a wide screen, a strip you thumb
            along above it on a phone. It owns the selection in both, so nothing new can claim it. */}
        <nav className="rv-shots" aria-label="Shots">
          {shots}
        </nav>
        <main className="rv-view">
          {viewer}
          {accept}
        </main>
      </div>

      <button
        type="button"
        className="rv-scrim"
        aria-label="Close projects"
        tabIndex={sheetOpen ? 0 : -1}
        onClick={() => setSheetOpen(false)}
      />
    </div>
  )
}
