// Lagoon overrides: what a JSON declaration cannot hold.
//
// Everything the lagoon DOES lives in @motu/react (`startLagoon`), and everything it can be TOLD is in
// ../lagoon.config.json. This file is the MAP between them — ONE LINE PER REGION — and nothing else.
// Each region's own seed, arrangement and stand-ins live beside it in `regions/`, and its invented
// data lives with the rest of the evidence in `src/shared/`.
import type { LagoonOverrides } from '@motu/react';
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
