// Types for ./html.mjs — the few server-rendered shapes.
export function escapeHtml(s: unknown): string
/** The page SHELL — the document reset a React consumer wants beside `motuChromeCss()`. */
export const PAGE_SHELL_CSS: string
/** The shell plus the overrides `motuPage`'s server-rendered rows need. */
export const PAGE_CSS: string
export function motuBay(opts: {
  title: string
  subtitle?: string
  meta?: string
  compact?: boolean
  lead?: string
  /** `masthead` is the tall end: deeper gradient, looping sheen, drifting waterline, a heading. */
  shape?: 'masthead' | ''
  /** Inside the title row, before the title — the mark, a back link. Already-escaped markup. */
  leading?: string
  /** The page's real <h1>, under the title row. Masthead only. */
  headline?: string
  /** A sentence under the headline. */
  blurb?: string
  /** `title` is already-escaped markup rather than text. */
  titleRaw?: boolean
}): string
/** motu's mark, as a labelled span with the inlined SVG behind it. */
export function motuMark(): string
/** The page's bounded column. */
export function motuColumn(opts: { body: string; as?: string; stack?: boolean; lift?: boolean }): string
/** A bare list of rows with room for a travelling rail. */
export function motuRailedList(rows: string[]): string
export function motuPanel(opts: { caption?: string; rows: string[]; empty?: string }): string
export function motuRow(opts: {
  href?: string
  label: string
  sub?: string
  trailing?: string
  /** `page` for a row read on its own: two lines, a card, a 21px name. */
  scale?: 'page' | ''
  /** What kind of thing this row is — a tag, not a state. */
  kind?: string
  kindTone?: 'sand' | ''
  /** The lamp. */
  tone?: string
  /** A ratio, 0..100, drawn along the card's bottom edge. */
  fill?: number | null
  /** Staggers the swim-in. */
  index?: number | null
  /** `flat` drops the card, for a long tail read by scanning. */
  surface?: 'card' | 'flat'
  /** Distance from the newest. Fades this row's gauge, so the list carries its own recency. */
  age?: number | null
}): string
export function motuPill(text: string, state?: string): string
export function motuPage(opts: {
  title: string
  bay: string
  body: string
  extraCss?: string
  /** `page` puts `.motu-page` on the <main>; `shell` keeps the centred block every page had before. */
  column?: 'shell' | 'page'
}): string
