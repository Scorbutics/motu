// Lagoon scenarios for x-event-filters. A guest has no "my chapter" tab; a member's tab is named after
// their own chapter — two different members, two different tabs. No fixtures: it calls nothing.
import type { Fixture, Scenario } from '@motu/runtime/mock';
import { UPCOMING, DENNIS, GUIDO } from '../../shared/events-evidence.js';

export const fixtures: Fixture[] = [];

export const scenarios: Scenario[] = [
  { name: 'nothing to count yet', seed: {} },
  { name: 'a guest sees all and whole-club', seed: { events: UPCOMING, me: null, filter: { scope: 'all', kind: null } } },
  { name: 'a member on their chapter', seed: { events: UPCOMING, me: DENNIS, filter: { scope: 'mine', kind: null } } },
  { name: 'a member, and nothing planned', seed: { events: [], me: DENNIS, filter: { scope: 'mine', kind: null } } },
  { name: 'workshops only', seed: { events: UPCOMING, me: GUIDO, filter: { scope: 'all', kind: 'workshop' } } },
];
