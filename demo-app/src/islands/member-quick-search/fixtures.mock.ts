// Lagoon scenarios for x-member-quick-search.
//
// The box shows the region's `q`: empty, a name, an email. Each term is one the seed answers — a
// first name three members share, and one member's address.
//
// No fixtures: the box calls nothing; the table it filters does.
import type { Fixture, Scenario } from '@motu/runtime/mock';

export const fixtures: Fixture[] = [];

export const scenarios: Scenario[] = [
  { name: 'nothing typed', seed: {} },
  { name: 'a first name', seed: { criteria: { q: 'grace' } } },
  { name: 'an email', seed: { criteria: { q: 'dennis.shaw@example.org' } } },
];
