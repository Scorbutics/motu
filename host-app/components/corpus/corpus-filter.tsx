"use client"
// Which states the reader is looking at. The application's own control, wrapped as an island.
//
// It owns the region's ONE produced key. That is what makes it an island rather than page chrome:
// what it decides, another island reads.
import type { CorpusFilter as Filter } from "@/app/corpus/corpus-region"

const CHOICES: { value: Filter; label: string }[] = [
  { value: "all", label: "All states" },
  { value: "unaccepted", label: "Not yet accepted" },
]

export function CorpusFilter({
  // EVERY INPUT OPTIONAL, WITH A DEFAULT — an island must render from defaults alone, or it has no
  // empty state anyone can address.
  value = "all",
  unacceptedCount = 0,
  onFilterChange,
}: {
  value?: Filter
  /** Shown on the second choice so the reader knows whether narrowing will show them anything. */
  unacceptedCount?: number
  onFilterChange?: (value: Filter) => void
}) {
  return (
    <div className="corpus-filter" role="group" aria-label="Filter recorded states">
      {CHOICES.map((choice) => {
        const selected = choice.value === value
        return (
          <button
            key={choice.value}
            type="button"
            className={selected ? "corpus-filter__choice is-selected" : "corpus-filter__choice"}
            aria-pressed={selected}
            onClick={() => onFilterChange?.(choice.value)}
          >
            {choice.label}
            {choice.value === "unaccepted" ? (
              <span className="corpus-filter__count"> ({unacceptedCount})</span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
