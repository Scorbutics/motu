"use client"
// The corpus screen: the page's own client boundary, and THE STAGE-1 COMPOSITION EXAMPLE.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// WHAT TO LOOK AT HERE.
//
// The page keeps its own JSX. The heading, the summary line, the `<section>` and the spacing between
// the two islands are all written below, exactly where they were before motu arrived — and each
// island is wrapped where its component already sat:
//
//     <Corpus.Island slot="corpus-filter"><CorpusFilter … /></Corpus.Island>
//
// That is the whole change a stage-1 adoption makes to a page. Nothing was extracted, no layout
// component was created, and deleting motu (`motu removal-check`) unwraps these two elements and
// leaves this file rendering its own components with the props it already computes.
//
// The stage-2 counterpart is `app/signin/signin-screen.tsx`, on this same host: there the page passes
// named props to `<Signin.Root>` and the arrangement lives in `app/signin/signin-layout.tsx`, where
// the lagoon can render it too.
//
// WHAT THIS SHAPE COSTS: everything on this page that is NOT an island — the heading, the summary,
// the section chrome — exists only here. The lagoon previews the two islands and knows nothing about
// the arrangement around them. See `motu/roots/lagoon/src/regions/corpus.tsx`.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
import { Corpus, MotuRegion } from "@/components/motu/corpus-region"
import { CorpusFilter } from "@/components/corpus/corpus-filter"
import { CorpusStates } from "@/components/corpus/corpus-states"
import type { CorpusState } from "@/app/corpus/corpus-region"

export function CorpusScreen({ states, regionId }: { states: CorpusState[]; regionId: string }) {
  return (
    <MotuRegion>
      <CorpusBody states={states} regionId={regionId} />
    </MotuRegion>
  )
}

/**
 * The page's own body, INSIDE the provider — which is why it is a separate component.
 *
 * `useRegion()` reads the region, so it has to run under `<MotuRegion>`, and a component cannot sit
 * inside a provider it renders itself. Exactly the constraint `<X.Root>` documents for stage 2, met
 * here the stage-1 way: one more component, and no arrangement moved out of the page.
 */
function CorpusBody({ states, regionId }: { states: CorpusState[]; regionId: string }) {
  const unacceptedCount = states.filter((s) => !s.accepted).length
  // READING THE REGION BACK — the last mile `integrate check` asks about. `filter` is island-owned:
  // this page never assigns it (the host-side region type omits produced keys, so trying is a compile
  // error) and reads it here only to describe what is on screen.
  //
  // NOTE WHAT IS *NOT* DONE WITH IT: it is not passed down to `corpus-states`. That island binds
  // `filter` itself. Threading it through here would be the laundering the ownership rules exist to
  // stop, and the island wrapper would refuse to publish it anyway.
  const { filter = "all" } = Corpus.useRegion()
  const shown = filter === "unaccepted" ? unacceptedCount : states.length

  // The page's own arrangement below, untouched by motu: only the two island wrappers are new.
  return (
    <main className="corpus-page">
      <header className="corpus-page__head">
        <h1>Recorded states</h1>
        <p className="corpus-page__summary">
          {states.length
            ? `Showing ${shown} of ${states.length} state(s) for ${regionId}, ${unacceptedCount} not yet accepted.`
            : `Nothing recorded for ${regionId} yet.`}
        </p>
      </header>

      <section className="corpus-page__controls">
        {/* THE ISLAND WRAPPER GOES WHERE THE COMPONENT ALREADY WAS. `unacceptedCount` is passed as
            a prop and the wrapper publishes it into the region, which is the declared path — the
            same one `signin-screen.tsx` had to learn, where seeding from an effect left the value
            out of the server-rendered HTML. */}
        <Corpus.Island slot="corpus-filter">
          <CorpusFilter unacceptedCount={unacceptedCount} />
        </Corpus.Island>
      </section>

      <section className="corpus-page__states">
        {/* NO `filter` PROP HERE, and its absence is the point. The filter island writes `filter`
            into the region and this island binds it, so the value never passes through this page.
            Threading it through a `useState` here is precisely the laundering the ownership rules
            exist to stop. */}
        <Corpus.Island slot="corpus-states">
          <CorpusStates states={states} regionId={regionId} />
        </Corpus.Island>
      </section>
    </main>
  )
}
