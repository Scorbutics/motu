"use client"
// The REPOSITORIES card: everything published here that this viewer may see.
//
// COMPOSED FROM THE KIT'S OWN SHAPES rather than a bare row with everything crammed into one sub-line.
// The reference designs all use the same anatomy for a list entry — an indicator at the leading edge,
// a title over a quieter sub, and a VALUE trailing at the far edge — and the kit already had every
// piece of it. The first version used none of them:
//
//   Row data-surface="card"  the outlined card row, instead of a hairline separator
//   Row data-interactive     the kit's own hover slide, instead of a rule I wrote again
//   Gauge                    the leading depth bar, which here carries a real ratio (see below)
//   Grow / Trail             a growing middle and a value at the end, instead of one long sub
//   List                     rows that assemble, staggered by --i, instead of appearing at once
import { Panel, PanelHead, PanelBody, List, ListItem, Row, Gauge, Grow, Sub, Trail, Empty } from "@motu/chrome/react"
import type { LagoonRepo } from "@/app/index-region"

export interface LagoonReposProps {
  repos?: LagoonRepo[]
  /** The host's per-repo record cap, which is what makes each row's fill mean something. */
  cap?: number
}

export function LagoonRepos({ repos = [], cap = 1000 }: LagoonReposProps) {
  return (
    <Panel shape="window">
      <PanelHead title="Repositories" />
      <PanelBody>
        {repos.length ? (
          <List>
            {repos.map((r, i) => (
              <ListItem key={r.repo} index={i}>
                <Row as="a" href={`/${r.repo}/`} data-surface="card" data-interactive>
                  {/* THE GAUGE CARRIES THE CAP, and that is the point of using it rather than drawing a
                      decorative bar. The host keeps at most `cap` records per repo and evicts by last
                      access; a repo at 24 of 1000 and one at 998 are in very different situations, and
                      the front page knew both numbers and printed neither as a quantity. */}
                  <Gauge style={{ ["--fill" as string]: `${Math.min(100, (r.records / cap) * 100)}%` }} />
                  <Grow>
                    {r.repo}
                    <Sub>{`${r.slugs.length} lagoon${r.slugs.length === 1 ? "" : "s"}`}</Sub>
                  </Grow>
                  <Trail>{`${r.records} / ${cap}`}</Trail>
                </Row>
              </ListItem>
            ))}
          </List>
        ) : (
          <Empty>Nothing published yet — run motu lagoon publish --remote from a project.</Empty>
        )}
      </PanelBody>
    </Panel>
  )
}
