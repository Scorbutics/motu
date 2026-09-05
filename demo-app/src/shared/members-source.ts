// The members SOURCE: criteria in, a page of members out.
//
// WHY THIS IS NOT IN THE APP. It lives beside the islands, in `demo-app`, because it is the thing
// both sides need — the page composes a transport over it, and anything previewing the region has
// to be able to reach the same code. A source that lives only in the app root can only ever run
// there, which puts the interesting half of the behaviour (paging arithmetic, how criteria become
// a query, what an empty result is) outside everything that looks at this project.
//
// AND IT TAKES ITS BACKEND AS A PORT. `MembersPort` is two methods wide. Production hands it a
// Supabase client talking to Postgres; a test hands it a hand-made object. That is the seam motu's
// model is built around: the source is REAL wherever it runs, and only the port is swapped.
//
// What it deliberately does NOT do is know about motu. Nothing here imports a store, an island or
// an archipelago — it is the application's own data code, and it would survive motu being deleted.
import type { MemberCriteria, MemberPage, MemberRow } from './member-types.js';

/** One page of rows plus the total the query would have returned unpaged. */
export interface MembersQueryResult {
  rows: MemberRow[];
  total: number;
}

/**
 * What the source needs from a backend, and nothing more.
 *
 * Deliberately not "a Supabase client": naming the vendor here would put the vendor in every test
 * and in every preview, which is the coupling this interface exists to refuse.
 */
export interface MembersPort {
  /** Rows matching `criteria`, ordered by surname, offset by `first`, at most `perPage` of them. */
  search(criteria: MemberCriteria, first: number, perPage: number): Promise<MembersQueryResult>;
  /**
   * One member by id, or `null` when there is no such row.
   *
   * NULL RATHER THAN A THROW, and the distinction is the whole reason this is on the port. "No such
   * member" is a URL someone pasted wrongly and is a designed screen; "the database refused" is an
   * outage and is a different one. A port that threw for both would make the profile page unable to
   * tell them apart, and it would render the friendlier of the two.
   */
  byId(id: string): Promise<MemberRow | null>;
}

/** How many rows a page holds. The results island reads this back off the response, not from here. */
export const PER_PAGE = 20;

/**
 * The application's own members source.
 *
 * The paging arithmetic is the part worth having in one place: the results island asks for a PAGE
 * NUMBER and the backend wants an OFFSET, and every place that conversion is repeated is a place it
 * can be repeated wrongly.
 */
export function membersSource(port: MembersPort) {
  return {
    async search(page: number, criteria: MemberCriteria): Promise<MemberPage> {
      // A page number below the first page is a caller bug, not a reason to fail: clamping keeps a
      // stale `page` in the store (a filter that shrank the result set) from throwing at the user.
      const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 0;
      const first = safePage * PER_PAGE;
      const { rows, total } = await port.search(criteria ?? {}, first, PER_PAGE);
      return { list: rows, first, perPage: PER_PAGE, size: total };
    },
    /**
     * One member, for the profile page.
     *
     * The guard is here rather than at the call site because every caller would otherwise repeat it:
     * an empty id is a route that has not resolved, which is a question not worth asking the
     * database — and asking it anyway returns a confusing "no such member" for a member nobody named.
     */
    async byId(id: string): Promise<MemberRow | null> {
      if (!id) return null;
      return port.byId(id);
    },
  };
}

export type MembersSource = ReturnType<typeof membersSource>;
