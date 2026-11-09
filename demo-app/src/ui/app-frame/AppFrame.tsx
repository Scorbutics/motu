import type { ReactNode } from 'react';

export interface AppFrameProps {
  /** The sidebar — the shell region. */
  sidebar?: ReactNode;
  /** Whatever the route renders beside it. */
  main?: ReactNode;
}

/**
 * THE APP'S LAYOUT: the club's paper, one aged sheet, the sidebar beside the page.
 *
 * Extracted from `App.tsx` so it exists ONCE. The app renders it around its routed page, and the
 * lagoon's SCREENS render the same component with a region in each prop — the rule a region's `root`
 * already follows: a screen points at the application's own layout, never a second drawing of it.
 *
 * Not an island and not a region: it shows nothing and acts on nothing, it arranges. The frame
 * carries the skin marker the island tokens resolve against (`--cl-*`, `--mc-*`), so every page
 * inside it inherits them.
 */
export function AppFrame({ sidebar, main }: AppFrameProps) {
  return (
    <div className="app__frame cl-paper motu-root" data-motu-theme="motu">
      <div className="app__sheet cl-sheet cl-aged">
        <div className="app__side">{sidebar}</div>
        <div className="app__main">{main}</div>
      </div>
    </div>
  );
}
