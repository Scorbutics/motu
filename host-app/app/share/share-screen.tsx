"use client"
// The share-links page's composition root: the region over the REAL routes, and the same source the
// lagoon installs over fixtures. Spec: motu/src/archipelagos/share-links/share-links.req.toml.
import { useEffect } from "react"
import { channelFrom } from "@motu/core"
import { createRegion } from "@motu/adapter-next"
import { ELEMENT_REGISTRY } from "motu-host-islands"
import { shareLinksArchipelago } from "@/motu/src/archipelagos/share-links/share-links.archipelago"
import { ShareLinkList } from "@/components/share/ShareLinkList"
import { ShareCreateForm } from "@/components/share/ShareCreateForm"
import { ShareTokenReveal } from "@/components/share/ShareTokenReveal"
import { shareLinksHttpPort } from "@/src/share/share-links-client"

// Which project the port talks about. Set by the screen before the region mounts — channels install on
// mount, and the port reads it at call time.
let currentRepo = ""

const Share = createRegion(shareLinksArchipelago, {
  elements: ELEMENT_REGISTRY,
  channels: [channelFrom({ to: shareLinksArchipelago, id: "shareLinks", args: [shareLinksHttpPort(() => currentRepo)] })],
  seed: { projectName: "", commits: [], pages: [], now: new Date(0).toISOString() },
})

export function ShareScreen({ repo, commits, pages }: { repo: string; commits: string[]; pages: string[] }) {
  currentRepo = repo
  useEffect(() => {
    Share.seed("projectName", repo)
    Share.seed("commits", commits)
    Share.seed("pages", pages)
    Share.seed("now", new Date().toISOString())
  }, [repo, commits, pages])
  return (
    <Share.Region>
      <Share.Root projectName={repo} list={<ShareLinkList />} create={<ShareCreateForm />} token={<ShareTokenReveal />} />
    </Share.Region>
  )
}
