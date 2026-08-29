export interface DetectedPrimary {
  /** The colour to hand `applyMotuChrome`, already clamped into the band the ramp was built around. */
  primary: string
  /** A foreground that reaches 4.5:1 on it. */
  onPrimary: string
  /** True when the lagoon is genuinely greyscale, so the primary is a neutral by decision. */
  neutral: boolean
  /** What the pixels actually said, before normalisation. */
  raw: string
  /** Share of opaque pixels that carried colour -- 0 on a greyscale artifact. */
  chromaticFraction: number
}

export interface DominantPrimary {
  hex: string
  neutral: boolean
  chromaticFraction: number
  opaque: number
}

export function hexOf(r: number, g: number, b: number): string
export function parseHex(hex: string): [number, number, number] | null
export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number }
export function hslToRgb(h: number, s: number, l: number): [number, number, number]
export function relativeLuminance(r: number, g: number, b: number): number
export function contrastRatio(a: [number, number, number], b: [number, number, number]): number
export function dominantPrimary(data: ArrayLike<number>, opts?: Record<string, number>): DominantPrimary | null
export function normalisePrimary(hex: string, opts?: Record<string, unknown>): { primary: string; onPrimary: string; neutral: boolean } | null
export function primaryVars(primary: string, onPrimary?: string): Record<string, string>
export const PRIMARY_VAR_NAMES: string[]
export function rasteriseDocument(doc: Document, opts?: Record<string, number>): Promise<ImageData | null>
export function detectPrimary(doc: Document, opts?: Record<string, unknown>): Promise<DetectedPrimary | null>
export function detectPrimarySettled(doc: Document, opts?: Record<string, unknown>): Promise<DetectedPrimary | null>
export function primaryDetectSource(parts: Record<string, Function>): string
export const PRIMARY_DETECT_JS: string
