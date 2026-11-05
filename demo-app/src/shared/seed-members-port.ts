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
import { DEFAULT_ORDER, firstString, type MemberCriteria, type MemberOrder, type MemberRow } from './member-types.js';
import { memberStats, todayIso } from './gamification.js';
import type { MembersPort, MembersQueryResult } from './members-source.js';

const CONTAINS: (keyof MemberCriteria)[] = ['email', 'firstname', 'surname'];
const EXACT: (keyof MemberCriteria)[] = ['status', 'plan'];

const text = (v: unknown) => (v == null ? '' : String(v));

const bySurname = (a: MemberRow, b: MemberRow) =>
  text(a.surname).localeCompare(text(b.surname)) || text(a.firstname).localeCompare(text(b.firstname));

/**
 * Rows in an order. The stored columns sort as Postgres sorts them; LEVEL and STREAK are computed by
 * the club's rules for `order.asOf` — which is why the Postgres port, for those two, fetches the
 * matching rows and sorts them with this same function. Ties fall back to the name, so the order is
 * total and a page boundary never shuffles.
 */
export function orderMembers(rows: MemberRow[], order: MemberOrder = DEFAULT_ORDER): MemberRow[] {
  const asOf = order.asOf || todayIso();
  const dir = order.dir === 'desc' ? -1 : 1;
  const value = (m: MemberRow): number | string => {
    switch (order.key) {
      case 'level': return memberStats(m, asOf).xp;
      case 'streak': return memberStats(m, asOf).streak;
      case 'plan': return text(m.plan);
      case 'chapter': return text(m.chapter);
      case 'joined': return text(firstString(m, ['joined']));
      default: return '';
    }
  };
  const keyed = rows.map((m) => ({ m, v: value(m) }));
  keyed.sort((a, b) => {
    const c = typeof a.v === 'number' && typeof b.v === 'number' ? a.v - b.v : String(a.v).localeCompare(String(b.v));
    return c * dir || bySurname(a.m, b.m) * (order.key === 'name' ? dir : 1);
  });
  return keyed.map((k) => k.m);
}

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
      // Name OR email, word by word: every word must hit the first name, the surname or the email —
      // the same rule the Postgres port builds out of `or` filters, so "grace allen" finds Grace Allen
      // in both, and a sandbox search never disagrees with the live one.
      const q = typeof criteria.q === 'string' ? criteria.q.trim().toLowerCase() : '';
      if (q !== '') {
        const hay = [text(m.firstname), text(m.surname), text(m.email)].map((h) => h.toLowerCase());
        if (!q.split(/\s+/).every((w) => hay.some((h) => h.includes(w)))) return false;
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
    async search(criteria, first, perPage, order): Promise<MembersQueryResult> {
      const matched = orderMembers(matchSeedMembers(rows, criteria ?? {}), order);
      return settle({ rows: matched.slice(first, first + perPage), total: matched.length });
    },
    async byId(id) {
      return settle(rows.find((m) => m.id === id) ?? null);
    },
  };
}
