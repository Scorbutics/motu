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

import { MOTU_CHROME as CHROME } from '@motu/chrome';

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

/**
 * motu's chrome palette — now defined in `@motu/chrome`, and re-exported here so every existing
 * `import { MOTU_CHROME } from '@motu/core'` keeps working.
 *
 * It moved because "one place, so the tooling cannot drift into a second brand colour" was only true
 * for what a bundler compiles. The lagoon HOST renders pages from bare node, could not import this
 * file, and grew its own dark-slate palette — the second brand this comment forbids. `@motu/chrome`
 * is plain ESM with no dependencies, so Vite and node can both read it.
 *
 * The primary IS the lagoon's own water (see the tide line): motu's UI and the lagoon it frames are
 * the same surface, and a chip in a different hue reads as belonging to something else.
 */
export { MOTU_CHROME } from '@motu/chrome';

export interface MotuChromeTheme {
  /** Any CSS colour, including a reference to the host's own token: `hsl(var(--primary))`. */
  primary?: string;
  /** Text on `primary`. Supply it whenever primary is light, or the chips become unreadable. */
  onPrimary?: string;
  caution?: string;
}

/**
 * Point motu's chrome at the surrounding application's colours.
 *
 * The teal default is motu's own, and it is right when motu frames nothing in particular. Inside a
 * lagoon it is wrong: the page below belongs to a real application with its own primary, and tooling
 * in an unrelated hue reads as something that wandered in. So the palette is tokens, the defaults are
 * motu's, and a project points them at its own — `hsl(var(--primary))` picks the host's up directly,
 * no value copied and nothing to keep in sync.
 *
 * The water ramp is derived rather than themed away: it is a READOUT (calm = mock, brighter/faster =
 * live backend, amber = legacy fit), so it keeps its shape and only shifts hue with the primary. When
 * no primary is given the tuned defaults stand untouched.
 */
export function applyMotuChrome(theme: MotuChromeTheme = {}): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement.style;
  if (theme.caution) root.setProperty('--motu-caution', theme.caution);
  if (theme.onPrimary) root.setProperty('--motu-on-primary', theme.onPrimary);
  if (!theme.primary) return;
  root.setProperty('--motu-primary', theme.primary);
  root.setProperty('--motu-primary-deep', `color-mix(in srgb, ${theme.primary} 78%, #000)`);
  // Same deep -> shallow shape as the default ramp, rebuilt around the host's hue.
  root.setProperty('--motu-water-deep', `color-mix(in srgb, ${theme.primary} 84%, #000)`);
  root.setProperty('--motu-water-mid', theme.primary);
  root.setProperty('--motu-water-shallow', `color-mix(in srgb, ${theme.primary} 68%, #fff)`);
}

export const MOTU_TOOLBAR_CHIP_CSS = [
  'display:inline-flex',
  'align-items:center',
  'gap:7px',
  'padding:7px 12px',
  'border:0',
  'border-radius:9999px',
  'cursor:pointer',
  'color:' + CHROME.onPrimary,
  'font:inherit',
  'box-shadow:0 4px 14px rgba(15,23,42,.28)',
].join(';');
