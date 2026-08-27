// The `ShareLinkStore` that talks to Postgres. Straight to it — see src/db.ts.
//
// SERVER ONLY. The raw token never arrives here: `authorize` hashes it first and this looks up by
// digest, so a query log is not a list of working links.
import { one } from '../db.ts'
import type { ShareLink, ShareLinkStore } from './share-links.ts'

export function postgresShareLinkStore(): ShareLinkStore {
  return {
    async byTokenHash(hash: string): Promise<ShareLink | null> {
      const row = await one<{
        project_id: string
        sha: string | null
        slug: string | null
        expires_at: Date | null
        revoked_at: Date | null
      }>(
        'select project_id, sha, slug, expires_at, revoked_at from share_links where token_hash = $1',
        [hash],
      )
      if (!row) return null
      return {
        projectId: row.project_id,
        sha: row.sha,
        slug: row.slug,
        // REVOKED AND EXPIRED ROWS ARE RETURNED, not filtered out in SQL. `isLive` decides, in one
        // place, next to the rule it implements — a `where revoked_at is null` here would be a second
        // copy of that policy, in a language where nobody would think to look for it.
        expiresAt: row.expires_at ? new Date(row.expires_at) : null,
        revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
      }
    },
  }
}
