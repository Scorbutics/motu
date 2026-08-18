// One shared floating toolbar that the dev/preview controls plug into — transport, fit, debug — so
// they cluster in a single place instead of scattering pills around the page. Any package (or root)
// grabs it by calling motuToolbar() and appends its own compact control; the container is created
// once, lazily, on first use.
//
// It sits top-right on a roomy screen. On a narrow one it moves to the BOTTOM-right: the page's own
// header/switcher owns the top of the screen and grows rightward as it wraps, so a fixed top-right
// bar lands on top of it — covering navigation and putting both sets of controls on the same pixels.
// The bottom-right corner is anchored to nothing. This matters because the published lagoon artifact
// is meant to be opened on a phone, which is exactly where the collision happens.

const TOOLBAR_ID = 'motu-toolbar';
const STYLE_ID = 'motu-toolbar-css';

/**
 * Below this width the toolbar flips to the bottom. Chosen so the flip happens BEFORE a page header
 * can reach the toolbar, not at the moment it touches: the lagoon's switcher row ends at x≈633, and
 * the bar (~258px wide, 12px inset) has its left edge at viewport−270 — so they meet at ~903px, and
 * 900 left a 2px clip at 901px. 960 keeps ~57px of clearance there.
 *
 * This is a heuristic, not a guarantee: a host page with a WIDER header can still reach a top-right
 * bar above this width. If that happens, raise this — or give that header its own right padding.
 */
const NARROW_MAX_PX = 960;

const TOOLBAR_CSS = `
#${TOOLBAR_ID} {
  position: fixed;
  top: 12px;
  right: 12px;
  z-index: 2147483646;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  /* Wrap rather than overflow the viewport when several controls are mounted on a small screen. */
  flex-wrap: wrap;
  max-width: calc(100vw - 24px);
  gap: 8px;
  font: 600 12px/1 -apple-system, system-ui, "Helvetica Neue", Arial, sans-serif;
}
@media (max-width: ${NARROW_MAX_PX}px) {
  #${TOOLBAR_ID} {
    top: auto;
    bottom: 12px;
  }
}
`;

/** Inject the toolbar stylesheet once. A stylesheet (not inline style) so it can carry a media query. */
function ensureToolbarStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = TOOLBAR_CSS;
  document.head.appendChild(style);
}

/** The shared floating controls bar (created on first call). Append compact controls to it. */
export function motuToolbar(): HTMLElement {
  ensureToolbarStyle();
  const existing = document.getElementById(TOOLBAR_ID);
  if (existing) return existing;
  const bar = document.createElement('div');
  bar.id = TOOLBAR_ID;
  bar.setAttribute('role', 'toolbar');
  document.body.appendChild(bar);
  return bar;
}

/** Base styling shared by the toolbar's compact chip controls (rounded pill, dark). */
export const MOTU_TOOLBAR_CHIP_CSS = [
  'display:inline-flex',
  'align-items:center',
  'gap:7px',
  'padding:7px 12px',
  'border:0',
  'border-radius:9999px',
  'cursor:pointer',
  'color:#fff',
  'font:inherit',
  'box-shadow:0 4px 14px rgba(15,23,42,.28)',
].join(';');
