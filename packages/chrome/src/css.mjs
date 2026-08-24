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
import { motuKitCss } from './kit.mjs';

/**
 * The custom properties every other rule reads. Emitted as real properties rather than substituted
 * values so a page can be re-themed at runtime exactly as `applyMotuChrome` re-themes a lagoon.
 *
 * `scope` is where they land. A document declares them on `:root`; the seam lens declares them on the
 * `:host` of its closed shadow root, because nothing outside that root reaches in — including these.
 * It is the ONLY difference between painting a page and painting an overlay, which is why it is an
 * argument here rather than a second copy of this function inside the overlay.
 */
export function motuRootVars(state = 'mock', scope = ':root') {
  const water = MOTU_WATER[state] ?? MOTU_WATER.mock;
  return `${scope} {
  --motu-primary: ${MOTU_WATER.mock.accent};
  --motu-primary-deep: #0b5b55;
  --motu-on-primary: #fff;
  /* DERIVED, not fixed — the same shape the tide line already used.
     applyMotuChrome rebuilds the ramp around a host's own primary (peps is gold), and the dock
     followed while everything painted from these tokens stayed motu teal: the same four variable
     names defined two ways in one package, one adaptive and one not. The literals stay as the
     fallback, so a page that never sets a palette is unchanged. */
  --w-deep: var(--motu-water-deep, ${water.deep});
  --w-mid: var(--motu-water-mid, ${water.mid});
  --w-shallow: var(--motu-water-shallow, ${water.shallow});
  --tide-accent: var(--motu-primary, ${water.accent});
  --ink: ${MOTU_INK.body};
  --ink-muted: ${MOTU_INK.muted};
  --ink-caption: ${MOTU_INK.caption};
  /* THE SURFACES ARE THE PRIMARY TOO, at low intensity — these tokens say so themselves: the page is
     "the palest shallow water" and the line is "teal-tinted, never neutral grey". They were literals,
     so feeding a host's gold repainted the water and left the ground it sat on teal. Derived like the
     ramp, with the same literals as fallbacks.
     surface-row is deliberately NOT derived: it is translucent white, and white has no hue. */
  --surface-page: var(--motu-surface-page, ${MOTU_SURFACE.page});
  --surface-row: ${MOTU_SURFACE.row};
  --surface-panel: var(--motu-surface-panel, ${MOTU_SURFACE.panel});
  --line: var(--motu-line, ${MOTU_SURFACE.line});
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
  background: var(--surface-panel, ${MOTU_SURFACE.panel});
  border-radius: ${MOTU_RADIUS.panel};
  box-shadow: ${MOTU_SHADOW.panel};
  backdrop-filter: blur(14px) saturate(1.35);
  -webkit-backdrop-filter: blur(14px) saturate(1.35);
}
/* THE CAP, THE ROW, THE LIST AND THE PILL MOVED TO ./kit.mjs.
   They were declared here AND there, and the kit's copies won on order alone: four shapes with two
   definitions each, inside the one package whose whole job is to stop exactly that. The kit owns them
   now, and the server's markup (./html.mjs) emits the attributes the kit reads.
   What stays is the sheen's reduced-motion answer, which belongs to the bay above it. */
@media (prefers-reduced-motion: reduce) {
  .motu-bay .sheen { animation: none; display: none; }
}
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

/**
 * Everything, in the order a stylesheet wants it.
 *
 * The KIT is in here too, so a page that installs motu's chrome gets the SHAPES and not only the
 * palette. That was the gap: the review console installed this sheet and then re-drew the bay, the
 * pill and the empty state by hand, because the vocabulary it needed was not in what it installed.
 */
export function motuChromeCss(state = 'mock') {
  return [motuRootVars(state), motuBaseCss(), motuWaterCss(), motuSurfaceCss(), motuKitCss()].join('\n');
}

/**
 * The same language, for a SHADOW ROOT.
 *
 * The seam lens draws a fixed layer over somebody else's page from inside a closed shadow root, so it
 * needs the tokens on `:host`, the `all: initial` guard, and none of `motuBaseCss` — there is no
 * document to reset here, and styling `html, body` from inside a shadow root does nothing at all.
 */
export function motuShadowCss(state = 'mock', scope = ':host') {
  return [motuRootVars(state, scope), motuKitCss(scope)].join('\n');
}

/**
 * Put motu's chrome into the document, once.
 *
 * Idempotent, because the surfaces that need it have more than one entry: the review console calls it
 * from the application root AND from the lagoon's `setup`, and a palette that arrives in only one is
 * exactly the drift this package exists to remove, one level down.
 *
 * FIRST in the head, so an application's own stylesheet still wins where it means to override — the
 * framework supplies the vocabulary, the app decides what to do with it.
 *
 * Lives here rather than beside the React components because it emits DOM, not JSX, and because
 * `src/react/` is the one compiled corner of an otherwise as-authored package: a relative import
 * reaching out of it would resolve from `dist/react/` at runtime, where the rest of this is not.
 */
export function installMotuChrome(state = 'mock') {
  if (typeof document === 'undefined' || document.getElementById('motu-chrome')) return;
  const style = document.createElement('style');
  style.id = 'motu-chrome';
  style.textContent = motuChromeCss(state);
  document.head.prepend(style);
}
