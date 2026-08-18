// Every island's lagoon fixtures merged into one array + role set, so the standalone/lagoon roots can
// mount any island offline (MockTransport) without knowing which folder backs which tag. Adding an
// island with a `fixtures.mock.ts` = adding its two imports here.

import type { Fixture } from '@motu/runtime/mock';
import { fixtures as companyLookup, roles as companyLookupRoles } from './islands/company-lookup/fixtures.mock.js';
import { fixtures as memberResults, roles as memberResultsRoles } from './islands/member-results/fixtures.mock.js';
import { fixtures as userSearch, roles as userSearchRoles } from './islands/user-search/fixtures.mock.js';

export const ALL_FIXTURES: Fixture[] = [...companyLookup, ...memberResults, ...userSearch];

export const ALL_ROLES: string[] = [
  ...new Set([...companyLookupRoles, ...memberResultsRoles, ...userSearchRoles]),
];
