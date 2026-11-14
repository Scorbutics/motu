// Lagoon scenarios for x-my-chapter: a guest is pointed at the chapters; two members see two
// different chapters, each with its own Cup place and next event.
import type { Fixture, Scenario } from '@motujs/runtime/mock';
import { CHAPTERS } from '../../shared/chapter-types.js';
import { CLUB } from '../../shared/club-evidence.js';
import { UPCOMING, DENNIS, GUIDO } from '../../shared/events-evidence.js';

export const fixtures: Fixture[] = [];

export const scenarios: Scenario[] = [
  { name: 'a guest', seed: {} },
  { name: 'northwest coastal', seed: { me: DENNIS, chapters: CHAPTERS, events: UPCOMING, overview: CLUB } },
  { name: 'chapters not loaded, nothing planned', seed: { me: DENNIS, chapters: [], events: [], overview: CLUB } },
  { name: 'a chapter with nothing planned', seed: { me: GUIDO, chapters: CHAPTERS, events: [], overview: CLUB } },
  { name: 'south', seed: { me: GUIDO, chapters: CHAPTERS, events: UPCOMING, overview: CLUB } },
];
