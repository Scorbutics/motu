// Types for a package that is deliberately plain ESM.
//
// `@motu/chrome` is .mjs on purpose — Vite and bare node both have to read it, and raw TypeScript
// would close the second door. But `@motu/core` imports it, and an adopting project type-checks
// core's SOURCE (that is what the no-install aliases resolve to), so a package with no declarations
// makes every such project fail with an implicit `any`. Found by the first greenfield project to run
// `tsc` after this package existed.
export interface MotuChromePalette {
  primary: string
  primaryDeep: string
  onPrimary: string
  caution: string
  idle: string
}
export interface MotuWaterRamp {
  deep: string
  mid: string
  shallow: string
  accent: string
}

export const MOTU_CHROME: MotuChromePalette
export const MOTU_WATER: Record<'mock' | 'http' | 'legacy', MotuWaterRamp>
export const MOTU_SURFACE: Record<'page' | 'panel' | 'panelFlat' | 'row' | 'line', string>
export const MOTU_INK: Record<'body' | 'muted' | 'caption' | 'faint', string>
export const MOTU_SHADOW: Record<'panel' | 'bay' | 'chip', string>
export const MOTU_TYPE: Record<'family' | 'mono', string>
export const MOTU_RADIUS: Record<'pill' | 'panel' | 'row', string>
export const MOTU_MOTION: Record<'swimIn' | 'pop', string>

export function motuRootVars(state?: string): string
export function motuWaterCss(): string
export function motuSurfaceCss(): string
export function motuBaseCss(): string
export function motuChromeCss(state?: string): string

export function escapeHtml(s: unknown): string
export function motuBay(opts: { title: string; subtitle?: string; meta?: string; compact?: boolean }): string
export function motuPanel(opts: { caption?: string; rows: string[]; empty?: string }): string
export function motuRow(opts: { href?: string; label: string; sub?: string; trailing?: string }): string
export function motuPill(text: string, state?: string): string
export function motuPage(opts: { title: string; bay: string; body: string; extraCss?: string }): string
