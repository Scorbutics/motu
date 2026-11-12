// POST /api/share-links/revoke?repo=<owner/name>   { id } → the link, marked revoked (idempotent)
import { revokeLink } from "@/src/share/share-link-admin"
import { json, owner } from "../guard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: Request) {
  const who = await owner(request)
  if (who instanceof Response) return who
  const body = (await request.json().catch(() => null)) as { id?: unknown } | null
  if (typeof body?.id !== "string") return json(400, { error: "id is required" })
  const link = await revokeLink(who.projectId, body.id)
  return link ? json(200, link) : json(404, { error: "No such link" })
}
