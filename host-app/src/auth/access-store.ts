// The `AccessStore` that talks to Postgres. Kept apart from the decision it serves so that
// `repo-access.ts` can be tested without a database, which is where the rules worth testing live.
//
// SERVER ONLY, and straight to Postgres — see src/db.ts.
import { db, one } from '../db.ts'
import type { AccessStore, CachedAnswer, Repo } from './repo-access.ts'

export function postgresAccessStore(): AccessStore {
  return {
    async get(userId: string, repo: Repo): Promise<CachedAnswer | null> {
      const row = await one<{ can_read: boolean; checked_at: Date }>(
        'select can_read, checked_at from repo_access where user_id = $1 and repo = $2',
        [userId, repo],
      )
      return row ? { canRead: row.can_read, checkedAt: new Date(row.checked_at) } : null
    },
    async put(userId: string, answers: Array<{ repo: Repo; canRead: boolean }>): Promise<void> {
      if (!answers.length) return
      // ONE STATEMENT, not one per repo: a person on two hundred repositories would otherwise turn
      // one sign-in into two hundred round-trips inside a callback the browser is waiting on.
      // `unnest` keeps it parameterised, so a repo name is never concatenated into SQL.
      await db().query(
        `insert into repo_access (user_id, repo, can_read, checked_at)
         select $1, r, c, now() from unnest($2::text[], $3::boolean[]) as t(r, c)
         on conflict (user_id, repo)
         do update set can_read = excluded.can_read, checked_at = excluded.checked_at`,
        [userId, answers.map((a) => a.repo), answers.map((a) => a.canRead)],
      )
    },
  }
}
