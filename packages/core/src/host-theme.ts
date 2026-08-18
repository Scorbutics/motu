// Generic host-theme absorption. Shadow DOM blocks the host's selector styles from reaching islands,
// but CSS custom properties inherit across the boundary. In the legacy skin islands read a small token
// contract — colour (`--x-color-*`) AND shape (`--x-border`, `--x-radius`, …) — while the motu skin
// hardcodes its own look and ignores them. This SAMPLES real computed values off host elements and
// republishes them as those tokens, so legacy-skin islands adopt the host's exact palette and shape
// instead of reimplementing them.
//
// It stays layout-agnostic: the CALLER (composition root) says which host element carries each value,
// since only the embedder knows its own markup. Values that render later (SPA) are picked up via an
// observer.

export interface HostThemeSource {
  /** Selector for a host element that carries the value. */
  selector: string;
  /** Computed property to read from it. Defaults to 'background-color'. */
  property?: string;
  /** Custom property to publish. Defaults to `--x-color-<token>` (the map key). */
  into?: string;
}

// Values that mean "nothing to adopt" — skipped so a token keeps its stylesheet fallback. Only colours
// are ever 'transparent'/rgba(0,0,0,0), so this is safe for structural properties (a radius is a px).
const EMPTY = new Set(['', 'transparent', 'rgba(0, 0, 0, 0)']);

/**
 * Samples host values into the island token contract. Each entry names WHERE to read a value and, via
 * `into`, WHICH custom property to publish (default `--x-color-<token>`):
 *   absorbHostTheme({
 *     primary: { selector: '.app-header' },                                        // -> --x-color-primary
 *     border:  { selector: 'input', property: 'border-top-color', into: '--x-border' },
 *     radius:  { selector: 'input', property: 'border-top-left-radius', into: '--x-radius' },
 *   });
 * Non-blocking: elements that appear later are resolved via a MutationObserver that disconnects once
 * every token is set, or after `timeoutMs` (so a source that never renders can't observe forever).
 */
export function absorbHostTheme(
  tokens: Record<string, HostThemeSource>,
  target: HTMLElement = document.documentElement,
  timeoutMs = 5000,
): void {
  const pending = new Map(Object.entries(tokens));

  const resolve = (): boolean => {
    for (const [token, src] of pending) {
      const el = document.querySelector(src.selector);
      if (!el) continue;
      const value = getComputedStyle(el).getPropertyValue(src.property ?? 'background-color').trim();
      if (!EMPTY.has(value)) {
        target.style.setProperty(src.into ?? `--x-color-${token}`, value);
        pending.delete(token);
      }
    }
    return pending.size === 0;
  };

  if (resolve()) return;
  const observer = new MutationObserver(() => {
    if (resolve()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), timeoutMs);
}
