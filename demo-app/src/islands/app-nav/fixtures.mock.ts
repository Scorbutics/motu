// Lagoon scenarios for x-app-nav.
//
// Each one is a state the real app reaches: no section lit is the first paint before the route is
// read; each section is a click; the badge is decided by which build is running; who is signed in is
// the session. They render differently by construction — a lit tab moves, the badge's words change,
// and the session block names a member or says Guest.
//
// No fixtures: the bar calls nothing. The members are seed rows, not names written here.
import type { Fixture, Scenario } from '@motujs/runtime/mock';
import { SEED_MEMBERS } from '../../shared/seed-members.generated.js';

const DENNIS = SEED_MEMBERS.find((m) => m.member_no === '702564');

export const fixtures: Fixture[] = [];

export const scenarios: Scenario[] = [
  { name: 'nothing lit yet', seed: {} },
  { name: 'in the directory', seed: { section: 'directory', dataSource: 'sandbox', me: DENNIS } },
  { name: 'on my club', seed: { section: 'home', dataSource: 'sandbox', me: DENNIS } },
  { name: 'at the events, as a guest', seed: { section: 'events', dataSource: 'sandbox', me: null } },
  { name: 'adding a member', seed: { section: 'add', dataSource: 'sandbox', me: DENNIS } },
  { name: 'against the live database', seed: { section: 'directory', dataSource: 'live', me: DENNIS } },
];
