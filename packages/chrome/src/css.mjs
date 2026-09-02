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
     applyMotuChrome rebuilds the ramp around a host's own primary (acme is gold), and the dock
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
/**
 * One wave tile, as an inlined SVG background.
 *
 * encodeURIComponent rather than a hand-escaped string: a data URI with a raw # in it truncates at
 * that character and the rule silently paints NOTHING — the class of failure that survives review.
 * Passing the fill through means a layer can be a token, including var(--surface-page), so the front
 * wave is whatever the page's ground actually is.
 */
function wave(path, fill) {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 90" preserveAspectRatio="none">' +
    '<path d="' + path + '" fill="' + fill + '"/></svg>';
  return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
}

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
/* IT WRAPS. .bay-inner has wrapped since it was written, so the meta block moves to its own line
   when the title crowds it — but the meta itself was a nowrap flex row, so once it held more than a
   readout (a link, an account badge) it simply ran off the side. And the bay CLIPS: overflow:
   hidden is what keeps the crest inside it, so the overflow was not even scrollable. Two links and
   an identity, silently gone on a phone. */
.motu-bay .bay-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 10px 18px; }

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

/* ------------------------------------------------------------------------------------------------
   THE MASTHEAD: the same bay, given the height to be a page's opening rather than a screen's header.

   compact and masthead are the two ends of ONE component, not two components. Everything below only
   ADDS to .motu-bay — the gradient is the same ramp reaching one stop further into the icon's own
   blue, the foam is literally the crest above with a longer body and a loop, and the title row is
   untouched. A separate .motu-masthead would have been a second bay to keep in step, which is the
   drift this package exists to stop.
*/
/* A COMPACT MASTHEAD. The composed view's rail is headed by a band 16px tall — far too short for a
   waterline, and still the place a person first sees which gallery they are in, so it takes the
   deeper ramp and its light and leaves the waves to the pages that have room. The waves are omitted
   in the MARKUP (motuBay, Bay) rather than hidden here: an element that paints nothing is a thing to
   explain later. */
.motu-bay.compact[data-shape="masthead"] { padding: 16px 18px; }

.motu-bay[data-shape="masthead"], .motu-shore {
  /* The ramp, extended: the icon's deep blue at the top corner, through the bay's own two stops. 140
     degrees rather than 160 so the blue end sits behind the mark. */
  background: linear-gradient(140deg, ${MOTU_WATER.mock.abyss} 0%, var(--w-deep) 58%, var(--w-mid) 100%);
  color: ${MOTU_CHROME.onPrimary};
  border-radius: 0;
}
.motu-bay[data-shape="masthead"] { padding: 22px 40px 74px; }
/* THE CREST, REUSED AS FOAM. The same three radial gradients as .motu-bay::after — it is already the
   right shape — moved up above the waves and given a slow breath, because a masthead stays on screen
   long enough for a motionless highlight to read as a rendering artefact. */
.motu-bay.compact[data-shape="masthead"]::after { bottom: -10px; height: 20px; }
.motu-bay[data-shape="masthead"]::after, .motu-shore::after {
  bottom: 48px;
  height: 30px;
  /* HALF THE CREST'S STRENGTH. On a screen header the crest sits AT the panel edge, where a hard
     highlight is the point; here it floats in open water above the waves, and at full opacity its
     ellipse read as a horizontal stripe across the whole band rather than as light on water. */
  opacity: .5;
  animation: motu-foam 7s ease-in-out infinite;
}
/* The opacities here are the SOFTENED ones, not the crest's: a keyframe setting opacity: 1 would
   silently undo the rule above for all but one instant of every cycle. */
@keyframes motu-foam {
  0%, 100% { transform: translateY(0) scaleX(1); opacity: .5; }
  50% { transform: translateY(-3px) scaleX(1.04); opacity: .34; }
}
/* The sheen LOOPS here rather than sweeping once. On a screen header one sweep says "this changed";
   on a masthead nothing changed, and the light is only the water being water. */
.motu-bay[data-shape="masthead"] .sheen, .motu-shore .sheen {
  background: linear-gradient(100deg, transparent 35%, rgba(255,255,255,.26) 50%, transparent 65%);
  animation: motu-sheen-loop 11s ease-in-out .6s infinite;
}
/* Most of the 11s is the REST. A sweep every 11 seconds reads as weather; a sweep that TAKES 11
   seconds reads as a progress bar. */
@keyframes motu-sheen-loop {
  0% { transform: translateX(-100%); }
  32%, 100% { transform: translateX(100%); }
}

/* THE WATERLINE. Two wave layers drifting at different speeds, which is the whole trick: one wave is
   a decoration, two at different speeds is parallax and reads as depth.

   CSS BACKGROUNDS, NOT SVG ELEMENTS, for the same reason the crest above is a gradient — the host
   inlines everything it serves, and a wave that lives in the stylesheet cannot fail to inline. Each
   tile starts and ends at the same y, so repeat-x is seamless and the drift is one tile of
   background-position-x: no transform, no doubled markup, no 200%-wide element to overflow. */
