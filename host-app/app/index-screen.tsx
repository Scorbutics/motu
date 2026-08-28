"use client"
// The front page's client boundary: it renders the real components with the real values, and the
// island wrappers publish what they were handed into the region.
//
// The values arrive as PROPS rather than through a seeding effect, for the reason `/signin` records:
// an effect does not run during SSR, so a seeded region renders empty in the delivered HTML and fills
// in after hydration. On a listing that is the whole page arriving late.
import { MotuRegion, Index } from "@/components/motu/index-region"
import { LagoonGroups } from "@/components/lagoon/lagoon-groups"
import { LagoonRepos } from "@/components/lagoon/lagoon-repos"
import { LagoonStats } from "@/components/lagoon/lagoon-stats"
import { LagoonFilter } from "@/components/lagoon/lagoon-filter"
import type { IndexRegion, ProducedIndexKeys } from "@/app/index-region"

/**
 * WHAT THE PAGE MAY PASS: everything the host feeds, and nothing an island produces.
 *
 * `query` and `show` are omitted rather than optional. The page holding its own copy of a key an
 * island owns is the exact laundering the ownership rules exist to stop, and `Omit` makes it a
 * compile error here instead of a lens warning later.
 */
export function IndexScreen({ groups, repos, stats, cap }: Omit<IndexRegion, ProducedIndexKeys>) {
  return (
    <MotuRegion>
      <Index.Root
        readout={<LagoonStats stats={stats} />}
        filter={<LagoonFilter />}
        composed={<LagoonGroups groups={groups} />}
        repositories={<LagoonRepos repos={repos} cap={cap} />}
      />
    </MotuRegion>
  )
}
