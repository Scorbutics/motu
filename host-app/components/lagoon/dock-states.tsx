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
import { List } from "@motu/chrome/react"
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
      {rows.map((row) => (
        <button
          key={row.key}
          type="button"
          className={compact ? "dock-chip" : "dock-opt"}
          title={row.label}
          aria-current={row.value === flow ? "true" : "false"}
          onClick={pick(row.value)}
        >
          {/* WHICH ONE IS SHOWING, VISIBLY. `aria-current` is an attribute — a screen reader
              announces it and nothing a person LOOKS at changes, and these controls have no
              stylesheet of their own yet, so the lit row was distinguishable by nothing at all.
              `data-flow` caught it: six scenarios producing five distinct renders, because "as
              seeded" and "a flow is showing" render the same words. An aria-label saying "(showing)"
              did NOT fix it — the captured surface prefers a control's text when it has some, which
              is the right call and means the marker has to be text too. */}
          {!compact && <span className="dock-lamp" aria-hidden="true">{row.value === flow ? "▸" : ""}</span>}
          {compact && row.value === flow ? "▸ " : ""}
          {row.label}
        </button>
      ))}
    </List>
  )
}
