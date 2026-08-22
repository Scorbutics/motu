import { useCallback, useEffect, useState } from "react"
import { createRegion } from "@motu/react"
import { reviewArchipelago } from "@/archipelagos/review/review.archipelago"
import { ELEMENT_REGISTRY } from "@/islands/registry"
import type { AcceptScope } from "@/ui/accept-bar/AcceptBar"
import { acceptShots, listRepos, listShots, shotUrl, type HostConfig } from "@/lib/host"

// Module scope, deliberately: the binding is a property of this composition root, not of a render.
const Review = createRegion(reviewArchipelago, {
  elements: ELEMENT_REGISTRY,
  // ESTABLISHED at the root, not on first fetch. Without this every reader sees `undefined` until the
  // network answers — and the lagoon cannot tell you, because it seeds these keys itself. `integrate
  // check` can, and did.
  seed: { repos: [], shots: [], selectedRepo: null, selectedShot: null, viewMode: "last", busy: false, error: null },
})

/**
 * The host is the operator's, so the console asks once and remembers. A local admin tool keeping an
 * admin token in localStorage is the honest trade — vite proxies `/api` and `/shot`, so it never
 * leaves this origin.
 */
function useToken(): [string | null, (t: string) => void] {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("motu-host-token"))
  return [
    token,
    useCallback((t: string) => {
      localStorage.setItem("motu-host-token", t)
      setToken(t)
    }, []),
  ]
}

/**
 * The page's own work: fetching, and answering the accept intent.
 *
 * Inside the Region, because it READS the region — `selectedRepo` and `selectedShot` are written by
 * islands, and this reacts to them. Nothing here assigns those keys: the host-side region type omits
 * what an island produces, so trying to would be a compile error rather than a habit.
 */
function ReviewPage({ cfg, onToken }: { cfg: HostConfig; onToken: (t: string) => void }) {
  const { selectedRepo } = Review.useRegion()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listRepos(cfg)
      .then((repos) => Review.provide("repos", repos))
      .catch((e: Error) => setError(e.message))
  }, [cfg])

  // The ONE place shots are fetched: when the selection moves, and again after an accept. The islands
  // never fetch — what the statuses become is the host's answer, and this is where it is asked for.
  const load = useCallback(
    async (repo: string) => {
      Review.provide("busy", true)
      setError(null)
      try {
        Review.provide("shots", await listShots(cfg, repo))
      } catch (e) {
        setError((e as Error).message)
      } finally {
        Review.provide("busy", false)
      }
    },
    [cfg],
  )

  useEffect(() => {
    if (selectedRepo) void load(selectedRepo)
  }, [selectedRepo, load])

  const shots = Review.useRegion().shots ?? []
  const pending = shots.filter((s) => s.status !== "match").length

  const onAcceptRequested = useCallback(
    async (scope: AcceptScope) => {
      Review.provide("busy", true)
      try {
        await acceptShots(cfg, scope.repo, scope.island, scope.shot)
        Review.provide("shots", await listShots(cfg, scope.repo))
      } catch (e) {
        setError((e as Error).message)
      } finally {
        Review.provide("busy", false)
      }
    },
    [cfg],
  )

  return (
    <div className="rv">
      <header className="rv-head">
        <h1>Baseline review</h1>
        <Review.Island slot="status-summary" />
      </header>
      {error && <p className="rv-error">{error}</p>}
      <div className="rv-body">
        <aside className="rv-rail">
          <Review.Island slot="repo-picker" />
        </aside>
        <nav className="rv-shots">
          <Review.Island slot="shot-list" />
        </nav>
        <main className="rv-view">
          <Review.Island slot="diff-viewer" props={{ shotUrl: (h: string) => shotUrl(cfg, h) }} />
          {cfg.token ? (
            <Review.Island slot="accept-bar" props={{ pending, onAcceptRequested }} />
          ) : (
            <form
              className="rv-token"
              onSubmit={(e) => {
                e.preventDefault()
                const v = new FormData(e.currentTarget).get("token")
                if (typeof v === "string" && v.trim()) onToken(v.trim())
              }}
            >
              <label htmlFor="token">Paste the host token to accept baselines</label>
              <input id="token" name="token" type="password" autoComplete="off" />
              <button type="submit">Connect</button>
            </form>
          )}
        </main>
      </div>
    </div>
  )
}

export function App() {
  const [token, saveToken] = useToken()
  // READS NEED NO TOKEN — the host serves them to anyone who can reach it, and gating the whole
  // console behind a secret made a browsable tool unopenable. The token is only what lets you ACCEPT,
  // so it is asked for where accepting happens, not at the door.
  return (
    <Review.Region>
      <ReviewPage cfg={{ base: "", token }} onToken={saveToken} />
    </Review.Region>
  )
}
