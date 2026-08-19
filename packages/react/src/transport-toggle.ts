// A small, project-agnostic transport switcher for standalone/preview composition roots. It resolves
// which transport mode to use (URL ?transport= → localStorage → build default → mock) and renders a
// compact chip in the shared floating toolbar so a human can flip modes in the browser without
// editing code. It has NO knowledge of any particular backend/app — the root wires the transports.

import { motuToolbar, MOTU_TOOLBAR_CHIP_CSS, MOTU_CHROME } from '@motu/core';

export type TransportMode = 'mock' | 'http';

const TRANSPORT_KEY = 'motu:transport';

function isMode(v: unknown): v is TransportMode {
  return v === 'mock' || v === 'http';
}

/**
 * Resolve the transport mode, most specific first:
 *   1. `?transport=http|mock` in the URL — flips + remembers the choice for this browser.
 *   2. localStorage `motu:transport` — the remembered per-browser choice (set by the toggle).
 *   3. `buildDefault` (e.g. injected from an env var at build time); unset/unknown defaults to 'mock'.
 */
export function resolveTransportMode(buildDefault = ''): TransportMode {
  const fromQuery = new URLSearchParams(window.location.search).get('transport');
  if (isMode(fromQuery)) {
    try {
      window.localStorage.setItem(TRANSPORT_KEY, fromQuery);
    } catch {
      /* private-mode / storage disabled — fall through, choice just won't persist */
    }
    return fromQuery;
  }
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(TRANSPORT_KEY);
  } catch {
    /* ignore */
  }
  if (isMode(stored)) return stored;
  return buildDefault === 'http' ? 'http' : 'mock';
}

/**
 * Mount a floating switch so a human can flip transports without editing code or restarting the dev
 * server. Switching persists the choice (localStorage) and reloads so the new transport is wired at
 * the composition root. Renders as a compact chip in the shared floating toolbar.
 */
export function mountTransportToggle(mode: TransportMode): void {
  const other: TransportMode = mode === 'http' ? 'mock' : 'http';
  const isHttp = mode === 'http';

  const chip = document.createElement('button');
  chip.type = 'button';
  chip.title = `transport: ${isHttp ? 'HTTP (live · your cookie)' : 'MOCK (offline data)'} — click to switch to ${other.toUpperCase()}`;
  // MOCK is the lagoon's calm default, so it wears the water. HTTP means real backend + real
  // session, which is the state worth noticing — caution, not a second brand colour.
  chip.style.cssText = MOTU_TOOLBAR_CHIP_CSS + ';background:' + (isHttp ? MOTU_CHROME.caution : MOTU_CHROME.primary);

  const dot = document.createElement('span');
  dot.style.cssText = 'width:7px;height:7px;border-radius:50%;background:#fff;opacity:.85';
  const label = document.createElement('span');
  label.textContent = isHttp ? 'HTTP' : 'MOCK';
  chip.append(dot, label);

  chip.addEventListener('click', () => {
    try {
      window.localStorage.setItem(TRANSPORT_KEY, other);
    } catch {
      /* ignore — fall back to the query param below */
    }
    const url = new URL(window.location.href);
    url.searchParams.set('transport', other);
    window.location.assign(url.toString());
  });

  motuToolbar().appendChild(chip);
}
