// The company lookup's source. Same shape as the members one, and here for the same reason: the
// paging envelope the contract promises is arithmetic, and arithmetic belongs somewhere both the
// page and a test can reach.
import type { MemberPage } from './member-types.js';

export interface CompaniesQueryResult {
  rows: Record<string, unknown>[];
  total: number;
}

export interface CompaniesPort {
  search(term: string, limit: number): Promise<CompaniesQueryResult>;
}

/** A lookup shows a short list. More than this and it is a report with a search box on top. */
export const LOOKUP_LIMIT = 25;

export function companiesSource(port: CompaniesPort) {
  return {
    async search(parameters: Record<string, unknown>): Promise<MemberPage> {
      // The lookup sends whatever its input is called; take the first string it offers rather than
      // pinning a parameter name the island is free to change.
      const term = Object.values(parameters ?? {}).find((v) => typeof v === 'string') as string | undefined;
      const { rows, total } = await port.search(term ?? '', LOOKUP_LIMIT);
      return { list: rows, first: 0, perPage: LOOKUP_LIMIT, size: total };
    },
  };
}
