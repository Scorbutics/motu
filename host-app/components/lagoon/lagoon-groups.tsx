"use client"
// The COMPOSED card: the galleries this host serves.
//
// A TILE STRIP, not full-width rows. Both reference designs use the same shape for a SHORT, bounded
// set — the time tiles, the day strip: equal rounded tiles laid across, each holding a name over a
// count. This host has two or three galleries and will not have twenty, so a strip reads them at a
// glance where a stack of full-width rows made two items look like the start of a long list.
import { Panel, PanelHead, PanelBody, Row, Grow, Sub, Empty } from "@motu/chrome/react"
import type { LagoonGroup } from "@/app/index-region"

export interface LagoonGroupsProps {
  groups?: LagoonGroup[]
}

export function LagoonGroups({ groups = [] }: LagoonGroupsProps) {
  // No card at all when there are none, matching `views.mjs`: an empty "Composed" heading tells a
  // visitor this host has a gallery feature they are not using, which is noise on the one page that
  // should be a list of what exists.
  if (!groups.length) return null
  return (
    <Panel shape="window">
      <PanelHead title="Composed" />
      <PanelBody>
        <div className="motu-tile-strip">
          {groups.map((g) => (
            <Row as="a" key={g.name} href={`/g/${g.name}`} data-surface="card" data-interactive>
              <Grow>
                {g.name}
                <Sub>{`${g.members.length} lagoon${g.members.length === 1 ? "" : "s"}`}</Sub>
              </Grow>
            </Row>
          ))}
        </div>
      </PanelBody>
    </Panel>
  )
}
