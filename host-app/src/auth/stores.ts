// The database behind `authorize`. Kept apart from the decision it serves, so `authorize.ts` can be
// tested by enumeration rather than by fixture.
//
// SERVER ONLY, and straight to Postgres — see src/db.ts for why there is no data API in front of it.
import { one } from '../db.ts'
import type { MembershipStore, Project, ProjectStore } from './authorize.ts'

export function postgresProjectStore(): ProjectStore {
  return {
    async byRepo(repo: string): Promise<Project | null> {
      // The hot path of the one route that matters: one indexed lookup per record request.
      const row = await one<{ id: string; org_id: string; repo: string; visibility: string }>(
        'select id, org_id, repo, visibility from projects where repo = $1',
        [repo],
      )
      if (!row) return null
      return {
        id: row.id,
        orgId: row.org_id,
        repo: row.repo,
        visibility: row.visibility === 'private' ? 'private' : 'public',
      }
    },
  }
}

export function postgresMembershipStore(): MembershipStore {
  return {
    async isMember(userId: string, orgId: string): Promise<boolean> {
      // BOTH KEYS, always. A lookup on user alone would hand every private project to anybody who
      // belongs to any org at all — which is the case `authorize`'s tests pin.
      const row = await one<{ user_id: string }>(
        'select user_id from memberships where user_id = $1 and org_id = $2',
        [userId, orgId],
      )
      return row !== null
    },
  }
}
