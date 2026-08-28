"use client"
// The front page's one control: what to look for, and what to look at.
//
// AN ISLAND, and the only one here that acts. Everything else on this page is host-fed and can only
// leak; this decides two region keys, which is the definition the archipelago's `writes` records.
//
// IT OWNS NO LIST. It never sees `repos` or `groups` — it emits what the reader asked for, and the
// two listing islands narrow themselves. That is the coupling the region exists to declare: one
// island changes what another shows, and neither knows the other exists.
import { useCallback, useLayoutEffect, useRef, useState } from "react"
import { Search, Segmented, Opt } from "@motu/chrome/react"

/** Which kinds the page lists. The app's own vocabulary — a repository holds lagoons, a group spans them. */
export type LagoonShow = "all" | "repos" | "groups"

const SHOWS: Array<{ id: LagoonShow; label: string }> = [
  { id: "all", label: "All" },
  { id: "repos", label: "Repositories" },
  { id: "groups", label: "Groups" },
]

export interface LagoonFilterProps {
  query?: string
  show?: LagoonShow
  onQueryChange?: (query: string) => void
  onShowChange?: (show: LagoonShow) => void
}

export function LagoonFilter({ query = "", show = "all", onQueryChange, onShowChange }: LagoonFilterProps) {
  // WHERE THE LIT THUMB SITS. The kit paints it and refuses to measure — only the caller knows which
  // option is current and how wide its label rendered, and a kit that grew a ref per consumer would
  // be a framework. `useLayoutEffect` rather than `useEffect` so the thumb is placed in the same
  // frame the buttons are, instead of visibly sliding in from zero on first paint.
  //
  // The ref is on the SHELF rather than on `Segmented`: forwarding one would be a React 19 prop and a
  // React 18 `forwardRef`, two shapes in a kit whose peer range is `>=18`, and the query below does
  // not care which element it starts from.
  const bar = useRef<HTMLDivElement>(null)
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null)
  useLayoutEffect(() => {
    const el = bar.current?.querySelector<HTMLElement>('[aria-current="true"]')
    if (!el || !bar.current) return
    setThumb({ left: el.offsetLeft, width: el.offsetWidth })
  }, [show])

  // Same guard as the listing islands: a region key holding null is a cleared key, and React turns a
  // null `value` into an UNCONTROLLED input — the field would keep whatever was typed while the
  // region says it is empty, which is the two-sources-of-truth bug this control exists to avoid.
  const type = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => onQueryChange?.(event.target.value),
    [onQueryChange],
  )

  return (
    <>
      {/* THE HINT NAMES WHAT THIS BOX DOES, and it used to name what it did not. `↑↓ move · ↵ open`
          sat here while neither key did anything from the field: ↑↓ is handled by the LIST, once
          focus is already in one, and the palette's identical-looking footer was the only one of the
          two that was true. A fresh reader found it by pressing the keys the screen told them to.

          ⌘K is the one keystroke this box can honestly promise from where it stands. */}
      <Search hint="⌘K to jump">
        <input
          type="search"
          value={query ?? ""}
          onChange={type}
          placeholder="Filter lagoons, repositories, groups"
          // THE SAME STRING, deliberately. It was "…repositories and groups" here and
          // "…repositories, groups" on screen: a screen-reader user and a sighted user were told
          // slightly different sentences about one field, which is a difference nobody can see.
          aria-label="Filter lagoons, repositories, groups"
        />
      </Search>
      <div className="motu-shelf" ref={bar}>
        <span className="motu-shelf__label">Show</span>
        <Segmented thumbLeft={thumb?.left} thumbWidth={thumb?.width} aria-label="Show">
          {SHOWS.map((s) => (
            <Opt key={s.id} current={s.id === show} onClick={() => onShowChange?.(s.id)}>
              {s.label}
            </Opt>
          ))}
        </Segmented>
      </div>
    </>
  )
}
