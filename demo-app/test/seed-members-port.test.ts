// Unit tests for the seed-backed members port.
//
// It stands in for Postgres twice — in the public sandbox and in the lagoon — so the branches a screen
// cannot tell apart are pinned here: substring vs exact matching, the order, the paging window, and
// `byId` answering null rather than throwing.
import { deepStrictEqual, strictEqual } from 'node:assert/strict';
import { describe, it } from 'node:test';
import { matchSeedMembers, seedMembersPort } from '../src/shared/seed-members-port.js';

const ROWS = [
  { id: 'a', firstname: 'Grace', surname: 'Salazar', email: 'grace.salazar@example.org', status: 'active', plan: 'premium' },
  { id: 'b', firstname: 'Alan', surname: 'Wirth', email: 'alan.wirth@example.org', status: 'suspended', plan: 'premium' },
  { id: 'c', firstname: 'Amira', surname: 'Wirth', email: 'amira.wirth@example.org', status: 'active', plan: 'premium' },
  { id: 'd', firstname: 'Grace', surname: 'Allen', email: 'grace.allen@example.org', status: 'active', plan: 'standard' },
];

describe('matchSeedMembers', () => {
  it('orders by surname, then first name', () => {
    deepStrictEqual(matchSeedMembers(ROWS, {}).map((r) => r.id), ['d', 'a', 'b', 'c']);
  });
  it('matches names and email as case-insensitive substrings, trimmed', () => {
    deepStrictEqual(matchSeedMembers(ROWS, { surname: '  wIr ' }).map((r) => r.id), ['b', 'c']);
    deepStrictEqual(matchSeedMembers(ROWS, { email: 'SALAZAR' }).map((r) => r.id), ['a']);
  });
  it('matches status and plan exactly — "act" is not "active"', () => {
    deepStrictEqual(matchSeedMembers(ROWS, { status: 'act' }), []);
    deepStrictEqual(matchSeedMembers(ROWS, { status: 'suspended', plan: 'premium' }).map((r) => r.id), ['b']);
  });
  it('ignores empty criteria values', () => {
    strictEqual(matchSeedMembers(ROWS, { surname: '', status: '' }).length, 4);
  });
});

describe('seedMembersPort', () => {
  it('pages with an offset window and reports the unpaged total', async () => {
    const port = seedMembersPort(ROWS);
    const { rows, total } = await port.search({}, 1, 2);
    deepStrictEqual(rows.map((r) => r.id), ['a', 'b']);
    strictEqual(total, 4);
  });
  it('answers null for a member that does not exist, rather than throwing', async () => {
    strictEqual(await seedMembersPort(ROWS).byId('nobody'), null);
    strictEqual((await seedMembersPort(ROWS).byId('c'))?.firstname, 'Amira');
  });
});
