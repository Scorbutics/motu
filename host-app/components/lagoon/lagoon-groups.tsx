"use client"
// The COMPOSED galleries this host serves.
//
// THE SAME ROW AS THE REPOSITORIES, deliberately. These used to be a tile strip on the argument that
// a short bounded set reads better across than down — true in isolation, and wrong here: a group and
// a repository are two things a visitor chooses BETWEEN, and two different shapes made the page read
// as two unrelated widgets stacked. One list, one rail, one keyboard path; what distinguishes them is
// the kind tag, which is what a kind tag is for.
import { ListItem, Row, Grow, TitleLine, Name, Kind, Sub, Trail, Enter, Dot } from "@motu/chrome/react"
import { RailedList } from "@/components/lagoon/railed-list"
import type { LagoonGroup } from "@/app/index-region"
import type { LagoonShow } from "@/components/lagoon/lagoon-filter"

export interface LagoonGroupsProps {
  groups?: LagoonGroup[]
  /** What the reader typed. Matched against the group's name AND its members — a group is its span. */
  query?: string
  /** Which kinds are listed. This island renders nothing at all when it is not one of them. */
  show?: LagoonShow
}

export function LagoonGroups({ groups, query = "", show = "all" }: LagoonGroupsProps) {
  if (show === "repos") return null
  // NULL IS NOT ABSENT, and a default only answers the second. A region key can hold null — a cleared
  // key, a host that answered nothing, the value `flow-mutation` sends — and `repos.length` on null
  // throws, which unmounts the region rather than rendering an empty one. That crash was invisible
  // where it happened: it took down the whole root, so the NEXT mutant reported "no island mounted"
  // and the check blamed a step in a different scenario.
  const all = groups ?? []
  // `?? ""` AND a default, which are not the same guard. The default answers an ABSENT prop; this
  // answers a region key holding null, which is what a cleared key looks like and what `flow-mutation`
  // sends. Without it the island threw on `null.trim()`, unmounted, and the mutant "broke the region"
  // instead of failing its assertion — an unproven step, reported as one.
  const needle = (query ?? "").trim().toLowerCase()
  // A GROUP IS ITS MEMBERS, so a search for a repository finds the galleries that span it. Matching
  // the name alone would hide the gallery a reader is looking for behind a name they do not know.
  const shown = needle
    ? all.filter(
        (g) =>
          g.name.toLowerCase().includes(needle) ||
          g.members.some((m) => m.repo.toLowerCase().includes(needle)),
      )
    : all
  // Nothing at all when there are none, matching `views.mjs`: an empty "Composed" heading tells a
  // visitor this host has a gallery feature they are not using, which is noise on the one page that
  // should be a list of what exists. The repositories list carries the page's empty state.
  // NOTHING, not an empty state: the repositories list below carries the page's one empty message,
  // and two of them for one search reads as two failures.
  if (!shown.length) return null
  return (
    <RailedList>
      {shown.map((g, i) => (
        <ListItem key={g.name} index={i}>
          <Row as="a" scale="page" surface="card" href={`/g/${g.name}`}>
            <Grow wrap>
              <TitleLine>
                <Dot tone="ok" />
                <Name>{g.name}</Name>
                <Kind tone="sand">group</Kind>
              </TitleLine>
              <Sub>{g.members.map((m) => m.repo).join(" · ")}</Sub>
            </Grow>
            <Trail wrap>
              {`${g.members.length} lagoon${g.members.length === 1 ? "" : "s"}`}
              <Enter />
            </Trail>
          </Row>
        </ListItem>
      ))}
    </RailedList>
  )
}
