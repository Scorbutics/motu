// Fixture data for the share-links region — the worlds share-links.req.toml names, and the port that
// answers from them.
//
// Types only from the app, and they erase — this file is read by plain node where `@/…` does not
// resolve. `ShareLinkRow` is the source's own row, so a renamed field fails here at build time rather
// than quietly previewing a shape the page no longer has.
import type { ShareLinkRow, ShareLinksPort } from "@/src/share/share-links-source"

/** The clock every world is read at: Thursday 12 November 2026, 10:00 UTC. */
const NOW = "2026-11-12T10:00:00.000Z"

/** The default world's host-fed keys — what the page knows before the source answers. */
export const WORLD = {
  projectName: "acme/example-app",
  commits: ["9f3c2ab", "41d07e5", "c88a1f0"],
  pages: ["cart", "checkout", "product-card"],
  now: NOW,
  busy: false,
  error: null as string | null,
}

/**
 * One link of each kind the page must tell apart (S1–S3), newest first:
 *   live, one commit and one page · expired · revoked AFTER it had expired (reads "revoked", not
 *   "expired" — isLive's rule) · the whole project, never expiring (the one worth a second look).
 */
export const MIXED_LINKS: ShareLinkRow[] = [
  { id: "sl_04", sha: "9f3c2ab", slug: "cart", expiresAt: "2026-11-19T09:00:00.000Z", revokedAt: null, createdAt: "2026-11-12T09:00:00.000Z" },
  { id: "sl_03", sha: null, slug: "checkout", expiresAt: "2026-11-10T08:00:00.000Z", revokedAt: null, createdAt: "2026-11-03T08:00:00.000Z" },
  { id: "sl_02", sha: "41d07e5", slug: null, expiresAt: "2026-11-01T12:00:00.000Z", revokedAt: "2026-11-05T12:00:00.000Z", createdAt: "2026-10-25T12:00:00.000Z" },
  { id: "sl_01", sha: null, slug: null, expiresAt: null, revokedAt: null, createdAt: "2026-10-01T07:30:00.000Z" },
]

/** Nothing left to revoke (R3). */
export const REVOKED_ONLY: ShareLinkRow[] = [
  { id: "sl_11", sha: "c88a1f0", slug: "product-card", expiresAt: "2026-12-01T00:00:00.000Z", revokedAt: "2026-11-11T16:20:00.000Z", createdAt: "2026-11-02T10:00:00.000Z" },
]

/**
 * What a freshly minted token looks like: 24 random bytes, base64url — infra/mint-share-link.mjs's
 * `randomBytes(24).toString('base64url')`, 32 characters. (A first draft of this file invented a
 * `shr_` prefix the app has never used; reading the minting script is what caught it.)
 */
export const EXAMPLE_TOKEN = "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB" // tokenNumber(1): the token the fixture port mints, so flows reach this state

/** The n-th token the fixture port mints: 24 bytes of n, base64url — the real format, deterministic. */
export const tokenNumber = (n: number) => btoa(String.fromCharCode(...new Array(24).fill(n % 256))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

/**
 * A port that answers from a table — STATELESS on purpose. One port instance serves every flow of the
 * lagoon run (a channel's args are built once), so a port that remembered its creates leaked them into
 * the next flow: the second flow's token was #2, not #1. So `list` always answers the world's rows,
 * and `create`/`revoke` answer what the routes would without accumulating — the SOURCE keeps the
 * results, which is what is under test. Every create mints EXAMPLE_TOKEN.
 */
export function fixturePort(rows: ShareLinkRow[]): ShareLinksPort {
  let n = 0
  return {
    async list() {
      return rows.map((r) => ({ ...r }))
    },
    async create({ sha, slug, expiresAt }) {
      n++
      const link: ShareLinkRow = { id: `sl_new_${n}`, sha, slug, expiresAt, revokedAt: null, createdAt: new Date(Date.parse(NOW) + n * 1000).toISOString() }
      return { link, token: EXAMPLE_TOKEN }
    },
    async revoke(id) {
      const row = rows.find((r) => r.id === id)
      if (!row) throw new Error("No such link")
      return { ...row, revokedAt: row.revokedAt ?? NOW }
    },
  }
}
