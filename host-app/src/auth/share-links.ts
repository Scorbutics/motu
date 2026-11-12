// A LINK YOU CAN SEND SOMEBODY, and exactly what it opens.
//
// docs/plan-lagoon-host.md: "`share_links` is scoped to a RECORD, not a project. That is what keeps
// 'the link I sent still resolves' true without handing over the whole repo."
//
// Like `authorize` itself, the rules are a pure function over a row, so what a link opens can be
// enumerated rather than reasoned about. The database's only job is to find the row.

// The SAME helper the host already hashes ingest tokens with — imported, not re-derived. A second
// sha256 wrapper would be identical the day it was written; the point of sharing it is that a change
// to how the host hashes credentials cannot leave share links hashing the old way.
// `@motu/host` is plain ESM node; tsc reads it through allowJs.
import { digest } from '@motu/host/src/access.mjs'

import type { ShareLink } from './share-link-rules.ts'
export * from './share-link-rules.ts'

export interface ShareLinkStore {
  /** The link this token names, or null. Looked up BY DIGEST — the raw token never reaches the database. */
  byTokenHash(tokenHash: string): Promise<ShareLink | null>
}

/**
 * The digest a token is stored and looked up as.
 *
 * A LOOKUP, NOT A COMPARE, and that is a deliberate difference from `access.mjs`'s ingest tokens.
 * There the host holds one expected hash and must compare a candidate against it in constant time,
 * because a variable-time compare over a secret leaks the secret a byte at a time. Here the digest IS
 * the lookup key: nothing is compared against a secret, the index matches hash to hash, and an
 * attacker who can time that learns something about sha256 outputs rather than about any token. So
 * the same hashing, and no `secretMatches` — using it would mean fetching every row to compare
 * against, which is slower and no safer.
 */
export function tokenHash(token: string): string {
  return (digest(token) as Buffer).toString('hex')
}
