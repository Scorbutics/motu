// `motu island verify <name>` — the deterministic gate that turns the README's island rules into
// machine-checkable pass/fail, so an agent can close the loop without a human eyeballing the host.
//
//   static  (AST over the component): no bare fetch, no history/pushState, no document reach-out into
//           the host, all server I/O via @motujs/contract, renders from default props alone.
//   config  (AST over the registry):  registered with a REQUIRED legacy-fit strategy; archipelago
//           membership (warn if standalone).
//   runtime (lagoon):                 boots the focused lagoon and asserts the island renders a
//           non-empty shadow DOM in both native and legacy fit. Default: a REAL browser (Playwright/
//           Chromium) so layout/CSS/paint are exercised; `--fast` uses an in-process happy-dom mount.
//
// The checks live in ./verify/, one module per concern; this file is the public surface.

export { setProgressScope, setVerbose, profiledMs, step, verifyExitCode, sweepExitCode, summaryOf, printSweep } from './verify/report.mjs';
export { reportReachDrift, operationReachCheck } from './verify/reach.mjs';
export { readScenarios } from './verify/island-runtime.mjs';
export { verifyCommand, runIslandVerify } from './verify/island.mjs';
export { archipelagoVerifyCommand, runArchipelagoVerify } from './verify/region.mjs';
