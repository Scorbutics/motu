// A project-agnostic FIT switcher for standalone/preview roots. `fit` flips the whole page between the
// native end-design and the legacy soft-migration footprint (each island reshapes to blend into the
// host). It sets the `fit` attribute on every <motu-archipelago>, which fans it out to the islands —
// the "turn the whole archipelago" control; a per-island override lives in the debug overlay. Renders
// as a compact chip in the shared floating toolbar.

import { motuToolbar, MOTU_TOOLBAR_CHIP_CSS } from '@motu/core';
import type { MotuFit } from '@motu/core';

const FIT_KEY = 'motu:fit';

function isFit(v: unknown): v is MotuFit {
  return v === 'native' || v === 'legacy';
}

/** Resolve the fit, most specific first: `?fit=` in the URL → localStorage → build default (native). */
export function resolveFitMode(buildDefault: MotuFit = 'native'): MotuFit {
  const fromQuery = new URLSearchParams(window.location.search).get('fit');
  if (isFit(fromQuery)) {
    try {
      window.localStorage.setItem(FIT_KEY, fromQuery);
    } catch {
      /* storage disabled — choice just won't persist */
    }
    return fromQuery;
  }
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(FIT_KEY);
  } catch {
    /* ignore */
  }
  return isFit(stored) ? stored : buildDefault;
}

/** Set `fit` on every archipelago region (native is the default, so we clear the attribute for it). */
function applyFit(fit: MotuFit): void {
  for (const arch of document.querySelectorAll('motu-archipelago')) {
    if (fit === 'legacy') arch.setAttribute('fit', 'legacy');
    else arch.removeAttribute('fit');
  }
}

/**
 * Mount a compact chip (in the shared floating toolbar) that flips the whole page between native (end
 * design) and legacy fit (the intermediate soft-migration view). LIVE (no reload): sets the `fit`
 * attribute on every region and persists the choice. New regions (e.g. a lagoon archipelago switcher)
 * inherit the current fit via a MutationObserver.
 */
export function mountFitToggle(initial: MotuFit = resolveFitMode()): void {
  let fit = initial;
  applyFit(fit);

  new MutationObserver((records) => {
    if (fit !== 'legacy') return;
    for (const r of records) {
      for (const n of r.addedNodes) {
        if (n instanceof HTMLElement && n.tagName.toLowerCase() === 'motu-archipelago') {
          n.setAttribute('fit', 'legacy');
        }
      }
    }
  }).observe(document.body, { childList: true, subtree: true });

  const chip = document.createElement('button');
  chip.type = 'button';

  const dot = document.createElement('span');
  dot.style.cssText = 'width:7px;height:7px;border-radius:50%;background:#fff;opacity:.85';
  const label = document.createElement('span');
  chip.append(dot, label);

  const render = () => {
    const legacy = fit === 'legacy';
    chip.style.cssText = MOTU_TOOLBAR_CHIP_CSS + ';background:' + (legacy ? '#92400e' : '#334155');
    label.textContent = legacy ? 'LEGACY fit' : 'NATIVE fit';
    chip.title = legacy
      ? 'fit: LEGACY (soft-migration view) — click for NATIVE (end design)'
      : 'fit: NATIVE (end design) — click for LEGACY (soft-migration view)';
  };

  chip.addEventListener('click', () => {
    fit = fit === 'legacy' ? 'native' : 'legacy';
    try {
      window.localStorage.setItem(FIT_KEY, fit);
    } catch {
      /* ignore */
    }
    applyFit(fit);
    render();
  });

  render();
  motuToolbar().appendChild(chip);
}
