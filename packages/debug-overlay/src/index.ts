// The motu debug overlay: a dev-only, read-only lens that makes island seams visible on the running
// page. It is driven entirely by data the framework already holds (the island definition registry,
// the mount registry, the shared store, and the transport call log) — no per-island instrumentation.
// The whole tree is gated by the __MOTU_DEBUG__ build constant at each composition root, so it
// dead-code-eliminates out of a production bundle.

export { mountDebugOverlay, toggleDebugOverlay, isDebugOverlayOpen, subscribeDebugOverlay } from './overlay';
export type { DebugOverlayOptions } from './overlay';
export { mountFindings, currentFindings, currentSheet, currentSeams, currentIslands, currentCoupling, watchSeams } from './findings-view';
export { findingsOf, tallyOf } from './findings';
export type { Finding, FindingSeam } from './findings';
