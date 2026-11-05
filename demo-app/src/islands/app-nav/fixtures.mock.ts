// Lagoon scenarios for x-app-nav.
//
// Each one is a state the real app reaches: no section lit is the first paint before the route is
// read; each section is a click; the badge is decided by which build is running. They render
// differently by construction — a lit tab moves, and the badge's words and colour change.
//
// No fixtures: the bar calls nothing.
import type { Fixture, Scenario } from '@motu/runtime/mock';

export const fixtures: Fixture[] = [];

export const scenarios: Scenario[] = [
  { name: 'nothing lit yet', seed: {} },
  { name: 'in the directory', seed: { section: 'directory', dataSource: 'sandbox' } },
  { name: 'adding a member', seed: { section: 'add', dataSource: 'sandbox' } },
  { name: 'against the live database', seed: { section: 'directory', dataSource: 'live' } },
];
