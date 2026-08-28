"use client"
// The review console's client boundary — the page's own work, and where the port is installed.
//
// APPLICATION CODE, deliberately, and not beside the composition root: the port reaches the network
// and localStorage, and a composition root that imports either stops being deletable whole. That is
// the trap `signin-region.tsx` records having cost peps an afternoon.
//
// This was `review-console/src/App.tsx` and is the same file with three differences: the region
// binding moved out to `components/motu/`, the fetch of the project list stayed here where it always
// was, and the console now shares a document with the rest of the host — so it no longer installs a
// page shell of its own.
import { useCallback, useEffect, useMemo, useState } from "react"
import { applyMotuChrome, channelFrom } from "@motu/core"
import { createRegion, nextHostBridge } from "@motu/adapter-next"
import { useRouter } from "next/navigation"
import { ELEMENT_REGISTRY, reviewArchipelago } from "motu-host-islands"
import { AcceptBar } from "@/components/review/accept-bar/AcceptBar"
import { DiffViewer } from "@/components/review/diff-viewer/DiffViewer"
import { RepoPicker } from "@/components/review/repo-picker/RepoPicker"
import { ShotList } from "@/components/review/shot-list/ShotList"
import { StatusSummary } from "@/components/review/status-summary/StatusSummary"
import { ViewerBadge } from "@/components/lagoon/viewer-badge"
import type { Viewer } from "@/src/auth/viewer"
import { acceptShots, listRepos, listShots, shotUrl, type HostConfig } from "@/src/review/host"

/**
 * The host, as the source's port — DATA, and nothing else.
 *
 * The token is read at call time rather than captured: reads need none, and the one that does
 * (accept) must see whatever the operator has pasted since the page loaded.
 */
function cfgNow(): HostConfig {
  return { base: "" }
}

// Module scope, deliberately: the binding is a property of this composition root, not of a render.
//
// AND IT LIVES IN AN APPLICATION FILE, unlike this host's other three regions, whose bindings sit in
// `components/motu/` importing nothing but motu so `removal-check` can delete them whole. This one
// cannot: its declared source takes a PORT — the object that reaches the network and localStorage —
// and `channels` is a `createRegion` option fixed at module scope, so there is no position where the
// port arrives later. The console had exactly this shape before the fold; keeping it is the faithful
// move rather than inventing an indirection to satisfy a rule this region genuinely cannot meet.
//
// This host declares `removable: false`, so `removal-check` skips it either way. For an ADOPTING app
// the answer is not this file — it is to feed the port through the page's own render, and the cost of
// not being able to is worth naming: a region with a channel-installed source has no
// application-free composition root.
const port = {
  list: (repo: string) => listShots(cfgNow(), repo),
  accept: (repo: string, island?: string, shot?: string) => acceptShots(cfgNow(), repo, island, shot),
}

const Review = createRegion(reviewArchipelago, {
  elements: ELEMENT_REGISTRY,
  // THE SAME CALL THE LAGOON MAKES. The console used to fetch in an effect and `provide()` the
  // result, which is an expression position the lagoon does not have — so the two halves were free to
  // answer the region's couplings differently, and did.
  channels: [channelFrom({ to: reviewArchipelago, id: "shots", args: [port] })],
  // ESTABLISHED at the root, not on first fetch. Without this every reader sees `undefined` until the
  // network answers — and the lagoon cannot tell you, because it seeds these keys itself.
  seed: {
    repos: [],
    shots: [],
    selectedRepo: null,
    selectedShot: null,
    viewMode: "last",
    busy: false,
    error: null,
  },
  useHost: () => nextHostBridge(useRouter()),
})

/**
 * The page's own work: fetching the project list, and the error it can fail with.
 *
 * Inside the Region, because it READS the region — `selectedRepo` is written by an island and this
 * reacts to it. Nothing here assigns that key: the host-side region type omits what an island
 * produces, so trying to would be a compile error rather than a habit.
 */
