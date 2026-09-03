// Every island's lagoon fixtures merged into one array + role set, so the standalone/lagoon roots can
// mount any island offline (MockTransport) without knowing which folder backs which tag. Adding an
// island with a `fixtures.mock.ts` = adding its two imports here.

import type { Fixture, RegionScenario, Scenario } from '@motu/runtime/mock';
import { fixtures as companyLookup, roles as companyLookupRoles } from './islands/company-lookup/fixtures.mock.js';
import {
  fixtures as memberResults,
  roles as memberResultsRoles,
  scenarios as memberResultsScenarios,
} from './islands/member-results/fixtures.mock.js';
import { scenarios as memberCardScenarios } from './islands/member-card/fixtures.mock.js';
import { scenarios as memberFormScenarios } from './islands/member-form/fixtures.mock.js';
import { scenarios as usersFlows } from './archipelagos/users/users.evidence.js';

export const ALL_FIXTURES: Fixture[] = [...companyLookup, ...memberResults];

export const ALL_ROLES: string[] = [
  ...new Set([...companyLookupRoles, ...memberResultsRoles]),
];

/**
 * THE STATES THIS PROJECT HAS WRITTEN DOWN, keyed by element tag — what `?scenario=` addresses.
 *
 * This barrel is hand-written (the scaffolded one globs `*.evidence.ts`, a layout this app predates),
 * and it exported only fixtures and roles. So `member-results`' four scenarios existed for the
 * node-side checks and nowhere a browser could reach: `motu lagoon states` printed their URLs, and
 * opening one on the published lagoon refused with "declares none" — the catalogue was empty because
 * nothing ever handed it over. motu's own demo is the one consumer that must not drift from what the
 * framework claims, so it is listed here explicitly, the same way its fixtures are.
 */
export const ALL_SCENARIOS: Record<string, Scenario[]> = {
  'x-member-results': memberResultsScenarios,
  'x-member-card': memberCardScenarios,
  'x-member-form': memberFormScenarios,
};

/**
 * THE REGION FLOWS, keyed by archipelago id — what `?region=<id>&flow=<name>` addresses.
 *
 * This was `{}` with a comment saying no region declared any, and it stayed `{}` after one did. Same
 * drift the scenario map above already suffered: a hand-written catalogue is only as current as the
 * last person who remembered it, and nothing fails when it is forgotten — the address just refuses,
 * which reads as "the flow is broken" rather than "the list is stale".
 */
export const ALL_FLOWS: Record<string, RegionScenario[]> = {
  users: usersFlows,
};
