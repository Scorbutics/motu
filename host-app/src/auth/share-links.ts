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

export type ShareLink = {
  projectId: string
  /** Null means every ref of this project. Rare, and worth a second look when it appears. */
  sha: string | null
  /** Null means every slug. */
  slug: string | null
  expiresAt: Date | null
  revokedAt: Date | null
}

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

/**
 * Is this link still alive?
 *
 * Revocation beats expiry and both are checked, because they fail differently: an expired link is a
 * link that did its job, and a revoked one is a link somebody decided was a mistake. Only one of
 * those is a reason to look at who has it.
 *
 * A null `expiresAt` means no expiry — a permanent bearer credential, which is why the minting script
 * makes you say `--never` out loud rather than defaulting to it.
 */
export function isLive(link: ShareLink, now: Date): boolean {
  if (link.revokedAt !== null) return false
  if (link.expiresAt !== null && link.expiresAt.getTime() <= now.getTime()) return false
  return true
}

/**
 * Does this link scope THIS record?
 *
 * Null is a wildcard on each axis independently, so a link can name a commit and leave the slug open
 * — "everything in this build" — or name a slug across every build.
 *
 * REF IS MATCHED AS A STRING, and `latest` is therefore not the sha it currently points at. That is
 * the honest reading of two different intentions: a link to `latest` follows the alias and keeps
 * showing the newest build, and a link to a sha is immutable and always shows that one. Resolving the
 * alias here would silently turn the second kind into the first.
 */
export function scopesRecord(
  link: ShareLink,
  projectId: string,
  record: { ref: string; slug: string },
): boolean {
  if (link.projectId !== projectId) return false
  if (link.sha !== null && link.sha !== record.ref) return false
  if (link.slug !== null && link.slug !== record.slug) return false
  return true
}

/** How long a browser may hold this link's cookie: never longer than the link itself lives. */
export function cookieMaxAgeSeconds(link: ShareLink, now: Date, cap = 31_536_000): number {
  if (link.expiresAt === null) return cap
  const left = Math.floor((link.expiresAt.getTime() - now.getTime()) / 1000)
  // A COOKIE THAT OUTLIVES ITS LINK is not a security hole — `authorize` re-checks the row on every
  // request, so a stale cookie simply stops working. It is a UX one: the browser keeps presenting a
  // credential that will be refused, and the person sees a 404 rather than an expiry. Bounding it
  // means the cookie disappears at the same moment the link does.
  return Math.max(0, Math.min(left, cap))
}

/** The whole question, for `authorize` to ask. */
export function grants(
  link: ShareLink | null,
  projectId: string,
  record: { ref: string; slug: string },
  now: Date,
): boolean {
  if (!link) return false
  return isLive(link, now) && scopesRecord(link, projectId, record)
}