function ReviewPage({ cfg, viewer, repo }: { cfg: HostConfig; viewer: Viewer | null; repo: string | null }) {
  const [error, setError] = useState<string | null>(null)
  const { repos = [], selectedRepo } = Review.useRegion()

  useEffect(() => {
    listRepos(cfg)
      .then((r) => {
        Review.provide("repos", r)
        // ARRIVED WITH ONE IN MIND. A lagoon links here with `?repo=`, so the reviewer lands on the
        // project they were just looking at rather than on a picker. Only if it is one they can
        // actually see — the list is already filtered by whoever is asking, so an unknown name is
        // either private to someone else or gone, and silently selecting nothing is the honest answer.
        if (repo && r.some((x) => x.repo === repo)) Review.provide("selectedRepo", repo)
      })
      .catch((e: Error) => setError(e.message))
  }, [cfg, repo])

  /**
   * WEAR THE COLOUR OF THE PROJECT BEING REVIEWED.
   *
   * The same thing motu's own chrome does over a host application — peps is gold, so the dock over
   * peps is gold. This console reviews someone else's screenshots, and looking like motu while
   * showing peps' work made the two hard to tell apart at a glance.
   *
   * IT NOW SHARES A DOCUMENT WITH THE REST OF THE HOST, which is new and which the cleanup below
   * already handled by accident: `applyMotuChrome` only ever SETS, so leaving a project has to clear
   * what the last one wrote — and here "leaving" includes navigating back to a page that must be
   * motu teal again.
   */
  useEffect(() => {
    const brand = repos.find((r) => r.repo === selectedRepo)?.brand
    applyMotuChrome(brand ? { primary: brand } : {})
    if (!brand) {
      for (const v of [
        "--motu-primary", "--motu-primary-deep",
        "--motu-water-deep", "--motu-water-mid", "--motu-water-shallow",
        "--motu-surface-page", "--motu-surface-panel", "--motu-line",
      ]) {
        document.documentElement.style.removeProperty(v)
      }
    }
    return () => {
      for (const v of [
        "--motu-primary", "--motu-primary-deep",
        "--motu-water-deep", "--motu-water-mid", "--motu-water-shallow",
        "--motu-surface-page", "--motu-surface-panel", "--motu-line",
      ]) {
        document.documentElement.style.removeProperty(v)
      }
    }
  }, [repos, selectedRepo])

  // THE WRAP FORM, and the arrangement is no longer here: `ReviewLayout` is the archipelago's `root`,
  // so the page and the lagoon compose it from ONE declaration. This screen used to name the layout
  // itself and the lagoon frame named it again — two calls that happened to agree, which is the drift
  // motu's own rules forbid.
  //
  // Each slot gets the REAL component with no props of its own: everything these five render comes
  // from the region, fed by the declared `shots` source. `viewer` is the exception — where the host
  // lives is the page's to say, never region state.
  return (
    <Review.Root
      title="Baseline review"
      summary={<StatusSummary />}
      projects={<RepoPicker />}
      shots={<ShotList />}
      viewer={<DiffViewer shotUrl={(h: string) => shotUrl(cfg, h)} />}
      error={error ? <p className="rv-error">{error}</p> : null}
      account={<ViewerBadge viewer={viewer} />}
      // NULL WHEN THERE IS NOBODY TO ACCEPT AS, which is how a slot is left unmounted — `Root` treats
      // null as absent rather than mounting the island with no child, which would put the accept bar
      // on screen at exactly the moment the page said not to.
      accept={viewer ? <AcceptBar /> : null}
      connect={
        viewer ? null : (
          // THE WAY IN, not a way round. This used to be a field asking for the host's admin token —
          // a secret the operator pasted and the browser kept — because the console had no idea who
          // was reading it. It does now, so the answer to "you cannot accept yet" is the same answer
          // the rest of this host gives: sign in.
          <p className="rv-token">
            <a className="motu-btn" data-weight="strong" href={`/signin?returnTo=${encodeURIComponent("/console")}`}>
              Sign in to accept baselines
            </a>
          </p>
        )
      }
    />
  )
}

export function ConsoleScreen({ viewer = null, repo = null }: { viewer?: Viewer | null; repo?: string | null }) {
  // READS NEED NOTHING — the listing routes filter by whoever is asking, so a visitor sees the public
  // projects and a member sees theirs. Gating the whole console behind a secret made a browsable tool
  // unopenable; what identity decides is ACCEPTING, which is asked for where accepting happens.
  const cfg = useMemo(() => ({ base: "" }), [])
  return (
    <Review.Region>
      <ReviewPage cfg={cfg} viewer={viewer} repo={repo} />
    </Review.Region>
  )
}
