// Lagoon overrides: what a JSON declaration cannot hold.
//
// Everything the lagoon DOES lives in @motu/react (`startLagoon`), and everything it can be TOLD is in
// ../lagoon.config.json. This file is the MAP between them — ONE LINE PER REGION — and nothing else.
// Each region's own seed, arrangement and stand-ins live beside it in `regions/`, and its invented
// data lives with the rest of the evidence in `src/shared/`.
import type { LagoonOverrides } from '@motu/react';
// @motu/chrome is plain ESM node; the lagoon's Vite build reads it directly.
import { motuChromeCss } from '@motu/chrome';
import { corpusRegion } from './regions/corpus.js';
import { indexRegion } from './regions/index.js';
import { signinRegion } from './regions/signin.js';

/**
 * Every region this project previews — each entry BOUND to the archipelago it is about.
 *
 * An array, not a map: `overridesFor(signinArchipelago, …)` carries its own id, so the region's name
 * is written once, in the archipelago, and nothing here can disagree with it.
 */
export const regions: LagoonOverrides['regions'] = [corpusRegion, indexRegion, signinRegion];

/**
 * THE CHROME KIT'S OWN CSS, injected before anything mounts.
 *
 * The lagoon injects `motu-host-islands/styles.css` — this project's sheet — and nothing else. That
 * is right for islands styled with their own CSS, and wrong the moment an island uses
 * `@motu/chrome/react`: `Panel`, `PanelHead` and `Row` render `.motu-sheet-panel`, `.motu-cap` and
 * `.motu-row`, whose rules live in `motuChromeCss()` and were nowhere in the built lagoon. Verified:
 * zero `.motu-sheet-panel` rules in any stylesheet on the published page.
 *
 * So the index islands rendered as unstyled text in the lagoon while rendering correctly in the app,
 * which injects the same CSS in its root layout. Two surfaces for one component, disagreeing — and
 * the lagoon is the one that is supposed to be the truth about how an island looks.
 *
 * `setup` runs before anything mounts (`startLagoon` -> `overrides.setup?.()`), which is exactly
 * early enough for a stylesheet.
 */
export const setup: LagoonOverrides['setup'] = () => {
  if (typeof document === 'undefined') return;
  if (document.getElementById('motu-chrome-kit')) return;
  const style = document.createElement('style');
  style.id = 'motu-chrome-kit';
  style.textContent = motuChromeCss();
  // FIRST in the head, so the project's own sheet still wins on anything it chooses to override.
  document.head.prepend(style);
};
