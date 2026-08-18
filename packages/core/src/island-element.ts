// The single, framework-agnostic placement marker: <motu-island slot="…">. It relies only on the
// custom-element lifecycle — no AngularJS directive, no digest — so the same markup works in the
// standalone app, a plain DOM page, or inside an AngularJS template.
//
// Progressive replacement: in the legacy app, WRAP the original fragment and mark it
// `legacy-toggle="true"`:
//     <motu-island slot="member-results" legacy-toggle="true"> …legacy html… </motu-island>
// Nothing shows by default. On hover (desktop) or tap (mobile) a subtle card shadow highlights the
// element and an on/off switch appears; toggling swaps the wrapped legacy fragment for the motu
// island. Defaults OFF (prod shows legacy) and the choice persists in localStorage per slot.

import { mountIsland, getSlotStore } from './archipelago.js';
import { isPreviewOn, subscribePreview } from './preview.js';
import { runWithWriteSource } from './store.js';

// Stripped in production: host-origin write tagging for the debug overlay.
declare const __MOTU_DEBUG__: boolean;
const DEBUG = typeof __MOTU_DEBUG__ !== 'undefined' && __MOTU_DEBUG__;

interface Mounted extends HTMLElement {
  __motuDispose?: () => void;
}

const STYLE_ID = 'motu-island-style';

