"use client"
// The front page's one control: what to look for, and what to look at.
//
// AN ISLAND, and the only one here that acts. Everything else on this page is host-fed and can only
// leak; this decides two region keys, which is the definition the archipelago's `writes` records.
//
// IT OWNS NO LIST. It never sees `repos` or `groups` — it emits what the reader asked for, and the
// two listing islands narrow themselves. That is the coupling the region exists to declare: one
// island changes what another shows, and neither knows the other exists.
import { useCallback } from "react"
import { Search } from "@motu/chrome/react"

export interface LagoonFilterProps {
  query?: string
  onQueryChange?: (query: string) => void
}

export function LagoonFilter({ query = "", onQueryChange }: LagoonFilterProps) {
  const type = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => onQueryChange?.(event.target.value),
    [onQueryChange],
  )

  // THE HINT NAMES WHAT THIS BOX DOES, and it used to name what it did not: "↑↓ move · ↵ open"
  // sat here while neither key did anything from the field. ⌘K is the one keystroke this box can
  // honestly promise from where it stands.
  return (
    <Search hint="⌘K to jump">
        <input
          type="search"
          value={query ?? ""}
          onChange={type}
          placeholder="Filter lagoons and repositories"
          // THE SAME STRING as the placeholder, deliberately: a screen-reader user and a sighted
          // user being told slightly different sentences about one field is a difference nobody can see.
          aria-label="Filter lagoons and repositories"
        />
    </Search>
  )
}
