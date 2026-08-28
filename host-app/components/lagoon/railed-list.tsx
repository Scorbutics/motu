"use client"
// A list with a lit rail that TRAVELS to whichever row the cursor or the keyboard is on.
//
// A HOST COMPONENT, not an island, and the distinction is the one motu's own rule draws: an island is
// what the region SHOWS or ACTS ON. The rail shows nothing — it points at a row that is already
// rendered — and it acts on nothing: no region key moves when it slides, and the page is identical
// with it removed. What it owns is a measurement of the DOM, which is presentation.
//
// THE KIT DOES NOT MEASURE. `Rail` takes a top and a height and paints; the measuring lives here,
// because a kit that grew a ref and a resize observer for every consumer would be a framework, and
// both of motu's React surfaces already have one.
import { useCallback, useState, type ReactNode, type SyntheticEvent } from "react"
import { Railed, Rail, List } from "@motu/chrome/react"

/** Where the rail is, or null for "nowhere" — which is how it parks rather than sitting on row one. */
type At = { top: number; height: number } | null

export function RailedList({ children }: { children?: ReactNode }) {
  const [at, setAt] = useState<At>(null)

  // ONE HANDLER ON THE CONTAINER, not one per row. The rows are rendered by whoever calls this — the
  // repositories island, the groups island — so wiring each of them would mean every caller knowing
  // about the rail. Delegation keeps the rail's existence a fact about this component alone.
  //
  // `closest('li')` rather than the event target: the pointer lands on a name, a pill or a gauge, and
  // the row is the thing being pointed AT. Measured relative to the container, since the rail is
  // absolutely positioned inside it and the page scrolls underneath both.
  //
  // `currentTarget` IS the container, which is why there is no ref here. A ref would have meant
  // `Railed` forwarding one, and a forwarded ref is a React 19 prop and a React 18 `forwardRef` —
  // two shapes for a kit whose peer range is `>=18`, bought for a measurement the event already has.
  const aim = useCallback((event: SyntheticEvent<HTMLDivElement>) => {
    const el = event.target instanceof Element ? event.target.closest("li") : null
    if (!el) return
    const row = el.getBoundingClientRect()
    const outer = event.currentTarget.getBoundingClientRect()
    setAt({ top: row.top - outer.top, height: row.height })
  }, [])

  const park = useCallback(() => setAt(null), [])

  return (
    // `onFocus`/`onBlur` rather than the capture-phase pair: React's synthetic focus events already
    // bubble, which is exactly what a keyboard user needs here and what the native ones do not do.
    <Railed onMouseOver={aim} onFocus={aim} onMouseLeave={park} onBlur={park}>
      <Rail top={at?.top} height={at?.height} />
      <List>{children}</List>
    </Railed>
  )
}
