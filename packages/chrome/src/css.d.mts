// Types for ./css.mjs — motu's chrome as a stylesheet.
export type MotuWaterState = 'mock' | 'http' | 'legacy'

export function motuRootVars(state?: MotuWaterState, scope?: string): string
export function motuWaterCss(): string
export function motuSurfaceCss(): string
export function motuBaseCss(): string
/** Everything a DOCUMENT needs: tokens, reset, water, surfaces and the kit. */
export function motuChromeCss(state?: MotuWaterState): string
/** The same language for a SHADOW ROOT: tokens on `:host`, the `all: initial` guard, no page reset. */
export function motuShadowCss(state?: MotuWaterState, scope?: string): string
/** Install the chrome sheet into `document.head`, once. A no-op without a document. */
export function installMotuChrome(state?: MotuWaterState): void
