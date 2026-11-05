// Declared FLOWS for the shell region.
//
// The bar only READS, so every step either asserts with no stimulus or `provide`s a host-fed key,
// and every assertion is on what the bar RENDERS — a step whose `expect` named the key it provided
// would only prove the lagoon stored it.
import type { RegionScenario } from '@motu/runtime/mock';

/** What the app seeds before the route is read: no section, the sandbox build. */
const SEED = { section: null, dataSource: 'sandbox' };

export const scenarios: RegionScenario[] = [
  {
    // COVERAGE: the slot renders the bar, in text only the bar produces.
    name: 'the bar renders in its slot',
    seed: SEED,
    steps: [{ expectRender: { 'app-nav': 'Signed in as' } }],
  },
  {
    // THE BADGE FOLLOWS THE BUILD. Swap the backend and the claim in the chrome must change with it —
    // the one thing in the bar that is about the world rather than the page. A mutated stimulus falls
    // back to the sandbox wording, so this step fails if the bar stops reading the key.
    name: 'the bar says which backend answers',
    seed: SEED,
    steps: [{ provide: { dataSource: 'live' }, expectRender: { 'app-nav': 'live database' } }],
  },
];
