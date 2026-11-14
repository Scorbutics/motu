// Lagoon fixtures for the member islands (x-member-results / search): replayed by MockTransport so the
// islands render offline with no backend and no login.
//
// THE APP'S OWN SOURCE OVER THE APP'S OWN ROWS. This used to be fifteen invented people with a
// `coordinator` column the app does not have, filtered by a stub written here — so the members region
// previewed a directory that does not exist, in a vocabulary the app does not use. It now answers
// `MemberService.search` exactly as the page does: `membersSource` (the paging arithmetic, the clamp)
// over `seedMembersPort` (the filter and the order the sandbox build runs), over the 240 rows of
// `supabase/seed.sql`. Relative imports only — this module is read by plain node.
import type { Fixture, Scenario } from '@motujs/runtime/mock';
import type { MemberCriteria } from '../../shared/member-types.js';
import { membersSource } from '../../shared/members-source.js';
import { seedMembersPort } from '../../shared/seed-members-port.js';
import { SEED_MEMBERS } from '../../shared/seed-members.generated.js';
import { EVIDENCE_DAY } from '../../shared/club-evidence.js';

const source = membersSource(seedMembersPort(SEED_MEMBERS));

export const fixtures: Fixture[] = [
  {
    service: 'MemberService',
    method: 'search',
    roles: ['MEMBER_READ'],
    // The page's own answer: the source pages, the port filters and orders. Any input works, so typing
    // a filter in the lagoon narrows the list the way it does in the app.
    response: (args: unknown[]) => source.search(Number(args[0]) || 0, (args[1] as MemberCriteria) ?? {}),
  },
  // THE BACKEND IS DOWN, for one request shape.
  //
  // Selected the way every other per-request answer is selected — by `match`. Fixtures belong to the
  // ISLAND and scenarios choose between them by seed, so "this scenario's backend fails" is expressed
  // as a request-keyed fixture the scenario's criteria happens to hit. The structural match means the
  // page argument stays a wildcard: the failure follows the criteria, not the page.
  //
  // This island has had `status === 'error'` since it was written and nothing had ever LOOKED at it:
  // `Fixture` could not say "500", so the branch was reachable only in the ocean, on a bad afternoon.
  {
    service: 'MemberService',
    method: 'search',
    roles: ['MEMBER_READ'],
    match: [undefined, { surname: 'unreachable-backend' }],
    status: 500,
  },
];

export const roles: string[] = ['MEMBER_READ'];

/** Two input cases whose distinct output proves data flows past the seam (checked by `motu island verify`). */
export const scenarios: Scenario[] = [
  { name: 'no criteria', seed: { criteria: {}, asOf: EVIDENCE_DAY } },
  { name: 'email filter', seed: { criteria: { email: 'grace.allen@example.org' }, asOf: EVIDENCE_DAY } },
  // A search that finds nothing. Cheap to write, and it is the state a list spends real time in.
  // The two filters a coordinator uses most, each a different list from the seed.
  { name: 'suspended members', seed: { criteria: { status: 'suspended' }, asOf: EVIDENCE_DAY } },
  { name: 'premium and suspended', seed: { criteria: { status: 'suspended', plan: 'premium' }, asOf: EVIDENCE_DAY } },
  { name: 'no matches', seed: { criteria: { surname: 'nobody-by-that-name' }, asOf: EVIDENCE_DAY } },
  // THE FAILURE, as an ordinary scenario: it renders in the lagoon, takes a snapshot baseline, and is
  // measured by `responsive` and `a11y` like any other. Whether what it shows is GOOD — whether there
  // is a way to retry — is now a question someone can answer by looking, which it was not before.
  { name: 'the backend fails', seed: { criteria: { surname: 'unreachable-backend' }, asOf: EVIDENCE_DAY } },
];
