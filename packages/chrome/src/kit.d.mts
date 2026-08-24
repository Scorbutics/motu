// Types for ./kit.mjs — the UI kit's stylesheet.
/** A CSS selector the kit's custom properties are declared on: `:root` for a document, `:host` for a shadow root. */
export type MotuKitScope = string

export function motuKitVars(scope?: MotuKitScope): string
export function motuKitShadowReset(scope?: MotuKitScope): string
/** Every shape in the kit, with its tokens declared on `scope`. */
export function motuKitCss(scope?: MotuKitScope): string
