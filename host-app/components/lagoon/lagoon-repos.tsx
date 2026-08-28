"use client"
// The REPOSITORIES card: everything published here that this viewer may see.
import { Panel, PanelHead, PanelBody, Row, Grow, Sub, Empty } from "@motu/chrome/react"
import type { LagoonRepo } from "@/app/index-region"

export interface LagoonReposProps {
  repos?: LagoonRepo[]
}

export function LagoonRepos({ repos = [] }: LagoonReposProps) {
  return (
    // THE KIT'S OWN COMPOSITION: a `window` panel is a head plus a scrolling body, and the body is
    // what supplies the padding. A bare <Panel> with a <Cap> inside renders the caption flush against
    // the sheet's edge, which its `overflow: hidden` then clips — the first letter of "Repositories"
    // was simply gone, and no check can see that.
    <Panel shape="window">
      <PanelHead title="Repositories" />
      <PanelBody>
      {repos.length ? (
        repos.map((r) => (
          <Row as="a" key={r.repo} href={`/${r.repo}/`}>
            <Grow>
              {r.repo}
              <Sub>
                {`${r.slugs.length} lagoon${r.slugs.length === 1 ? "" : "s"} · ${r.records} record${
                  r.records === 1 ? "" : "s"
                }`}
              </Sub>
            </Grow>
          </Row>
        ))
      ) : (
        // THE EMPTY STATE IS THE FIRST THING ANYONE SEES, and it is the only place on this page that
        // can tell them what to do next. `views.mjs` says exactly this sentence; it is worth keeping.
        <Empty>Nothing published yet — run motu lagoon publish --remote from a project.</Empty>
      )}
      </PanelBody>
    </Panel>
  )
}
