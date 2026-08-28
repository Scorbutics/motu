// The root layout — and the reason it exists is a bug, not a convention.
//
// There was no `app/layout.tsx` at all. Next generates a default one, which is a bare <html><body>
// with no stylesheet, so the front page rendered as unstyled markup: purple underlined links on
// white. Every check passed. `motu check` was green, the runtime lane was green, the islands mounted,
// the flows ran, `curl | grep` found every tag and every string I looked for.
//
// It is the failure CLAUDE.md already names — "an island stylesheet that was bundled and never
// applied … passed every check; found by opening the page" — and I reproduced it while quoting the
// rule, because I verified by grepping for content instead of looking at a screen.
//
// WHAT THE STYLING IS. `views.mjs` renders these pages through `motuPage`, whose head is
// `<style>${motuChromeCss()}${PAGE_CSS}</style>`. A React page gets no such shell, so the equivalent
// goes here — imported rather than copied, so the two cannot disagree about their own gutters.
//
// PAGE_SHELL_CSS AND NOT PAGE_CSS, and the difference is not pedantry: PAGE_CSS is the shell PLUS
// overrides written for the SERVER's row shape ("a server row stacks a label over a sub, so it aligns
// on the first baseline"). Handed to the React kit those fight it — the first attempt rendered with
// every panel caption clipped off the left edge, which is what reusing "the page's CSS" gets you when
// you have not read which half of the page it describes. The kit styles its own components; this only
// has to give them a column to sit in.
import type { ReactNode } from 'react';
// @motu/chrome is plain ESM node; tsc reads it through allowJs.
import { motuChromeCss, PAGE_SHELL_CSS } from '@motu/chrome';
// The islands' own sheet. Imported ONCE, globally, rather than from each component: a component-level
// import works, and it means an island added later is unstyled until somebody remembers.
import 'motu-host-islands/styles.css';

export const metadata = { title: 'motu lagoons' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Inlined, exactly as `motuPage` does it. A <link> would be a second request in front of the
            first paint of a page whose entire job is to be instantly readable. */}
        <style dangerouslySetInnerHTML={{ __html: `${motuChromeCss()}${PAGE_SHELL_CSS}` }} />
      </head>
      {/* `.motu-root` IS LOAD-BEARING, and its absence is invisible.
          The islands' stylesheet declares its --_* locals on `:where(:host, .motu-root)` — the shared
          sheet's own note: "in light isolation it is injected once globally and the island root
          carries a .motu-root marker". In the LAGOON that marker comes from the element registry
          mounting each island, so everything is styled and every check is green. On the real page the
          components are rendered directly, the marker never appears, and every token-driven property
          — border, background, the button's colour — resolves to nothing while padding and font still
          work. It renders as a plausible, wrong screen that no check can see.
          The whole of this host IS a motu surface, so the marker belongs on the body. */}
      <body className="motu-root">{children}</body>
    </html>
  );
}
