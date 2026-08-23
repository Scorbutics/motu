// motu's chrome, as a stylesheet a server can inline.
//
// The lagoon's own chrome is built by DOM code in `@motu/react` (the tide line) and `@motu/debug-overlay`
// (the lens), because both are interactive and live inside a bundled app. A page rendered by the host
// has no bundler and no React, so what it can share is not a component tree but the LANGUAGE: the same
// tokens, the same water, the same capsule, the same warm captions, the same swim-in.
//
// Everything here derives from ./tokens.mjs. Nothing in this file may hardcode a colour — a literal
// here is the beginning of the second palette this package exists to prevent.
import { MOTU_CHROME, MOTU_WATER, MOTU_SURFACE, MOTU_INK, MOTU_SHADOW, MOTU_TYPE, MOTU_RADIUS, MOTU_MOTION } from './tokens.mjs';

/**
 * The custom properties every other rule reads. Emitted as real properties rather than substituted
 * values so a page can be re-themed at runtime exactly as `applyMotuChrome` re-themes a lagoon.
 */
export function motuRootVars(state = 'mock') {
  const water = MOTU_WATER[state] ?? MOTU_WATER.mock;
  return `:root {
  --motu-primary: ${MOTU_WATER.mock.accent};
  --motu-primary-deep: #0b5b55;
  --motu-on-primary: #fff;
  --w-deep: ${water.deep};
  --w-mid: ${water.mid};
  --w-shallow: ${water.shallow};
  --tide-accent: ${water.accent};
  --ink: ${MOTU_INK.body};
  --ink-muted: ${MOTU_INK.muted};
  --ink-caption: ${MOTU_INK.caption};
  --surface-page: ${MOTU_SURFACE.page};
  --surface-row: ${MOTU_SURFACE.row};
  --line: ${MOTU_SURFACE.line};
}`;
}

/**
 * The water band: a deep→shallow ramp with a crest, the same readout the bay carries.
 *
 * The crest is a CSS-only wave (two offset radial gradients) rather than an SVG asset, because the
 * host inlines everything it serves and an asset would be one more thing that can fail to inline —
 * the failure mode `publish` already refuses.
 */
export function motuWaterCss() {
  return `
.motu-bay {
  position: relative;
  overflow: hidden;
  padding: 22px 26px;
  background: linear-gradient(160deg, var(--w-deep), var(--w-mid) 55%, var(--w-shallow));
  color: ${MOTU_CHROME.onPrimary};
  box-shadow: ${MOTU_SHADOW.bay};
}
/* The crest: foam catching light where the shallows meet the panel below. */
.motu-bay::after {
  content: "";
  position: absolute;
  left: -10%;
  right: -10%;
  bottom: -14px;
  height: 28px;
  background:
    radial-gradient(60% 100% at 20% 0%, rgba(255,255,255,.30), transparent 70%),
    radial-gradient(50% 100% at 62% 0%, rgba(255,255,255,.22), transparent 70%),
    radial-gradient(70% 100% at 92% 0%, rgba(255,255,255,.26), transparent 70%);
  border-radius: 50%;
  pointer-events: none;
}
/* The bay's internals. These lived in motuPage's private CSS, so the composed lagoon — which builds
   its own document and only pulls in this stylesheet — rendered a bay with no padding and a clipped
   title. A component's layout travels with the component. */
.motu-bay.compact { padding: 14px 18px; }
.motu-bay .bay-inner {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
/* THE SAME READOUT THE DOCK USES. The tide line's label is mono at .04em and the bay was bold sans, so
   the two pieces of motu chrome a person sees at once — a dock over a page, a bay above it — read as
   two different products. A bay is a readout too: what this is, and how much of it there is. */
.motu-bay .bay-title strong {
  font: 650 16px/1.2 ${MOTU_TYPE.mono};
  letter-spacing: .02em;
}
.motu-bay.compact .bay-title strong { font-size: 13.5px; }
.motu-bay .bay-title span {
  margin-left: 10px; opacity: .82;
  font: 500 11.5px/1 ${MOTU_TYPE.mono};
  letter-spacing: .04em;
}
/* Anything the bay carries ABOVE its title row — a sheet's drag handle, say. It rides on the water
   rather than on a light strip above it, which is what made a sheet look like two headers. */
.motu-bay .bay-lead { position: relative; z-index: 1; }
/* On the SHALLOW end of the ramp the water is light, so the readout needs more than the .78 a deep
   ground would carry. */
.motu-bay .bay-meta { color: rgba(255,255,255,.92); text-shadow: 0 1px 2px rgba(11,111,104,.35); }

/* A sheen sweeping the water — what it does when something actually changed. Motion only; a page
   that never changes never animates it. */
.motu-bay .sheen {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(100deg, transparent 35%, rgba(255,255,255,.28) 50%, transparent 65%);
  transform: translateX(-100%);
  animation: motu-sheen 4.2s ease-in-out .6s 1;
}
@keyframes motu-sheen { to { transform: translateX(100%); } }
`;
}

