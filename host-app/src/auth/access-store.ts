// The `AccessStore` that talks to Postgres. Kept apart from the decision it serves so that
// `repo-access.ts` can be tested without a database, which is where the rules worth testing live.
//
// SERVER ONLY, and it uses the service-role key: these rows are the app's own bookkeeping about a
// third party's answer, not user data with a row-level-security story. Nothing here is reachable from
// a browser module.
import { createClient } from '@supabase/supabase-js'
import type { AccessStore, CachedAnswer, Repo } from './repo-access'

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export function postgresAccessStore(): AccessStore {
  return {
    async get(userId: string, repo: Repo): Promise<CachedAnswer | null> {
      const { data, error } = await admin()
        .from('repo_access')
        .select('can_read, checked_at')
        .eq('user_id', userId)
        .eq('repo', repo)
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) return null
      return { canRead: data.can_read as boolean, checkedAt: new Date(data.checked_at as string) }
    },
    async put(userId: string, answers: Array<{ repo: Repo; canRead: boolean }>): Promise<void> {
      if (!answers.length) return
      const now = new Date().toISOString()
      const { error } = await admin()
        .from('repo_access')
        .upsert(
          answers.map((a) => ({ user_id: userId, repo: a.repo, can_read: a.canRead, checked_at: now })),
          { onConflict: 'user_id,repo' },
        )
      if (error) throw new Error(error.message)
    },
  }
}
