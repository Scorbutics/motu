// One shared toolbar that the dev/preview controls plug into — transport, fit, debug — so they
// cluster in a single place instead of scattering pills around the page. Any package (or root) grabs
// it by calling motuToolbar() and appends its own compact control; the container is created once,
// lazily, on first use.
//
// By DEFAULT it floats: top-right on a roomy screen, bottom-right on a narrow one (a page header
// owns the top and grows rightward as it wraps, so a fixed top-right bar lands on top of it). That
// default serves roots with no chrome of their own.
//
// A root that HAS its own chrome surface (e.g. the lagoon's tide line) calls setMotuToolbarHost() to
// adopt the chips into it instead. Then the toolbar stops floating entirely: no fixed positioning,
// no corner collision to dodge, and the controls live with the rest of the root's controls. Chips
// already mounted are moved, so the call is order-independent w.r.t. the mount* functions.

const TOOLBAR_ID = 'motu-toolbar';
const STYLE_ID = 'motu-toolbar-css';

/**
 * Below this width the FLOATING toolbar flips to the bottom. Chosen so the flip happens BEFORE a page
 * header can reach the toolbar, not at the moment it touches. Irrelevant once a host is adopted —
 * a hosted toolbar is in normal flow and cannot collide with anything.
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
/* Adopted by a root's own chrome: drop every trace of the floating layout and flow inside the host. */
#${TOOLBAR_ID}[data-hosted] {
  position: static;
  max-width: none;
  flex-wrap: nowrap;
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

/** Where the bar lives, once a root has claimed it. Null => float in the corner (the default). */
let toolbarHost: HTMLElement | null = null;

/**
 * Adopt the shared toolbar into a root's own chrome instead of letting it float in a corner. Safe to
 * call before or after the controls mount: an existing bar is moved into `host` as-is.
 */
export function setMotuToolbarHost(host: HTMLElement): void {
  toolbarHost = host;
  const bar = document.getElementById(TOOLBAR_ID);
  if (bar) {
    bar.dataset.hosted = '';
    host.appendChild(bar);
  }
}

/** The shared controls bar (created on first call). Append compact controls to it. */
export function motuToolbar(): HTMLElement {
  ensureToolbarStyle();
  const existing = document.getElementById(TOOLBAR_ID);
  if (existing) return existing;
  const bar = document.createElement('div');
  bar.id = TOOLBAR_ID;
  bar.setAttribute('role', 'toolbar');
  if (toolbarHost) {
    bar.dataset.hosted = '';
    toolbarHost.appendChild(bar);
  } else {
    document.body.appendChild(bar);
  }
  return bar;
}

/** Base styling shared by the toolbar's compact chip controls (rounded pill, dark). */
/**
 * motu's chrome palette — one place, so the tooling cannot drift into a second brand colour.
 *
 * The primary IS the lagoon's own water (see the tide line): motu's UI and the lagoon it frames are
 * the same surface, and a chip in a different hue reads as belonging to something else. The transport
 * chip used to be indigo for exactly that reason — a colour picked to distinguish two states, which
 * ended up competing with the water behind it.
 *
 * The other two are semantic, not decorative. `caution` is the "you are not in the calm default" state
 * — a live backend answering with your real session, or an island wearing the legacy fit. `idle` is an
 * inert chip. Colours that carry MEANING inside the seam lens (external origin, broken binding) are
 * the overlay's own and deliberately not here.
 */
export const MOTU_CHROME = {
  /** The lagoon's water. Every "on" and calm-default state. */
  primary: '#0f766e',
  /** The water, deeper — text on a tinted primary ground. */
  primaryDeep: '#0b5b55',
  /** Proceed with care: real backend, or the legacy footprint. Not an error. */
  caution: '#b45309',
  /** Off. */
  idle: '#1e293b',
} as const;

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
