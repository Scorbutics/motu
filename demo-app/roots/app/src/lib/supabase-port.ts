// The Supabase adapter — the few lines that turn a PostgREST answer into what the source expects.
//
// THIS IS THE UNPROVEN INCH, and it is worth naming rather than hiding. Every check in this project
// runs against the source over a port; none of them can tell you that `.ilike('email', …)` is the
// filter this app wants, or that `count: 'exact'` is the number the pager needs. The mitigation is
// that it is SHORT by construction: everything that could be reasoned about lives in
// `membersSource`, and what is left here is the vendor's shape.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { MemberCriteria } from 'demo-app';
import type { MembersPort, MembersQueryResult } from 'demo-app';
import type { CompaniesPort } from 'demo-app';

/** Substring filters: what a person types into a search box is a fragment, not an identifier. */
const CONTAINS: (keyof MemberCriteria)[] = ['email', 'firstname', 'surname'];
/** Exact filters: these are enum codes chosen from chips, so a substring match would be wrong. */
const EXACT: (keyof MemberCriteria)[] = ['status', 'plan'];

export function supabaseMembersPort(client: SupabaseClient): MembersPort {
  return {
    async search(criteria: MemberCriteria, first: number, perPage: number): Promise<MembersQueryResult> {
      let q = client.from('members').select('*', { count: 'exact' });
      for (const key of CONTAINS) {
        const value = criteria[key];
        if (typeof value === 'string' && value.trim() !== '') q = q.ilike(key, `%${value.trim()}%`);
      }
      for (const key of EXACT) {
        const value = criteria[key];
        if (typeof value === 'string' && value !== '') q = q.eq(key, value);
      }
      // `range` is inclusive at both ends, which is the off-by-one this line exists to get right
      // once: asking for rows 0..20 returns twenty-ONE members and the pager then disagrees with
      // itself about how many pages there are.
      const { data, error, count } = await q.order('surname').order('firstname').range(first, first + perPage - 1);
      // THROW, don't return an empty page. "No members" and "the database refused" look identical
      // on screen, and the results island already has a designed error state for the second one.
      if (error) throw new Error(`members query failed: ${error.message}`);
      return { rows: data ?? [], total: count ?? 0 };
    },
  };
}

/**
 * The client the app talks to Postgres through.
 *
 * `persistSession: false` because this directory has no login: every visitor is `anon`, and the
 * only thing the anon key may do is read (the table's RLS policy decides that, not this file).
 */
export function membersClient(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * The company lookup's backend. One filter, one order, and a hard cap — a lookup is a type-ahead,
 * not a report, so it never asks for more than it can show.
 */
export function supabaseCompaniesPort(client: SupabaseClient): CompaniesPort {
  return {
    async search(term: string, limit: number) {
      let q = client.from('companies').select('id,name,code', { count: 'exact' });
      if (term.trim() !== '') q = q.ilike('name', `%${term.trim()}%`);
      const { data, error, count } = await q.order('name').range(0, limit - 1);
      if (error) throw new Error(`companies query failed: ${error.message}`);
      return { rows: data ?? [], total: count ?? 0 };
    },
  };
}
