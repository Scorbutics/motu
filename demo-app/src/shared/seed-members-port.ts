// A `MembersPort` answered from the committed seed rows, in memory.
//
// TWO CONSUMERS, ONE IMPLEMENTATION. The public sandbox build answers the app's port with it in the
// browser (`roots/app/src/lib/browser-port.ts`), and the lagoon answers the members region's contract
// call with it through the app's own `membersSource`. Before this file the lagoon had a fifteen-row
// stub with its own filter and its own invented people — so the region previewed a directory the app
// does not have, filtered by rules the app does not run.
//
// WHAT IT MUST MATCH, because both consumers are standing in for Postgres: the filters (`ilike`
// substrings on email/names, exact on status/plan), the order (surname then firstname), the paging
// (`range` inclusive), and `byId` answering null for a missing row — `supabase-port.ts` is the real
// one. If one of those changes there, change it here too.
import type { MemberCriteria, MemberRow } from './member-types.js';
import type { MembersPort, MembersQueryResult } from './members-source.js';

const CONTAINS: (keyof MemberCriteria)[] = ['email', 'firstname', 'surname'];
const EXACT: (keyof MemberCriteria)[] = ['status', 'plan'];

const text = (v: unknown) => (v == null ? '' : String(v));

const bySurname = (a: MemberRow, b: MemberRow) =>
  text(a.surname).localeCompare(text(b.surname)) || text(a.firstname).localeCompare(text(b.firstname));

/** The rows a query matches, in the backend's order. Exported for tests and for evidence. */
export function matchSeedMembers(rows: readonly MemberRow[], criteria: MemberCriteria): MemberRow[] {
  return rows
    .filter((m) => {
      for (const key of CONTAINS) {
        const v = criteria[key];
        if (typeof v === 'string' && v.trim() !== '' && !text(m[key]).toLowerCase().includes(v.trim().toLowerCase())) return false;
      }
      for (const key of EXACT) {
        const v = criteria[key];
        if (typeof v === 'string' && v !== '' && m[key] !== v) return false;
      }
      return true;
    })
    .sort(bySurname);
}

/**
 * The port. `latencyMs` is a tick of delay so loading states render as they do against a real
 * backend; the lagoon passes 0 because its checks wait for the screen, not for a clock.
 */
export function seedMembersPort(rows: readonly MemberRow[], latencyMs = 0): MembersPort {
  const settle = <T,>(value: T): Promise<T> =>
    latencyMs > 0 ? new Promise((r) => setTimeout(() => r(value), latencyMs)) : Promise.resolve(value);
  return {
    async search(criteria, first, perPage): Promise<MembersQueryResult> {
      const matched = matchSeedMembers(rows, criteria ?? {});
      return settle({ rows: matched.slice(first, first + perPage), total: matched.length });
    },
    async byId(id) {
      return settle(rows.find((m) => m.id === id) ?? null);
    },
  };
}
