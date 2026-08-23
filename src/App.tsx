import { useCallback, useEffect, useState } from "react"
import { createRegion } from "@motu/react"
import { channelFrom } from "@motu/core"
import { reviewArchipelago } from "@/archipelagos/review/review.archipelago"
import { ELEMENT_REGISTRY } from "@/islands/registry"
import type { AcceptScope } from "@/ui/accept-bar/AcceptBar"
import { acceptShots, listRepos, listShots, shotUrl, type HostConfig } from "@/lib/host"
import { ReviewLayout } from "@/ui/review-layout/ReviewLayout"

/**
 * The host, as the source's port — DATA, and nothing else.
 *
 * The token is read at call time rather than captured: reads need none, and the one that does
 * (accept) must see whatever the operator has pasted since the page loaded.
 */
const hostPort = {
  list: (repo: string) => listShots(cfgNow(), repo),
  accept: (repo: string, island?: string, shot?: string) => acceptShots(cfgNow(), repo, island, shot),
}
function cfgNow(): HostConfig {
  return { base: "", token: localStorage.getItem("motu-host-token") }
}

// Module scope, deliberately: the binding is a property of this composition root, not of a render.
const Review = createRegion(reviewArchipelago, {
  elements: ELEMENT_REGISTRY,
  // THE SAME CALL THE LAGOON MAKES. The page used to fetch in an effect and `provide()` the result,
  // which is an expression position the lagoon does not have — so the two halves were free to answer
  // the region's couplings differently, and did. Here the page supplies the port and nothing else;
  // what to do with it belongs to the declared source, once, for both.
  channels: [channelFrom({ to: reviewArchipelago, id: "shots", args: [hostPort] })],
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
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listRepos(cfg)
      .then((repos) => Review.provide("repos", repos))
      .catch((e: Error) => setError(e.message))
  }, [cfg])


  return (
    <ReviewLayout
      title="Baseline review"
      summary={<Review.Island slot="status-summary" />}
      projects={<Review.Island slot="repo-picker" />}
      shots={<Review.Island slot="shot-list" />}
      viewer={<Review.Island slot="diff-viewer" props={{ shotUrl: (h: string) => shotUrl(cfg, h) }} />}
      error={error ? <p className="rv-error">{error}</p> : null}
      accept={
        cfg.token ? (
          <Review.Island slot="accept-bar" />
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
        )
      }
    />
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
