// Types for ./splash.mjs — the one piece of behaviour in this package.
/** Throw a splash at a point in the viewport. A no-op under `prefers-reduced-motion`. */
export function motuSplash(x: number, y: number, color?: string): void
/** The same, from a pointer event. */
export function motuSplashFrom(event: { clientX: number; clientY: number }, color?: string): void
