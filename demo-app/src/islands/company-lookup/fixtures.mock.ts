// Lagoon fixtures for x-company-lookup: replayed by MockTransport so the island renders offline, with
// no backend and no login. Shapes mirror the generated @motu/contract return types.
import type { Fixture } from '@motu/runtime/mock';

export const fixtures: Fixture[] = [
  {
    service: 'CompanyGroupService',
    method: 'search',
    roles: ['COMPANY_READ'],
    response: {
      list: [
        { id: 'c1', name: 'Riverside Makerspace' },
        { id: 'c2', name: 'Riverside Cycling Club' },
        { id: 'c3', name: 'Northgate Community Trust' },
      ],
      first: '0',
      perPage: '20',
      size: '3',
    },
  },
];

/** Roles the mock caller holds — satisfies the fixtures' role gates. */
export const roles: string[] = ['COMPANY_READ'];
