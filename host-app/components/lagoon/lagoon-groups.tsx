"use client"
// The COMPOSED card: the galleries this host serves.
//
// Every prop optional with a default, because an island must render from its defaults alone — and the
// default here is the empty host, which is a real state somebody sees on day one.
import { Panel, Cap, Row, Grow, Sub } from "@motu/chrome/react"
import type { LagoonGroup } from "@/app/index-region"

export interface LagoonGroupsProps {
  groups?: LagoonGroup[]
}

export function LagoonGroups({ groups = [] }: LagoonGroupsProps) {
  // NO CARD AT ALL when there are none, matching `views.mjs`: an empty "Composed" heading tells a
  // visitor this host has a gallery feature they are not using, which is noise on the one page that
  // should be a list of what exists.
  if (!groups.length) return null
  return (
    <Panel>
      <Cap>Composed</Cap>
      {groups.map((g) => (
        // `as="a"`, not a div. Chrome's own note: a clickable div is how both applications ended up
        // with rows a keyboard could not reach, so the element is what makes it interactive.
        <Row as="a" key={g.name} href={`/g/${g.name}`}>
          <Grow>
            {g.name}
            <Sub>
              {`${g.members.length} lagoon${g.members.length === 1 ? "" : "s"} · ${g.members
                .map((m) => m.repo)
                .join(" + ")}`}
            </Sub>
          </Grow>
        </Row>
      ))}
    </Panel>
  )
}
