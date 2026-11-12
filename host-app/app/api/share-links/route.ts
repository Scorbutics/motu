// GET  /api/share-links?repo=<owner/name>   the project's links, newest first
// POST /api/share-links?repo=<owner/name>   { sha, slug, expiresAt } → { link, token } — the token ONCE
import { createLink, listLinks } from "@/src/share/share-link-admin"
import { json, owner } from "./guard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request) {
  const who = await owner(request)
  if (who instanceof Response) return who
  return json(200, { links: await listLinks(who.projectId) })
}

export async function POST(request: Request) {
  const who = await owner(request)
  if (who instanceof Response) return who
  const body = (await request.json().catch(() => null)) as { sha?: unknown; slug?: unknown; expiresAt?: unknown } | null
  const str = (v: unknown) => (typeof v === "string" && v.length > 0 && v.length <= 128 ? v : null)
  const expiresAt = body?.expiresAt === null ? null : str(body?.expiresAt)
  // NO EXPIRY IS A DECISION, and the request must say it: an absent field is refused, `null` is "never".
  if (!body || !("expiresAt" in body) || (body.expiresAt !== null && (expiresAt === null || Number.isNaN(Date.parse(expiresAt))))) {
    return json(400, { error: "expiresAt must be an ISO date, or null for a link that never expires" })
  }
  return json(201, await createLink(who.projectId, who.userId, { sha: str(body.sha), slug: str(body.slug), expiresAt }))
}
