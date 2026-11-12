// The share-links page's data — ONE object, for the page and the lagoon alike.
//
// Spec: motu/src/archipelagos/share-links/share-links.req.toml. Every clause with a `rule` is a
// property of THIS source (test/share-links.req.test.ts runs them on fast-check); every clause with a
// `flow` drives it through the islands in the lagoon.
//
// Framework-free and motu-free: plain functions and a subscription. The page installs it over the real
// routes; the lagoon over a fixture port.
import type { Source } from "@motu/types"
import type { ShareLinkRegion } from "@/app/share/share-region"
import type { ShareLink } from "@/src/auth/share-link-rules"

/** A share link as the owner's page sees it. NO TOKEN FIELD — the token exists once, in the create answer. */
export type ShareLinkRow = Omit<ShareLink, "projectId" | "expiresAt" | "revokedAt"> & {
  id: string
  /** ISO, or null for a link that never expires. */
  expiresAt: string | null
  /** ISO, or null while the link has not been revoked. */
  revokedAt: string | null
  createdAt: string
}

export type Expiry = "1d" | "7d" | "30d" | "never"
export const EXPIRIES: readonly Expiry[] = ["1d", "7d", "30d", "never"]

export interface CreateRequest {
  /** Null = every commit of the project. */
  sha: string | null
  /** Null = every page. */
  slug: string | null
  expiry: Expiry
}

/** What the source needs from the world. Production passes the routes; the lagoon passes fixtures. */
export interface ShareLinksPort {
  list(): Promise<ShareLinkRow[]>
  create(req: { sha: string | null; slug: string | null; expiresAt: string | null }): Promise<{ link: ShareLinkRow; token: string }>
  revoke(id: string): Promise<ShareLinkRow>
}

export type ShareKeys = "links" | "busy" | "error" | "revealedToken"

const DAY = 86_400_000
export function expiresAtFor(expiry: Expiry, now: Date): string | null {
  if (expiry === "never") return null
  const days = expiry === "1d" ? 1 : expiry === "7d" ? 7 : 30
  return new Date(now.getTime() + days * DAY).toISOString()
}

/** Newest first (S4). */
const newestFirst = (rows: ShareLinkRow[]) => [...rows].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
const message = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong")

export function createShareLinksSource(port: ShareLinksPort, { now = () => new Date() }: { now?: () => Date } = {}) {
  let state: Pick<ShareLinkRegion, ShareKeys> = { links: [], busy: true, error: null, revealedToken: null }
  const listeners = new Set<() => void>()
  const set = (next: Partial<Pick<ShareLinkRegion, ShareKeys>>) => {
    state = { ...state, ...next }
    listeners.forEach((l) => l())
  }

  // ONE OPERATION AT A TIME. A create that answers before the first list would otherwise be wiped by
  // the list landing after it — the newer state overwritten by an older answer (B1). Queuing them is
  // simpler than a generation guard here, because every operation must see the one before it.
  let queue: Promise<void> = Promise.resolve()
  let pending = 0
  const run = (op: () => Promise<void>) => {
    pending++
    set({ busy: true })
    queue = queue.then(op).finally(() => {
      pending--
      if (pending === 0) set({ busy: false })
    })
    return queue
  }

  const api = {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getState: () => state,

    load: () =>
      run(async () => {
        try {
          set({ links: newestFirst(await port.list()), error: null })
        } catch (e) {
          set({ error: message(e) })
        }
      }),

    create: (req: CreateRequest) =>
      run(async () => {
        try {
          const { link, token } = await port.create({ sha: req.sha, slug: req.slug, expiresAt: expiresAtFor(req.expiry, now()) })
          // The token goes to the reveal and NOWHERE else: rows carry no token field (C3, C4).
          set({ links: [link, ...state.links.filter((l) => l.id !== link.id)], revealedToken: token, error: null })
        } catch (e) {
          set({ error: message(e) })
        }
      }),

    revoke: (id: string) =>
      run(async () => {
        // Already revoked: nothing to do — the script's revoke is idempotent too (R3).
        if (state.links.find((l) => l.id === id)?.revokedAt) return
        try {
          const row = await port.revoke(id)
          // Marked, not removed: a revoked link stays on record (R2).
          set({ links: state.links.map((l) => (l.id === id ? row : l)), error: null })
        } catch (e) {
          set({ error: message(e) })
        }
      }),

    /** The owner has copied the token: it is gone for good (C4). */
    dismiss() {
      set({ revealedToken: null })
    },

    intents: {
      "share-create": (detail: unknown) => void api.create(detail as CreateRequest),
      "share-revoke": (detail: unknown) => void api.revoke(String(detail)),
      "share-dismiss": () => api.dismiss(),
    },

    dispose() {
      listeners.clear()
    },
  }
  void api.load()
  return api
}

export type ShareLinksSource = ReturnType<typeof createShareLinksSource>

/** The source, as the region refers to it. */
export const shareLinksSource: Source<ShareLinkRegion, ShareKeys, [ShareLinksPort, { now?: () => Date }?]> = {
  create: createShareLinksSource,
  produces: ["links", "busy", "error", "revealedToken"],
  reaches: [
    { route: "/api/share-links", method: "GET" },
    { route: "/api/share-links", method: "POST" },
    { route: "/api/share-links/revoke", method: "POST" },
  ],
}
