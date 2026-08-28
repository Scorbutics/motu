// How a selected project turns into a list of shots — ONCE, for both places that need it.
//
// This used to be two effects inside `App.tsx`: fetch when `selectedRepo` moves, and fetch again after
// an accept. That made the region's headline coupling — "picking a repo changes what the list shows" —
// something only the PAGE could perform. The lagoon has no page, so clicking a project card there did
// nothing at all: the seed named one repo, the shot list rendered that repo's shots, and every card
// after the first was inert. A reviewer looking at the published lagoon sees a console that appears
// broken, and no check disagrees, because nothing declared the coupling anywhere a check can reach.
//
// A source is where it belongs. The page installs it over the real host; the lagoon installs the same
// object over fixtures with `channelFrom`. One implementation, and the coupling becomes something a
// region flow can drive.
//
// It owns no framework and no motu: plain functions and a subscription.
import type { Source } from "@motu/types"
import type { ReviewRegion } from "@/app/console/review-region"
import type { Shot } from "./host"

/** What the source needs from the world. Production passes the host client; the lagoon passes fixtures. */
export interface ShotsPort {
  list(repo: string): Promise<Shot[]>
  accept(repo: string, island?: string, shot?: string): Promise<unknown>
}

export type ShotsKeys = "shots" | "busy" | "error"

const EMPTY: Pick<ReviewRegion, ShotsKeys> = { shots: [], busy: false, error: null }

export function createShotsSource(port: ShotsPort) {
  let state = EMPTY
  let repo: string | null = null
  // Which selection the answers belong to. Click three projects quickly and the slowest reply can land
  // last — putting one project's shots under another project's name, which reads as the bug this file
  // exists to fix rather than as a race.
  let generation = 0
  const listeners = new Set<() => void>()

  /** A NEW object on change and the SAME one otherwise, so `useSyncExternalStore` can trust it. */
  const set = (next: Partial<Pick<ReviewRegion, ShotsKeys>>) => {
    state = { ...state, ...next }
    listeners.forEach((l) => l())
  }

  const load = async () => {
    if (!repo) {
      // No project selected is a STATE, not an absence of one: an empty list, not the previous
      // project's shots left on screen under nobody's name.
      set({ shots: [], busy: false, error: null })
      return
    }
    const mine = ++generation
    set({ busy: true, error: null })
    try {
      const shots = await port.list(repo)
      if (mine !== generation) return
      set({ shots, busy: false })
    } catch (e) {
      if (mine === generation) set({ busy: false, error: (e as Error).message })
    }
  }

  const api = {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getState: () => state,

    /**
     * Accepting is the host's to perform, and its answer is whatever the statuses then are — so this
     * POSTs and REFETCHES rather than editing `shots` in place. An island that wrote the new statuses
     * would be claiming a result only the host can give.
     */
    async accept(island?: string, shot?: string) {
      if (!repo) return
      const mine = ++generation
      set({ busy: true, error: null })
      try {
        await port.accept(repo, island, shot)
        const shots = await port.list(repo)
        if (mine !== generation) return
        set({ shots, busy: false })
      } catch (e) {
        if (mine === generation) set({ busy: false, error: (e as Error).message })
      }
    },

    /**
     * What this source answers when an ISLAND asks the host for something.
     *
     * The accept bar cannot accept — the result is whatever the host then says the statuses are — so
     * it asks, and this is the answer. Declaring it here means no composition root names it: the page
     * passes intents on, and whatever source claims one handles it. The lagoon's channel installs
     * this same object, so accepting works there too, against fixtures.
     */
    intents: {
      // `api.accept(...)`, not a reference to the source's own type inside the object defining it.
      'review-accept': (detail: unknown) => {
        const { island, shot } = (detail ?? {}) as { island?: string; shot?: string }
        void api.accept(island, shot)
      },
    },

    /** The region keys this source consumes — declared once, for the page and the lagoon alike. */
    inputs: ["selectedRepo"] as const,
    applyInputs(values: Partial<ReviewRegion>) {
      const next = (values.selectedRepo as string | null) ?? null
      if (next === repo) return
      repo = next
      void load()
    },

    dispose() {
      generation++
      listeners.clear()
    },
  }
  return api
}

/** The source, as the region refers to it. */
export const shotsSource: Source<ReviewRegion, ShotsKeys, [ShotsPort]> = {
  create: createShotsSource,
  produces: ["shots", "busy", "error"],
}
