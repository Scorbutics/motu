"use client"
// The states of the region on screen: "As seeded", and every flow it declares.
//
// ONE ISLAND, PLACED TWICE. The panel's list on a desktop and the strip on a phone's bar are the same
// control in two arrangements — `layout` decides which slot is filled, and the `compact` prop decides
// how it draws. They are deliberately NOT two islands: "either of these writes `flow`" is not a
// producer, and motu's ownership guard is right to refuse it. peps hit this first with a filter panel
// that appears in a sidebar and in a mobile drawer.
//
// "AS SEEDED" IS NOT A FLOW. It is the region as the page establishes it, so it is `null` rather than
// a member of the list — every flow is something applied on top of it. Rendering it as the first row
// is a presentation decision made here; the region never holds a state by that name, which is why
// nothing can fail to find it.
import { useCallback } from "react"
import { List, ListItem, Row } from "@motu/chrome/react"
import type { LagoonState } from "@/app/lagoon-view-region"

export interface DockStatesProps {
  states?: LagoonState[]
  /** The state showing, or null for "as seeded". Held by the region — see the file header. */
  flow?: string | null
  /** The phone bar's strip: one scrolling line of chips instead of a column of rows. */
  compact?: boolean
  onFlowChange?: (flow: string | null) => void
}

const SEEDED = "As seeded"

export function DockStates({ states = [], flow = null, compact = false, onFlowChange }: DockStatesProps) {
  const pick = useCallback((name: string | null) => () => onFlowChange?.(name), [onFlowChange])

  // WHAT ARRIVES HERE CAME OUT OF ANOTHER DOCUMENT'S GLOBALS. `states` is read off the framed
  // artifact's catalogue, so "an array of names" is what it is supposed to be rather than what it is
  // guaranteed to be — an older artifact, a half-booted one, or a build that shipped something else
  // all reach this prop. Mapping a non-array throws during render, which takes the whole island out:
  // `flow-mutation` caught exactly that, reporting the slot as never mounted rather than as wrong.
  const list = Array.isArray(states) ? states : []

  // A STATE BELONGS TO THE REGION THAT DECLARES IT.
  //
  // `flow` naming something this region does not declare means no declared state is showing — which
  // IS the seeded state, so that is what reads as current. Without this, switching region left the
  // strip holding the previous region's state name: every row unmarked, including "As seeded", so
  // the screen showed a set of states with none of them current and no way to see which you were in.
  //
  // A COMPONENT RULE RATHER THAN A SECOND WRITER, deliberately. The obvious fix is to have the
  // station list clear `flow` when it changes `region` — and that is two islands writing one key,
  // which the ownership guard refuses and is right to: "either of these writes it" is not a producer.
  // Validity against the current list is derivable from what this island already has, so nothing has
  // to be owned twice.
  const showing = list.some((s) => s.name === flow) ? flow : null

  // A REGION WITH NO FLOWS HAS ONE STATE, and it is the one you are looking at. On the phone strip
  // that means standing down entirely rather than drawing a lone "As seeded" chip that cannot do
  // anything — a control whose only act is the state you are already in.
  if (compact && list.length === 0) return null

  const rows: Array<{ key: string; label: string; value: string | null }> = [
    { key: "__seeded", label: SEEDED, value: null },
    ...list.map((s) => ({ key: s.name, label: s.name, value: s.name })),
  ]

  return (
    <List aria-label="States" data-compact={compact ? "true" : "false"}>
      {rows.map((row, i) => (
        // A LIST ITEM, because `List` is a <ul> and a <ul> may only contain <li>. Buttons dropped
        // straight in were a SERIOUS axe finding in every scenario of both islands — invisible until
        // the sheet existed and `--audit` had something to measure.
        <ListItem key={row.key} index={i}>
          <Row
            as="button"
            className={compact ? "dock-chip" : "dock-opt"}
            surface="card"
            current={row.value === showing}
            title={row.label}
            onClick={pick(row.value)}
          >
            {/* WHICH ONE IS SHOWING, VISIBLY — and in TEXT rather than in colour alone. `aria-current`
                is an attribute a screen reader announces and nothing a person LOOKS at; an aria-label
                saying "(showing)" did not fix it either, because the captured surface prefers a
                control's own text. `data-flow` found it as six scenarios producing five distinct
                renders. It stays now that there is colour, for the reason axe rejects a link that is
                only blue. */}
            {!compact && <span className="dock-lamp" aria-hidden="true">{row.value === showing ? "\u25b8" : ""}</span>}
            {compact && row.value === showing ? "\u25b8 " : ""}
            {row.label}
          </Row>
        </ListItem>
      ))}
    </List>
  )
}
