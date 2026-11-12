// THE RULES A SHARE LINK FOLLOWS — pure functions over a row, and nothing else.
//
// Split out of share-links.ts so a BROWSER can ask them too: the share-links page reads a link's
// status with `isLive`, and share-links.ts also hashes tokens with the host's node-only `digest`,
// which would drag `node:crypto` into every component that only wanted to know "is this live?". One
// policy, importable from both sides; share-links.ts re-exports it, so nothing that imported it moves.

export type ShareLink = {
  projectId: string
  /** Null means every ref of this project. Rare, and worth a second look when it appears. */
  sha: string | null
  /** Null means every slug. */
  slug: string | null
  expiresAt: Date | null
  revokedAt: Date | null
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
