// Types for ./html.mjs — the few server-rendered shapes.
export function escapeHtml(s: unknown): string
/** The page SHELL — the document reset a React consumer wants beside `motuChromeCss()`. */
export const PAGE_SHELL_CSS: string
/** The shell plus the overrides `motuPage`'s server-rendered rows need. */
export const PAGE_CSS: string
export function motuBay(opts: { title: string; subtitle?: string; meta?: string; compact?: boolean }): string
export function motuPanel(opts: { caption?: string; rows: string[]; empty?: string }): string
export function motuRow(opts: { href?: string; label: string; sub?: string; trailing?: string }): string
export function motuPill(text: string, state?: string): string
export function motuPage(opts: { title: string; bay: string; body: string; extraCss?: string }): string
