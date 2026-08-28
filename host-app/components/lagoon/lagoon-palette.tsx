"use client"
// ⌘K: everything this host holds, one keystroke away.
//
// AN ISLAND, and the region's second producer. It owns whether it is open and what has been typed
// into it — two keys, declared, so the state a person is in is addressable rather than trapped in a
// component. Opening the palette at a query is a URL in the lagoon, which is the whole argument for
// a region owning state that looks private.
//
// EVERY ENTRY IS AN ANCHOR, and the selection is FOCUS. That is not a detail: it means ↵ is the
// browser's own activation rather than a navigation this component performs, so there is no intent to
// declare, no router to reach for, and a screen reader hears a list of links because that is what it
// is. The first version moved a `selected` index and called `location.assign`, which is three
// mechanisms for what focus already does.
import { useCallback, useEffect, useRef, useState } from "react"
import { Kbd } from "@motu/chrome/react"
import { motuSplashFrom } from "@motu/chrome/splash"
import type { LagoonGroup, LagoonRepo } from "@/app/index-region"

/** What a palette entry is. `kind` is the app's own vocabulary, printed on the right of the row. */
type Entry = {
  id: string
  label: string
  kind: "group" | "repo" | "lagoon" | "action"
  href: string
  /** Somebody is serving this one right now. Shown, and ranked ahead of everything else. */
  live?: boolean
}

/**
 * The places on this host that are not a lagoon.
 *
 * `action` is the fourth kind, and the only entries here that are not derived from what the host
 * holds — which is exactly why they belong in a palette: the review console has no row on the front
 * page to find it by, so without this the only way in is knowing the URL.
 */
const ACTIONS: Entry[] = [
  { id: "a:console", label: "Baseline review", kind: "action", href: "/console" },
]

export interface LagoonPaletteProps {
  repos?: LagoonRepo[]
  groups?: LagoonGroup[]
  /** Whether the palette is showing. Region-owned, so a link or a flow can open it. */
  open?: boolean
  /** What has been typed into it. Region-owned for the same reason. */
  query?: string
  onOpenChange?: (open: boolean) => void
  onQueryChange?: (query: string) => void
}

/**
 * A subsequence match, spaces skipped — `tideline.ts`'s own `fuzzy`.
 *
 * Returns where the match STARTS and how far it SPREADS, because both decide the rank: `mr` should
 * beat `motu-review` for "mr" on tightness, and a match at the front should beat one in the middle.
 */
function fuzzy(needle: string, haystack: string): { first: number; spread: number } | null {
  if (!needle) return { first: 0, spread: 0 }
  const hay = haystack.toLowerCase()
  let first = -1
  let last = -1
  let at = 0
  for (const ch of needle.toLowerCase()) {
    if (ch === " ") continue
    const found = hay.indexOf(ch, at)
    if (found < 0) return null
    if (first < 0) first = found
    last = found
    at = found + 1
  }
  return first < 0 ? { first: 0, spread: 0 } : { first, spread: last - first }
}

/** Earlier and tighter wins. `tideline.ts`'s weighting, kept so the two palettes rank alike. */
const score = (m: { first: number; spread: number }) => -(m.first * 3 + m.spread)

function entriesFrom(groups: LagoonGroup[], repos: LagoonRepo[]): Entry[] {
  const out: Entry[] = [...ACTIONS]
  for (const g of groups) out.push({ id: `g:${g.name}`, label: g.name, kind: "group", href: `/g/${g.name}` })
  for (const r of repos) {
    out.push({ id: `r:${r.repo}`, label: r.repo, kind: "repo", href: `/${r.repo}/` })
    // A LAGOON IS ADDRESSABLE TOO, and it is what a person usually means. A repo holding one slug
    // yields one entry that duplicates the repo row; that is the honest listing, and the fuzzy rank
    // separates them the moment the slug is typed.
    for (const slug of r.slugs) {
      out.push({
        id: `l:${r.repo}/${slug}`,
        label: `${r.repo} · ${slug}`,
        kind: "lagoon",
        href: `/${r.repo}/latest/${slug}`,
        live: r.live?.includes(slug) ?? false,
      })
    }
  }
  return out
}

