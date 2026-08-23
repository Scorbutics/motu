// motu's own chrome, installed here rather than copied here.
//
// This console had its own `:root` block spelling out the water ramp, the ink and the line — the same
// palette `@motu/chrome` already owns and the lagoon, the dock and the seam lens already paint from.
// Two copies of one palette do what two copies of anything do: `--line` had drifted to .14 against
// the framework's .12, and `--panel` had become a flat colour where the framework's is a gradient. Not
// enough to notice in isolation, which is the point — the console looked almost like motu, and
// "almost" is what made the two feel like different products in the same screenshot.
//
// So the tokens come from the package now, and this file only says WHERE they go in. The console keeps
// the handful that are genuinely its own — a review verdict is not a framework concept.
// The ROOT export, which is the one that carries types — the subpaths are untyped .mjs.
import { motuChromeCss } from '@motu/chrome'

const STYLE_ID = 'motu-chrome'

/**
 * Put motu's chrome into the document, once.
 *
 * Called from BOTH entries — the application's root and the lagoon's `setup` — because the console is
 * looked at in both and a palette that arrives in only one is the drift this removes, one level down.
 * Idempotent: the lagoon re-runs setup on a hot reload.
 */
export function installMotuChrome(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  // FIRST in the head, so the console's own stylesheet still wins where it means to override — the
  // framework supplies the vocabulary, the app decides what to do with it.
  style.textContent = motuChromeCss('mock')
  document.head.prepend(style)
}