.motu-bay__waves {
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 78px;
  overflow: hidden;
  pointer-events: none;
}
.motu-bay__waves::before, .motu-bay__waves::after {
  content: "";
  position: absolute;
  inset: 0;
  background-repeat: repeat-x;
  background-position: 0 bottom;
  background-size: 600px 100%;
}
/* BACK: the icon's foam blue, translucent, slower. */
.motu-bay__waves::before {
  background-image: ${wave('M0 46 C 180 12, 300 76, 480 52 C 660 28, 780 78, 960 56 C 1100 40, 1150 52, 1200 46 L1200 90 L0 90 Z', 'rgba(92,192,232,.30)')};
  animation: motu-drift 26s linear infinite;
}
/* FRONT: the page's own ground, which is what makes the band END rather than fade — the waves are the
   masthead's bottom edge, not a picture of one.

   THE LITERAL, NOT var(--surface-page), and this is not a style choice. An SVG inside a data URI is
   an ISOLATED DOCUMENT: it has no access to the custom properties of the page embedding it, so the
   variable resolved to nothing and the fill fell back to black — a black waterline across the whole
   masthead, which is what the first render of this shipped. The consequence is real and worth stating:
   a host that re-themes --surface-page gets a stripe of motu's ground here, and closing that would
   mean an inline <svg> element and the doubled markup this shape exists to avoid. */
.motu-bay__waves::after {
  background-image: ${wave('M0 62 C 200 34, 320 84, 520 66 C 720 48, 840 88, 1020 70 C 1120 61, 1160 66, 1200 62 L1200 90 L0 90 Z', MOTU_SURFACE.page)};
  animation: motu-drift 17s linear infinite;
}
@keyframes motu-drift { to { background-position-x: -600px; } }

/* The masthead's own headline block, below the title row. THIS is the page's h1; the bay's title
   stays the product mark beside it. */
/* ------------------------------------------------------------------------------------------------
   THE SHORE: the masthead's water, given the whole viewport.

   For the screens that ARE one thing — signing in, an error, a refusal — where a card floating on a
   pale ground reads as a page that failed to load its own design. Every rule above that paints the
   masthead names this too, so there is one gradient, one sheen, one foam and one waterline; what is
   different here is only the SHAPE of the container, which is the part that genuinely differs.
*/
/* FULL BLEED, and it has to say so. PAGE_SHELL_CSS styles a bare <main> as a centred 940px column
   — the shell's own column — so the water was a 940px stripe with pale ground either side, which is
   the second time that rule has boxed something that is not a column. main.motu-page says the same
   thing for the same reason, two rules up. */
main.motu-shore { max-width: none; margin: 0; }

.motu-shore {
  position: relative;
  overflow: hidden;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  /* The content sits ABOVE centre. Dead centre puts a small card at the optical middle of a tall
     screen, which reads as adrift; a little high reads as placed. */
  justify-content: center;
  align-items: center;
  gap: 22px;
  padding: 40px 20px 120px;
  text-align: center;
}
/* The mark and the wordmark, over the water. */
.motu-shore__mark { display: flex; align-items: center; gap: 12px; position: relative; z-index: 1; }
.motu-shore__mark > strong {
  font: 700 20px/1 ${MOTU_TYPE.family};
  letter-spacing: -.02em;
}
/* CONTENT ABOVE THE WATER. :not() on the two painted layers, because they are absolutely
   positioned and a blanket > * turned them into flex items in normal flow — the waterline stopped
   being the page's bottom edge and became an empty 78px box in the middle of the stack, which
   renders as nothing at all. */
.motu-shore > *:not(.sheen):not(.motu-bay__waves) { position: relative; z-index: 1; }
/* WHAT SITS ON THE WATER. Opaque white and lifted, because the ground behind it is the deepest
   surface this product has — a translucent panel on it reads as a smudge rather than as a sheet. */
.motu-shore__sheet {
  width: min(26rem, 100%);
  background: ${MOTU_SURFACE.card};
  border-radius: ${MOTU_RADIUS.panel};
  box-shadow: 0 24px 60px rgba(4, 33, 29, .28);
  color: var(--ink);
  text-align: left;
}
@media (max-width: 720px) {
  .motu-shore { padding: 28px 16px 110px; gap: 18px; }
}

/* THE BRAND ROW. A masthead's title row carries a 30px mark, so it centres rather than sitting on a
   baseline — the compact bay has no mark and stays as it was. And the mark IS the product name here,
   so the title reads as a wordmark (sans, tight) rather than as the mono readout a screen header
   makes of it. */
.motu-bay[data-shape="masthead"] .bay-inner,
.motu-bay[data-shape="masthead"] .bay-title { align-items: center; }
.motu-bay[data-shape="masthead"]:not(.compact) .bay-title .bay-name {
  font: 700 20px/1 ${MOTU_TYPE.family};
  letter-spacing: -.02em;
}
.motu-bay[data-shape="masthead"] .bay-title span { font-size: 12px; }
/* The readout at masthead scale: further apart, and quiet enough that the headline below it is what
   the eye lands on. */
.motu-bay[data-shape="masthead"] .bay-meta {
  color: rgba(242, 251, 250, .78);
  text-shadow: none;
}
/* NARROW: the meta stops pretending to be hard-right. There is no right to be hard against once it
   has wrapped under the title, and a wrapped row that still tries to end-align reads as ragged. */
@media (max-width: 720px) {
  .motu-bay .bay-inner { align-items: flex-start; }
  .motu-bay .bay-meta { justify-content: flex-start; gap: 8px 14px; width: 100%; }
}

.motu-bay__headline {
  position: relative;
  z-index: 1;
  padding-top: 34px;
  max-width: 900px;
}
.motu-bay__headline > h1 {
  margin: 0 0 10px;
  font: 600 46px/1.02 ${MOTU_TYPE.family};
  letter-spacing: -.038em;
}
.motu-bay__headline > p {
  margin: 0;
  max-width: 520px;
  font: 400 15px/1.5 ${MOTU_TYPE.family};
  color: rgba(242, 251, 250, .72);
}
@media (max-width: 720px) {
  .motu-bay[data-shape="masthead"] { padding: 18px 20px 66px; }
  .motu-bay__headline > h1 { font-size: 32px; }
}
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
