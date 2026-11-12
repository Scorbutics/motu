// SERVER ONLY. Listing, minting and revoking a project's share links, for its owner — the same rows
// infra/mint-share-link.mjs writes, minted the same way.
//
// THE TOKEN IS RETURNED ONCE, from create, and never stored: the row keeps only its digest, hashed by
// the app's own `tokenHash` — the helper `authorize` looks links up with — so a link minted here is
// found exactly like one minted by the script.
import { randomBytes } from "node:crypto"
import { one, db } from "../db.ts"
import { tokenHash } from "../auth/share-links.ts"
import type { ShareLinkRow } from "./share-links-source.ts"

type Row = { id: string; sha: string | null; slug: string | null; expires_at: Date | null; revoked_at: Date | null; created_at: Date }
const toRow = (r: Row): ShareLinkRow => ({
  id: r.id,
  sha: r.sha,
  slug: r.slug,
  expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : null,
  revokedAt: r.revoked_at ? new Date(r.revoked_at).toISOString() : null,
  createdAt: new Date(r.created_at).toISOString(),
})
const COLUMNS = "id, sha, slug, expires_at, revoked_at, created_at"

/**
 * The project, if this user may manage its links: a member of the project's org as OWNER or ADMIN.
 * (The request says "owner"; admin is included as a default — see share-links.req.toml's report.)
 */
export async function managedProject(userId: string, repo: string): Promise<{ id: string } | null> {
  return one<{ id: string }>(
    `select p.id from projects p join memberships m on m.org_id = p.org_id
      where p.repo = $1 and m.user_id = $2 and m.role in ('owner', 'admin')`,
    [repo, userId],
  )
}

export async function listLinks(projectId: string): Promise<ShareLinkRow[]> {
  const { rows } = await db().query<Row>(`select ${COLUMNS} from share_links where project_id = $1 order by created_at desc`, [projectId])
  return rows.map(toRow)
}

export async function createLink(
  projectId: string,
  userId: string,
  req: { sha: string | null; slug: string | null; expiresAt: string | null },
): Promise<{ link: ShareLinkRow; token: string }> {
  const token = randomBytes(24).toString("base64url")
  const row = await one<Row>(
    `insert into share_links (project_id, sha, slug, token_hash, expires_at, created_by)
     values ($1, $2, $3, $4, $5, $6) returning ${COLUMNS}`,
    [projectId, req.sha, req.slug, tokenHash(token), req.expiresAt, userId],
  )
  if (!row) throw new Error("the link was not created")
  return { link: toRow(row), token }
}

/** Marks it revoked — never deletes: a revoked link on record is "turned off", not "never existed". */
export async function revokeLink(projectId: string, id: string): Promise<ShareLinkRow | null> {
  await db().query("update share_links set revoked_at = now() where id = $1 and project_id = $2 and revoked_at is null", [id, projectId])
  const row = await one<Row>(`select ${COLUMNS} from share_links where id = $1 and project_id = $2`, [id, projectId])
  return row ? toRow(row) : null
}
