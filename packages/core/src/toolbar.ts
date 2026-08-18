// One shared floating toolbar (top-right) that the dev/preview controls plug into — transport, fit,
// debug — so they cluster in a single place instead of scattering pills around the page. Any package
// (or root) grabs it by calling motuToolbar() and appends its own compact control; the container is
// created once, lazily, on first use.

const TOOLBAR_ID = 'motu-toolbar';

/** The shared top-right controls bar (created on first call). Append compact controls to it. */
export function motuToolbar(): HTMLElement {
  const existing = document.getElementById(TOOLBAR_ID);
  if (existing) return existing;
  const bar = document.createElement('div');
  bar.id = TOOLBAR_ID;
  bar.setAttribute('role', 'toolbar');
  bar.style.cssText = [
    'position:fixed',
    'top:12px',
    'right:12px',
    'z-index:2147483646',
    'display:flex',
    'align-items:center',
    'gap:8px',
    'font:600 12px/1 -apple-system,system-ui,"Helvetica Neue",Arial,sans-serif',
  ].join(';');
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