export function LagoonPalette({
  repos,
  groups,
  open = false,
  query = "",
  onOpenChange,
  onQueryChange,
}: LagoonPaletteProps) {
  const box = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLInputElement>(null)
  // Whether the palette has ever been opened, so the entries animate in on each opening rather than
  // once per mount. Presentation, and nobody's business but this component's.
  const [opened, setOpened] = useState(0)

  // ⌘K FROM ANYWHERE, which is the only thing on this page listening outside its own subtree. It is
  // a window listener rather than a host module, so the island's `ambient` claim ("reaches for no
  // host module") stays true — and the escape hatch is the same key that opened it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        onOpenChange?.(!open)
        setOpened((n) => n + 1)
      } else if (event.key === "Escape" && open) {
        onOpenChange?.(false)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onOpenChange])

  // The field takes focus when the palette appears, because a palette you have to click into is a
  // dialog. `opened` is in the deps so re-opening re-focuses.
  useEffect(() => {
    if (open) field.current?.focus()
  }, [open, opened])

  // ↑↓ MOVE FOCUS between the entries. The selection IS the focus, so this is the only key handling
  // the list needs — ↵ is the anchor's own.
  const steer = useCallback((event: React.KeyboardEvent) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
    const rows = Array.from(box.current?.querySelectorAll<HTMLElement>("[data-entry]") ?? [])
    if (!rows.length) return
    event.preventDefault()
    const at = rows.indexOf(document.activeElement as HTMLElement)
    const next = event.key === "ArrowDown" ? at + 1 : at - 1
    rows[(next + rows.length) % rows.length]?.focus()
  }, [])

  if (!open) return null

  const all = entriesFrom(groups ?? [], repos ?? [])
  const needle = (query ?? "").trim()
  const shown = all
    .map((e) => ({ e, m: fuzzy(needle, e.label) }))
    .filter((x): x is { e: Entry; m: { first: number; spread: number } } => x.m !== null)
    // LIVE FIRST, then the fuzzy rank. What somebody is editing right now is what they are most
    // likely reaching for, and it is the entry whose content will differ from the last time they
    // looked — which is the only entry in this list that can surprise them.
    .sort((a, b) => Number(b.e.live ?? false) - Number(a.e.live ?? false) || score(b.m) - score(a.m))
    .map((x) => x.e)

  // NO SILENT CAP. Eight rows fit; more than that and the palette said nothing about the rest, so
  // its opening state listed less than the page it covers and gave no sign of it — a reader saw a
  // repository on the page that the palette had quietly dropped. It says how many it is holding back.
  const CAP = 8
  const visible = shown.slice(0, CAP)
  const hidden = shown.length - visible.length

  return (
    <div className="motu-scrim" onClick={() => onOpenChange?.(false)}>
      {/* `role="dialog"`, and the click that closes it stops here — a click inside a palette is a
          click on the palette, not on the page behind it. */}
      <div
        className="motu-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Go to"
        ref={box}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={steer}
      >
        <input
          ref={field}
          type="text"
          className="motu-palette__field"
          value={query ?? ""}
          onChange={(event) => onQueryChange?.(event.target.value)}
          placeholder="Go to a lagoon, a repository, a group"
          // The same string a sighted reader sees, for the reason the filter's is.
          aria-label="Go to a lagoon, a repository, a group"
        />
        {visible.length ? (
          <ul className="motu-palette__list">
            {visible.map((e, i) => (
              <li key={e.id} style={{ ["--i" as string]: i }}>
                {/* NO LAMP. It carried `pending` for a group or a repo and `ok` for a lagoon —
                    a distinction that renders as one teal dot ten times over, and `pending` is not a
                    state either of those things has in `store.mjs`. The kind column says what each
                    row is, which is the only thing there was to say. */}
                <a className="motu-opt" data-entry href={e.href} onClick={motuSplashFrom}>
                  <span className="motu-grow motu-ellipsis">{e.label}</span>
                  {e.live ? <span className="motu-opt__live motu-breathe">live</span> : null}
                  <span className="motu-opt__kind">{e.kind}</span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="motu-palette__empty">{`Nothing here matches “${needle}”.`}</p>
        )}
        {hidden > 0 && (
          <p className="motu-palette__more">{`${hidden} more — keep typing to narrow it.`}</p>
        )}
        <footer className="motu-palette__foot">
          <Kbd>↑↓</Kbd> move <Kbd>↵</Kbd> open <Kbd>esc</Kbd> close
        </footer>
      </div>
    </div>
  )
}
