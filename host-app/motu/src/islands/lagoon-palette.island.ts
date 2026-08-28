// Mount point for LagoonPalette: it wraps the application's OWN component rather than a copy, so the
// island cannot drift from what the app already ships.
import { islandElement } from '@motu/react';
import { LagoonPalette } from '@/components/lagoon/lagoon-palette';

// RENDERS NOTHING FROM ITS DEFAULTS, ON PURPOSE — `lagoon-render` warns about this and the warning is
// accepted rather than unnoticed. A palette is behind a keystroke: closed is its resting state and it
// draws nothing at all, which is also the check that an overlay is not leaking a scrim over a page
// nobody asked to dim. The `closed, which is almost always` scenario is that state, addressable.
export const element = islandElement({
  tag: 'x-lagoon-palette',
  component: LagoonPalette,
  options: {
    contract: {
      // WHAT IT IS TOLD: the same listing the page shows, and its own two decisions read back. It
      // searches what the viewer may see and nothing else — the list arrives already filtered by
      // `authorize`, so the palette cannot become the way around the gate.
      input: ['repos', 'open', 'query'],
      // WHAT IT DECIDES. Two keys, because they move independently: ⌘K toggles one and typing moves
      // the other, and a single `{ open, query }` would make either change a write of both.
      output: { onOpenChange: 'palette-open', onQueryChange: 'palette-query' },
      // NOTHING AMBIENT, and the ⌘K listener does not change that: `ambient` is about host MODULES,
      // and `window.addEventListener` is the platform. There is no navigation here either — every
      // entry is an anchor, so ↵ is the browser's.
      ambient: [],
    },
  },
});
