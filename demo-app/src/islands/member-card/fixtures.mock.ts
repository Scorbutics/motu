// Lagoon scenarios for x-member-card — one per state the design canvas lays out.
//
// THE CANVAS IS THE SCENARIO LIST. Its six artboards are exactly the states this island has to hold
// up in, so they become addresses: each is a URL a designer can open, and each is measured by
// `responsive` and `a11y` like any other. A design that exists only as a picture is checked by nobody.
//
// They render differently by construction, which is a rule rather than a preference: `data-flow`
// fails a scenario set whose members look the same, because fake evidence is worse than none.
//
// No fixtures: this island calls nothing. It is a projection of one region key plus its own display
// props, so its whole input is the seed.
import type { Fixture, Scenario } from '@motu/runtime/mock';
import {
  EMPTY,
  OVERFLOWING,
  PREMIUM,
  STANDARD,
  WITH_PHOTO,
} from '../../shared/member-draft-evidence.js';

export const fixtures: Fixture[] = [];

export const scenarios: Scenario[] = [
  // The state it is first seen in — dashed avatar, resting name, 0%. Not in the canvas, and it is the
  // one an island MUST have: `default-props` requires it to render from defaults alone.
  { name: 'nothing filled in', seed: { draft: EMPTY } },
  { name: 'premium (the default)', seed: { draft: PREMIUM } },
  { name: 'standard', seed: { draft: STANDARD } },
  { name: 'with photo', seed: { draft: WITH_PHOTO } },
  // The canvas's truncation artboard: long name, long email, long chapter, all at once.
  { name: 'long name and email', seed: { draft: OVERFLOWING } },
  // The shape before the data. `loading` is the island's own prop, not a region key — a card can be
  // waiting on a fetch its region knows nothing about.
  { name: 'loading skeleton', seed: { draft: EMPTY, loading: true } },
  { name: 'without actions', seed: { draft: PREMIUM, showActions: false } },
  // The members-list row: same data, one line high.
  { name: 'compact row', seed: { draft: STANDARD, layout: 'row' } },
];
