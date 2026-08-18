// Lagoon fixtures for the member islands (x-member-results / search): replayed by MockTransport so the
// islands render offline with no backend and no login. Shape mirrors @motu/contract's search return.
import type { Fixture, Scenario } from '@motu/runtime/mock';

function row(
  i: number,
  email: string,
  surname: string,
  firstname: string,
  daysAgo: number,
  plan: 'premium' | 'standard',
  status: 'active' | 'suspended' = 'active',
) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return {
    id: 'm' + i,
    email,
    surname,
    firstname,
    coordinator: i % 2 ? 'North chapter' : 'South chapter',
    _updated: d.getTime(),
    status,
    plan,
  };
}

const rows = [
  row(1, 'ada.lovelace@example.com', 'Lovelace', 'Ada', 1, 'premium'),
  row(2, 'grace.hopper@example.com', 'Hopper', 'Grace', 1, 'standard'),
  row(3, 'alan.turing@example.com', 'Turing', 'Alan', 2, 'premium'),
  row(4, 'katherine.j@example.com', 'Johnson', 'Katherine', 4, 'standard'),
  row(5, 'linus.p@example.org', 'Pauling', 'Linus', 7, 'standard', 'suspended'),
  row(6, 'rosalind.f@example.org', 'Franklin', 'Rosalind', 10, 'premium'),
  row(7, 'mae.jemison@example.com', 'Jemison', 'Mae', 16, 'standard'),
  row(8, 'nikola.t@example.org', 'Tesla', 'Nikola', 18, 'standard', 'suspended'),
  row(9, 'hedy.lamarr@example.com', 'Lamarr', 'Hedy', 22, 'premium'),
  row(10, 'george.w@example.com', 'Washington Carver', 'George', 31, 'standard'),
  row(11, 'chien.wu@example.org', 'Wu', 'Chien-Shiung', 36, 'premium'),
  row(12, 'barbara.m@example.com', 'McClintock', 'Barbara', 43, 'standard'),
  row(13, 'jane.goodall@example.org', 'Goodall', 'Jane', 43, 'standard'),
  row(14, 'tim.b@example.com', 'Berners-Lee', 'Tim', 44, 'premium'),
  row(15, 'anna.mani@example.org', 'Mani', 'Anna', 44, 'standard', 'suspended'),
];

/** Client-side stub filter mirroring the backend's member-search criteria (email/surname/firstname
 *  substring, status/plan exact) — so the lagoon narrows results for ANY typed input, making the
 *  reactive search->results loop verifiable offline. A STUB for island wiring, NOT backend fidelity. */
function matchesCriteria(r: (typeof rows)[number], criteria: Record<string, unknown>): boolean {
  const contains = (field: 'email' | 'surname' | 'firstname', val: unknown) =>
    !val || String(r[field] ?? '').toLowerCase().includes(String(val).toLowerCase());
  const equals = (field: 'status' | 'plan', val: unknown) => !val || r[field] === val;
  return (
    contains('email', criteria.email) &&
    contains('surname', criteria.surname) &&
    contains('firstname', criteria.firstname) &&
    equals('status', criteria.status) &&
    equals('plan', criteria.plan)
  );
}

export const fixtures: Fixture[] = [
  {
    service: 'MemberService',
    method: 'search',
    roles: ['MEMBER_READ'],
    // Functional stub: FILTER the dataset by the search criteria, so typing a filter narrows the list
    // live (search-ng -> store.criteria -> member-results re-fetch -> filtered). Any input works, not
    // just pre-recorded ones — which is what makes reactive behaviour verifiable in the lagoon.
    response: (args: unknown[]) => {
      const criteria = (args[1] as Record<string, unknown>) ?? {};
      const list = rows.filter((r) => matchesCriteria(r, criteria));
      return { list, first: '0', perPage: '20', size: String(list.length) };
    },
  },
];

export const roles: string[] = ['MEMBER_READ'];

/** Two input cases whose distinct output proves data flows past the seam (checked by `motu island verify`). */
export const scenarios: Scenario[] = [
  { name: 'no criteria', seed: { criteria: {} } },
  { name: 'email filter', seed: { criteria: { email: 'ada.lovelace@example.com' } } },
];
