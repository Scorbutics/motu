// Types for a package that is deliberately plain ESM.
//
// `@motu/chrome` is .mjs on purpose — Vite and bare node both have to read it, and raw TypeScript
// would close the second door. But `@motu/core` imports it, and an adopting project type-checks
// core's SOURCE (that is what the no-install aliases resolve to), so a package with no declarations
// makes every such project fail with an implicit `any`. Found by the first greenfield project to run
// `tsc` after this package existed.
//
// ONE DECLARATION FILE PER MODULE, re-exported here. They used to all live in this file, which meant
// `./css.mjs` and `./tokens.mjs` were typed only when imported through the package ROOT: a relative
// import between two files INSIDE the package (which `./react/` needs) resolved to a .mjs with no
// adjacent declarations and came back `any`.
//
// The React kit is NOT re-exported here. It lives behind `@motu/chrome/react`, is compiled to
// `dist/react`, and must stay invisible to the bare-node consumers this file exists for.
export * from './tokens.mjs'
export * from './css.mjs'
export * from './html.mjs'
export * from './kit.mjs'

/**
 * The page shell's own CSS — the centred column and the server-row shape.
 *
 * Declared here because the barrel already re-exports `html.mjs` at runtime; this file is
 * hand-written, so a new export is only visible to tsc once it is named. The lagoon host's Next app
 * inlines this beside `motuChromeCss()` to render the same page shell `motuPage` produces.
 */
export const PAGE_CSS: string;

/**
 * The centred column alone, with none of the server-row overrides `PAGE_CSS` also carries.
 *
 * What a React consumer wants beside `motuChromeCss()`: the kit styles its own components, and the
 * server-shape rules in PAGE_CSS actively fight it — captions clipped off the panel's left edge.
 */
export const PAGE_SHELL_CSS: string;
