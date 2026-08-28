"use client"
// The recorded states, ranked. The application's own component, wrapped as an island.
//
// READ-ONLY on purpose. Accepting a state is a person's decision made against the admin token
// (`src/coverage/store.ts:138`), so this control shows what was recorded and never promotes it —
// a reporting surface that can resolve its own findings reports nothing.
import type { CorpusState, CorpusFilter } from "@/app/corpus/corpus-region"

const percent = (share: number) => `${(share * 100).toFixed(1)}%`

export function CorpusStates({
  states = [],
  filter = "all",
  regionId = "",
}: {
  states?: CorpusState[]
  filter?: CorpusFilter
  regionId?: string
}) {
  const shown = filter === "unaccepted" ? states.filter((s) => !s.accepted) : states

  if (!shown.length) {
    // TWO DIFFERENT EMPTIES, and they are not the same news. Nothing recorded at all means the
    // instrument may never have run; nothing left after filtering means everything is accepted,
    // which is the good outcome and must not read like the bad one.
    return (
      <p className="corpus-states__empty">
        {states.length
          ? "Every recorded state has been accepted."
          : `No states recorded${regionId ? ` for ${regionId}` : ""} yet.`}
      </p>
    )
  }

  return (
    <>
      {/* SAY WHAT IS BEING WITHHELD. Without this the list looks complete whatever the filter says,
          which is a real reading hazard — and it is also what made the region's flow unassertable:
          `flow-mutation` correctly refused a step whose assertion held under any filter, because
          nothing the filter decided was ever rendered. A coupling nobody can see is one no flow can
          prove. */}
      {filter === "unaccepted" ? (
        <p className="corpus-states__caption">Showing only states nobody has accepted.</p>
      ) : null}
      <ol className="corpus-states">
        {shown.map((state) => (
          <li key={state.id} className="corpus-states__row">
          <div className="corpus-states__head">
            <code className="corpus-states__id">{state.id}</code>
            <span className="corpus-states__share">
              {percent(state.share)} · {state.count}×
            </span>
            {state.accepted ? <span className="corpus-states__accepted">accepted</span> : null}
          </div>
          <dl className="corpus-states__keys">
            {Object.entries(state.fingerprint).map(([key, value]) => (
              <div key={key} className="corpus-states__key">
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </li>
        ))}
      </ol>
    </>
  )
}