// Injected once. Scoped entirely to the motu-island tag, so it can't leak into the host's CSS.
function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
motu-island { display: block; }
.motu-host { transition: box-shadow .15s ease; }
.motu-host:hover,
.motu-host:focus-within,
.motu-host.motu-active {
  box-shadow: 0 0 0 1px rgba(90,103,242,.30), 0 12px 32px rgba(16,42,67,.14);
}
.motu-host .motu-controls {
  position: absolute; top: 8px; right: 8px; z-index: 30;
  display: inline-flex; align-items: center; gap: 8px;
  padding: 5px 10px; border-radius: 999px;
  background: rgba(255,255,255,.92); -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px);
  box-shadow: 0 2px 10px rgba(16,42,67,.20);
  font: 600 11px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif; color: #475569;
  opacity: 0; pointer-events: none; transition: opacity .15s ease;
}
.motu-host:hover .motu-controls,
.motu-host:focus-within .motu-controls,
.motu-host.motu-active .motu-controls {
  opacity: 1; pointer-events: auto;
}
.motu-controls .motu-switch {
  position: relative; width: 34px; height: 18px; border: 0; border-radius: 999px;
  padding: 0; cursor: pointer; flex: none; background: #cbd5e1; transition: background .15s;
}
.motu-controls .motu-switch[aria-checked="true"] { background: #1a6ba8; }
.motu-controls .motu-switch > span {
  position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%;
  background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.25); transition: transform .15s;
}
.motu-controls .motu-switch[aria-checked="true"] > span { transform: translateX(16px); }
.motu-controls__label { white-space: nowrap; }
`;
  document.head.appendChild(style);
}

// Tap-to-reveal on touch: a click outside a revealed island clears its revealed state.
let revealBound = false;
function bindReveal(): void {
  if (revealBound) return;
  revealBound = true;
  document.addEventListener(
    'click',
    (e) => {
      document.querySelectorAll('.motu-host.motu-active').forEach((el) => {
        if (!el.contains(e.target as Node)) el.classList.remove('motu-active');
      });
    },
    true,
  );
}

function readFlag(key: string): 'on' | 'off' | null {
  try {
    const v = localStorage.getItem(key);
    return v === 'on' || v === 'off' ? v : null;
  } catch {
    return null;
  }
}

function writeFlag(key: string, value: 'on' | 'off'): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage may be unavailable (private mode); the toggle still works for the session.
  }
}

export function defineIslandElement(tag = 'motu-island'): void {
  if (customElements.get(tag)) return;

  class MotuIsland extends HTMLElement {
    #child?: Mounted | null;
    #controls?: HTMLElement;
    #switch?: HTMLButtonElement;
    #host?: HTMLElement;
    #enabled = true;
    #embedded = false;
    #forcedTheme = '';
    #forcedFit = '';
    #slot = '';
    #inited = false;
    #unsubPreview?: () => void;
    #legacyObserver?: MutationObserver;

    connectedCallback() {
      const slot = this.getAttribute('slot');
      if (!slot) {
        console.warn('motu: <motu-island> requires a slot attribute');
        return;
      }
      if (this.#inited) {
        // Reconnected (e.g. Angular re-link): re-apply rather than re-initialising.
        this.#apply();
        return;
      }
      this.#inited = true;
      this.#slot = slot;
      // Force a skin regardless of the element default (the archipelago layout pins islands to motu).
      this.#forcedTheme = this.getAttribute('theme') ?? '';
      // Force a footprint the same way. The archipelago pins islands to the native shape; embedded
      // legacy-toggle falls back to legacy fit below so islands adopt the host's form-factor.
      this.#forcedFit = this.getAttribute('fit') ?? '';

      // legacy-toggle="true": manual per-island soft-migration switch (hover-revealed). When toggled
      // on it mounts the island in the host skin so it blends into the legacy page. Default OFF.
      const togglable = this.getAttribute('legacy-toggle') === 'true';
      this.#embedded = togglable;
      this.#enabled = this.#initialEnabled(togglable);

      if (togglable && this.parentElement) {
        ensureStyle();
        bindReveal();
        this.#host = this.parentElement;
        this.#host.classList.add('motu-host');
        this.#renderControls();
        // Tap-to-reveal on touch: revealing the controls when the host region is tapped.
        this.#host.addEventListener('click', (e) => {
          if ((e.target as HTMLElement).closest('.motu-controls')) return;
          this.#host?.classList.add('motu-active');
        });
        // A whole-region preview supersedes individual toggles: go dormant while it's on so the same
        // island (member-header, etc.) isn't shown twice (here AND in the archipelago layout).
        this.#unsubPreview = subscribePreview(() => this.#apply());
      }
      this.#apply();
    }

    // Inbound seam (framework-neutral): the host feeds this island's data by calling this plain DOM
    // method on the <motu-island> marker (which is always in the host's light DOM), so any ocean can
    // do it in its own syntax. It writes the slot's store; the mounted island receives it as a bound
    // prop. Isolation-agnostic — the island inside may be shadow or light.
    provide(key: string, value: unknown) {
      const store = getSlotStore(this.#slot || this.getAttribute('slot') || '');
      if (!store) {
        console.warn(`motu: <motu-island slot="${this.getAttribute('slot')}"> has no store to provide("${key}")`);
        return;
      }
      // Tag as a host-origin (external) write so the overlay classifies this key as coming from
      // outside the archipelago (the ocean feeding in via the provide seam).
      if (DEBUG) runWithWriteSource('host', () => store.set(key, value));
      else store.set(key, value);
    }

    disconnectedCallback() {
      this.#unsubPreview?.();
      this.#unsubPreview = undefined;
      this.#unobserveLegacy();
      this.#unmountChild();
      this.#controls?.remove();
      this.#controls = undefined;
      this.#host?.classList.remove('motu-host', 'motu-active');
    }

    #key() {
      return `motu:island:${this.#slot}`;
    }

    // No toggle -> island always mounts (e.g. standalone). With legacy-toggle it defaults OFF so prod
    // shows the legacy fragment until someone opts in; the choice then persists per slot.
    #initialEnabled(togglable: boolean): boolean {
      if (!togglable) return true;
      const stored = readFlag(this.#key());
      return stored ? stored === 'on' : false;
    }

    // The legacy node(s) this island stands in for — left in place (NOT re-nested) so the host's own
    // CSS keeps matching (e.g. `.section-content > h1`). Hidden while the island is shown.
    #replaced(): HTMLElement[] {
      const sel = this.getAttribute('replaces');
      if (!sel) return [];
      try {
        return Array.from(document.querySelectorAll(sel)) as HTMLElement[];
      } catch {
        return [];
      }
    }

    #apply() {
      const legacy = this.#replaced();
      // While a whole-region preview owns the screen, a legacy-toggle island steps aside: it unmounts
      // its own island and leaves the legacy node alone (the region's preview-of hid it). Otherwise the
      // header/etc. would render twice — once here, once in the archipelago layout.
      const dormant = this.#embedded && isPreviewOn();
      if (this.#enabled && !dormant) {
        legacy.forEach((n) => (n.style.display = 'none'));
        // Keep them hidden even if the host redraws them (e.g. re-entering the route repaints the
        // legacy header after we hid it — the classic "double header" on navigation).
        this.#observeLegacy(legacy);
        if (!this.#child) this.#child = mountIsland(this.#slot, this) as Mounted | null;
        // A pinned skin (archipelago layout) wins; otherwise a manually-toggled island adopts the
        // host skin (legacy). Standalone islands have neither, keeping their element default (motu).
        if (this.#forcedTheme) {
          this.#child?.setAttribute('data-motu-theme', this.#forcedTheme);
        } else if (this.#embedded) {
          this.#child?.setAttribute('data-motu-theme', 'legacy');
        }
        // Footprint axis (independent of skin). A pinned fit (archipelago layout) wins; otherwise a
        // manually-toggled island adopts the legacy footprint so it blends into the host layout.
        if (this.#forcedFit) {
          this.#child?.setAttribute('data-motu-fit', this.#forcedFit);
        } else if (this.#embedded) {
          this.#child?.setAttribute('data-motu-fit', 'legacy');
        }
      } else {
        this.#unobserveLegacy();
        this.#unmountChild();
        // Dormant (preview owns it): don't touch the legacy node — the region decides its visibility.
        if (!dormant) legacy.forEach((n) => (n.style.display = ''));
      }
      this.#syncControls();
    }

    // Keep the replaced legacy node(s) hidden across host re-renders: watch their parents for the node
    // being re-added and the nodes themselves for their display being reset, and re-hide.
    #observeLegacy(nodes: HTMLElement[]) {
      this.#unobserveLegacy();
      if (!nodes.length) return;
      const obs = new MutationObserver(() => {
        if (!this.#enabled || (this.#embedded && isPreviewOn())) return;
        // Re-query (the host may have swapped in a fresh node), re-hide, and re-attach the style watch
        // to whatever the current node is.
        for (const n of this.#replaced()) {
          if (n.style.display !== 'none') n.style.display = 'none';
          obs.observe(n, { attributes: true, attributeFilter: ['style'] });
        }
      });
      const parents = new Set<Node>();
      for (const n of nodes) {
        if (n.parentNode) parents.add(n.parentNode);
        obs.observe(n, { attributes: true, attributeFilter: ['style'] });
      }
      for (const p of parents) obs.observe(p, { childList: true });
      this.#legacyObserver = obs;
    }

    #unobserveLegacy() {
      this.#legacyObserver?.disconnect();
      this.#legacyObserver = undefined;
    }

    #unmountChild() {
      this.#child?.__motuDispose?.();
      this.#child?.remove();
      this.#child = undefined;
    }

    #toggle() {
      this.#enabled = !this.#enabled;
      writeFlag(this.#key(), this.#enabled ? 'on' : 'off');
      this.#apply();
    }

    #renderControls() {
      const bar = document.createElement('div');
      bar.className = 'motu-controls';

      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'motu-switch';
      sw.setAttribute('role', 'switch');
      sw.title = 'Show the motu island or the legacy view';
      sw.appendChild(document.createElement('span'));
      sw.addEventListener('click', (e) => {
        e.stopPropagation();
        this.#toggle();
      });

      const label = document.createElement('span');
      label.className = 'motu-controls__label';
      label.textContent = 'motu';

      bar.append(sw, label);
      this.appendChild(bar);
      this.#controls = bar;
      this.#switch = sw;
    }

    #syncControls() {
      if (!this.#switch) return;
      this.#switch.setAttribute('aria-checked', String(this.#enabled));
    }
  }

  customElements.define(tag, MotuIsland);
}
