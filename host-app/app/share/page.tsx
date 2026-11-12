// `/share?repo=<owner/name>` — a project's owner manages its share links.
//
// A THIN SERVER COMPONENT: it reads which commits and pages the project has recorded (the choices the
// form offers) and hands the rest to the region; the routes decide who may see or change anything.
import { normalizeRepo, store } from "@/src/host/store"
import { ShareScreen } from "@/app/share/share-screen"

export const dynamic = "force-dynamic"
export const metadata = { title: "Share links" }

export default async function SharePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = (await searchParams).repo
  const repo = normalizeRepo(typeof raw === "string" ? raw : "") ?? ""
  const listing = repo ? (store().listRepo(repo) as { aliases?: Record<string, Record<string, unknown>>; history?: { sha?: string }[] } | null) : null
  const commits = [...new Set((listing?.history ?? []).map((h) => h.sha).filter((s): s is string => typeof s === "string"))]
  const pages = Object.keys(listing?.aliases?.latest ?? {}).sort()
  return <ShareScreen repo={repo} commits={commits} pages={pages} />
}
