"use client"
// The REPOSITORIES list: everything this host holds that this viewer may see.
//
// PAGE SCALE, not chrome scale. The kit's row has two ends for the same reason its bay does — a lens
// row is read beside the thing it describes, and this one is read on its own, on the surface a person
// landed on. `scale="page"` is that end: two lines, a card, a 21px name. The first version used the
// chrome row and the page read as a settings list.
import { ListItem, Row, Gauge, Grow, TitleLine, Name, Kind, Pill, Sub, Trail, Enter, Dot, Empty } from "@motu/chrome/react"
import { RailedList } from "@/components/lagoon/railed-list"
import type { LagoonRepo } from "@/app/index-region"

export interface LagoonReposProps {
  repos?: LagoonRepo[]
  /**
   * The per-repo record cap, which the fill is drawn against.
   *
   * ITS OWN PROP rather than a reach into `stats`, because that reach would make this island depend
   * on the shape of another's input — `props-match` caught the first attempt, where `cap` was a prop
   * nothing could set and every row silently used a hardcoded 1000.
   */
  cap?: number
  /** What the reader typed. Matched against the repo's own name — the only text a row carries. */
  query?: string
}

export function LagoonRepos({ repos, cap = 1000, query = "" }: LagoonReposProps) {
  // NULL IS NOT ABSENT, and a default only answers the second. A region key can hold null — a cleared
  // key, a host that answered nothing, the value `flow-mutation` sends — and `repos.length` on null
  // throws, which unmounts the region rather than rendering an empty one. That crash was invisible
  // where it happened: it took down the whole root, so the NEXT mutant reported "no island mounted"
  // and the check blamed a step in a different scenario.
  const all = repos ?? []
  // `?? ""` AND a default, which are not the same guard. The default answers an ABSENT prop; this
  // answers a region key holding null, which is what a cleared key looks like and what `flow-mutation`
  // sends. Without it the island threw on `null.trim()`, unmounted, and the mutant "broke the region"
  // instead of failing its assertion — an unproven step, reported as one.
  const needle = (query ?? "").trim().toLowerCase()
  const shown = needle ? all.filter((r) => r.repo.toLowerCase().includes(needle)) : all
  // TWO EMPTIES, NOT ONE. "nothing here" and "nothing matches" are different facts, and collapsing
  // them tells a reader who mistyped that the host is empty.
  if (!all.length) {
    return <Empty>Nothing published yet — run motu lagoon publish --remote from a project.</Empty>
  }
  if (!shown.length) return <Empty>{`No repository matches “${(query ?? "").trim()}”.`}</Empty>
  return (
    <RailedList>
      {shown.map((r, i) => (
        <ListItem key={r.repo} index={i}>
          <Row as="a" scale="page" surface="card" href={`/${r.repo}/`}>
            {/* The gauge is how full this repo is against the cap — the one number on the row that is
                a RATIO, so it is drawn rather than written. */}
            <Gauge style={{ ["--fill" as string]: `${Math.min(100, (r.records / cap) * 100)}%` }} />
            <Grow wrap>
              <TitleLine>
                {/* A repo that holds records is live water; one that holds none is not broken, it is
                    empty — which is `neutral`, not `warn`. */}
                <Dot tone={r.records ? "ok" : "neutral"} />
                <Name>{r.repo}</Name>
                <Kind>repo</Kind>
                {/* LIVE IS A STATE, not a kind — so it is a Pill beside the tag rather than another
                    tag. It breathes because that is the difference between "this is a build" and
                    "this is somebody's editor", and it is the one animation in the kit that never
                    stops, spent on the one state where stillness would be a lie. */}
                {r.live?.length ? (
                  <Pill tone="ok" fill className="motu-breathe" title={`served live: ${r.live.join(", ")}`}>
                    live
                  </Pill>
                ) : null}
              </TitleLine>
              <Sub>
                {`${r.slugs.length} lagoon${r.slugs.length === 1 ? "" : "s"}`}
                {r.live?.length ? ` · ${r.live.join(", ")} updating as it is edited` : ""}
              </Sub>
            </Grow>
            <Trail wrap>
              {/* GROUPED, like the readout above it. The bay says `1,000/repo` and this said
                  `/ 1000` — the same `maxRecords`, rendered two ways, six hundred pixels apart. */}
              {`${r.records.toLocaleString("en")} / ${cap.toLocaleString("en")}`}
              <Enter />
            </Trail>
          </Row>
        </ListItem>
      ))}
    </RailedList>
  )
}
