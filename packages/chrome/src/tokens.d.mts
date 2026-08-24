// Types for a package that is deliberately plain ESM. See ./index.d.ts for why.
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
/** The four verdicts. Semantic, never derived from the brand primary — see the token's own comment. */
export interface MotuVerdictPalette {
  ok: string
  warn: string
  broken: string
  neutral: string
}
/** One colour per kind of thing crossing an island's boundary. */
export interface MotuSeamPalette {
  input: string
  output: string
  requests: string
  coupling: string
  region: string
}

export const MOTU_CHROME: MotuChromePalette
export const MOTU_WATER: Record<'mock' | 'http' | 'legacy', MotuWaterRamp>
export const MOTU_SURFACE: Record<'page' | 'panel' | 'panelFlat' | 'row' | 'line', string>
export const MOTU_INK: Record<'body' | 'muted' | 'caption' | 'faint', string>
export const MOTU_SHADOW: Record<'panel' | 'bay' | 'chip', string>
export const MOTU_TYPE: Record<'family' | 'mono', string>
export const MOTU_RADIUS: Record<'pill' | 'panel' | 'row', string>
export const MOTU_MOTION: Record<'swimIn' | 'pop', string>
export const MOTU_VERDICT: MotuVerdictPalette
export const MOTU_SEAM: MotuSeamPalette
export const MOTU_VERDICT_ON_BAY: Record<'ok' | 'warn' | 'neutral', string>
