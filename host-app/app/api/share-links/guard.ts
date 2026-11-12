// Who may touch a project's share links, asked once for every route under /api/share-links.
import { createClient } from "@/src/supabase/server"
import { normalizeRepo } from "@/src/host/store"
import { managedProject } from "@/src/share/share-link-admin"

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } })

/** The signed-in owner and their project — or the refusal to send. 404, not 403: like `authorize`, a
 *  project you may not manage is indistinguishable from one that does not exist. */
export async function owner(request: Request): Promise<{ userId: string; projectId: string } | Response> {
  const repo = normalizeRepo(new URL(request.url).searchParams.get("repo") ?? "")
  if (!repo) return json(400, { error: "repo is required" })
  let userId: string | null = null
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    userId = data.user?.id ?? null
  } catch {
    // an unreadable session is nobody
  }
  if (!userId) return json(401, { error: "sign in to manage share links" })
  const project = await managedProject(userId, repo)
  if (!project) return json(404, { error: `nothing at ${repo}` })
  return { userId, projectId: project.id }
}
