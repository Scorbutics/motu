// Lagoon scenarios for x-member-filter-chips.
//
// THE ISLAND HAD NONE, so its only addressable state was the empty one — which renders nothing by
// design (no filter, no chips) — and `responsive` reported that it "renders nothing at any declared
// viewport". Each scenario below is a filter a person can apply from the search, and each one's value
// is one the seed actually matches, so the chips shown here are chips the directory really shows.
//
// No fixtures: the chips call nothing.
import type { Fixture, Scenario } from '@motujs/runtime/mock';

export const fixtures: Fixture[] = [];

export const scenarios: Scenario[] = [
  // NO EMPTY SCENARIO: with nothing applied the island draws nothing, by design, and the default
  // render already pictures that. A blank scenario cannot be compared with the others (`data-flow`).
  { name: 'one filter', seed: { criteria: { status: 'suspended' } } },
  // The two enumerated fields print in the app's words (`criteriaDisplay`), the free-text ones as typed.
  { name: 'several filters', seed: { criteria: { status: 'suspended', plan: 'premium', surname: 'Wirth' } } },
  // The longest value a person types — an email — to see the chip row hold it without breaking.
  { name: 'a long email filter', seed: { criteria: { email: 'betty.boydgranville2@example.org' } } },
];
