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
  email?: string;
  firstname?: string;
  surname?: string;
  /** Membership state: "active" or "suspended". */
  status?: string;
  /** Membership plan: "premium" or "standard". */
  plan?: string;
}

/** Human labels for the criteria keys, used by the filter chips. */
export const CRITERIA_LABELS: Record<keyof MemberCriteria, string> = {
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
