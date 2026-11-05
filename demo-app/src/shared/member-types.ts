// Loosely-typed rows: the backend returns List<Map<String,Object>>, so we probe columns rather than
// assume a DTO. Criteria mirrors the member-search schema field names the host already understands
// (a community membership directory: who they are, whether they're active, which plan they're on).

export type MemberRow = Record<string, unknown>;

/** A page of members as returned by the search endpoint (SubList). Numbers may arrive as strings. */
export interface MemberPage {
  list: MemberRow[];
  first: number | string;
  perPage: number | string;
  size: number | string;
}

export interface MemberCriteria {
  /**
   * Name OR email, one box — the sidebar's "Find a member". Matches a first name, a surname, the full
   * name or the email, as a substring. The other text fields narrow ONE column each and combine with
   * AND; this one is the "I only know roughly who" search.
   */
  q?: string;
  email?: string;
  firstname?: string;
  surname?: string;
  /** Membership state: "active" or "suspended". */
  status?: string;
  /** Membership plan: "premium" or "standard". */
  plan?: string;
}

/** Human labels for the criteria keys, used by the filter chips. */
/** The columns the members table sorts by. Level and streak are the club's game, computed per row. */
export type MemberSortKey = 'name' | 'plan' | 'level' | 'streak' | 'chapter' | 'joined';

/**
 * How a search is ordered. It travels WITH the search, to the port, because a sort only means
 * something over the whole result: sorting the twenty rows on screen would put "the highest level on
 * this page" at the top and call it the leader. `asOf` is the day the game columns are computed for.
 */
export interface MemberOrder {
  key: MemberSortKey;
  dir: 'asc' | 'desc';
  asOf?: string;
}

/** The order every list starts in: surname, then first name. */
export const DEFAULT_ORDER: MemberOrder = { key: 'name', dir: 'asc' };

export const CRITERIA_LABELS: Record<keyof MemberCriteria, string> = {
  q: 'Name or email',
  email: 'Email',
  firstname: 'First name',
  surname: 'Last name',
  status: 'Status',
  plan: 'Plan',
};

/** Display value for a chip (maps enum codes back to human text). */
export function criteriaDisplay(key: keyof MemberCriteria, value: string): string {
  if (key === 'status') return value === 'suspended' ? 'Suspended' : 'Active';
  if (key === 'plan') return value === 'premium' ? 'Premium' : 'Standard';
  return value;
}

export function firstString(row: MemberRow, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === 'string' && v !== '') return v;
    if (typeof v === 'number') return String(v);
  }
  return undefined;
}
