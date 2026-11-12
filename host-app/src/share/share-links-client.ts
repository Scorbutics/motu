// The page's port: the share-links routes, from the browser. The source never sees a URL.
import type { ShareLinkRow, ShareLinksPort } from "./share-links-source"

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "same-origin", ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } })
  const body = (await res.json().catch(() => null)) as ({ error?: string } & T) | null
  if (!res.ok) throw new Error(body?.error ?? `${res.status} ${res.statusText}`)
  return body as T
}

/** `repo` is read at CALL time: the region (and so this port) is built at module scope, before the
 *  page has said which project it is about. */
export function shareLinksHttpPort(repo: () => string): ShareLinksPort {
  const q = () => `?repo=${encodeURIComponent(repo())}`
  return {
    list: async () => (await call<{ links: ShareLinkRow[] }>(`/api/share-links${q()}`)).links,
    create: (req) => call<{ link: ShareLinkRow; token: string }>(`/api/share-links${q()}`, { method: "POST", body: JSON.stringify(req) }),
    revoke: (id) => call<ShareLinkRow>(`/api/share-links/revoke${q()}`, { method: "POST", body: JSON.stringify({ id }) }),
  }
}