/** Panels, rows, pills, captions — the vocabulary the tide line's own panel uses. */
export function motuSurfaceCss() {
  return `
.motu-panel {
  background: ${MOTU_SURFACE.panel};
  border-radius: ${MOTU_RADIUS.panel};
  box-shadow: ${MOTU_SHADOW.panel};
  backdrop-filter: blur(14px) saturate(1.35);
  -webkit-backdrop-filter: blur(14px) saturate(1.35);
}
.motu-cap {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: .09em;
  color: var(--ink-caption);
}
.motu-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 9px 12px;
  border-radius: ${MOTU_RADIUS.row};
  background: var(--surface-row);
  border: 1px solid ${MOTU_SURFACE.line};
  color: var(--ink);
  text-decoration: none;
}
.motu-row:hover { border-color: var(--tide-accent); }
.motu-row .grow { flex: 1; min-width: 0; }
.motu-row small { color: var(--ink-muted); font-size: 11.5px; font-weight: 500; }
/* Rows swim in from the edge, staggered, so a list assembles rather than appearing. */
.motu-list { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0; list-style: none; }
.motu-list > * { animation: motu-swim ${MOTU_MOTION.swimIn} both; }
@keyframes motu-swim { from { opacity: 0; transform: translateX(-8px); } }
@media (prefers-reduced-motion: reduce) {
  .motu-list > *, .motu-bay .sheen { animation: none; }
  .motu-bay .sheen { display: none; }
}
.motu-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 5px 11px;
  border: 0;
  border-radius: ${MOTU_RADIUS.pill};
  background: ${MOTU_CHROME.primary};
  color: ${MOTU_CHROME.onPrimary};
  font: 600 11px/1 ${MOTU_TYPE.family};
  cursor: pointer;
}
.motu-pill[data-state="idle"] { background: rgba(255,255,255,.22); }
.motu-pill[data-state="caution"] { background: ${MOTU_CHROME.caution}; }
code, .motu-mono { font-family: ${MOTU_TYPE.mono}; font-size: 11.5px; }
a { color: ${MOTU_CHROME.primaryDeep}; text-decoration: none; }
a:hover { text-decoration: underline; }
`;
}

/** Page reset + type. Kept minimal: the host's pages are documents, not an application. */
export function motuBaseCss() {
  return `
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body {
  background: var(--surface-page);
  color: var(--ink);
  font: 500 13px/1.55 ${MOTU_TYPE.family};
  -webkit-font-smoothing: antialiased;
}
`;
}

/** Everything, in the order a stylesheet wants it. */
export function motuChromeCss(state = 'mock') {
  return [motuRootVars(state), motuBaseCss(), motuWaterCss(), motuSurfaceCss()].join('\n');
}
