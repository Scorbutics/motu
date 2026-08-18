// The first-class archipelago region: <motu-archipelago name="members">. It renders the shared
// "new design" layout (hero + toolbar + results) registered with defineArchipelago({ layout }).
//
// Two roles, one element:
//  - Standalone: no `preview-of` — it renders the layout immediately and IS the page.
//  - Legacy: `preview-of="#a, #b"` — hidden until the floating "Preview new design" badge is on,
//    then it shows the layout and hides the named legacy region(s). This swaps the whole screen for
//    the standalone archipelago instead of flipping islands one by one. Toggle it off to return to
//    the legacy screen, where the individual <motu-island> markers remain manually toggleable.

import { getArchipelagoLayout, getArchipelagoSlots, getArchipelagoStore } from './archipelago.js';
import { ensureBadge, isPreviewOn, registerPreviewRegion, unregisterPreviewRegion } from './preview.js';
import { runWithWriteSource } from './store.js';
import { getDefaultIsolation, type IslandIsolation } from './island.js';
import type { MotuFit } from './theme.js';

// Stripped in production: host-origin write tagging for the debug overlay.
declare const __MOTU_DEBUG__: boolean;
const DEBUG = typeof __MOTU_DEBUG__ !== 'undefined' && __MOTU_DEBUG__;

const STYLE_ID = 'motu-arch-style';
const LIGHT_STYLE_ID = 'motu-arch-light-style';

// Region-level layout, needed WHEREVER the islands render: inside the archipelago's shadow root
// (default) or, for the light mode, injected globally. motu-island must be block so the flex layout
// lays its slots out. Host-level rules (display + the preview-of scroll var) stay global below.
const ARCH_LAYOUT_CSS = `
.gm-arch { max-width: 1440px; margin: 22px auto; padding: 0 20px; display: flex; flex-direction: column; gap: 16px; }
.gm-arch__toolbar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.gm-arch__toolbar > motu-island { display: block; }
.gm-arch__grow { flex: 1 1 200px; min-width: 0; }
motu-island { display: block; }
/* Gallery view: each mountpoint (slot) framed on its own, standing in for its distinct ocean
   callsite. This is the NEUTRAL cell chrome; per-slot geometry is supplied by the composition root
   (an authored/recorded frame keyed by [data-motu-arch][data-motu-slot]). */
.motu-gallery { max-width: 1440px; margin: 22px auto; padding: 0 20px; display: flex; flex-direction: column; gap: 18px; }
.motu-frame { position: relative; border: 1px dashed color-mix(in srgb, currentColor 22%, transparent); border-radius: 10px; }
/* Cells never clip (a popover/modal island must be able to escape its frame). An interacted cell
   raises above later siblings so the escaped content paints on top instead of under the next cell. */
.motu-frame:hover, .motu-frame:focus-within { z-index: 2; }
.motu-frame__label { display: flex; gap: 8px; align-items: center; border-radius: 10px 10px 0 0; font: 500 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .04em; text-transform: uppercase; padding: 6px 10px; color: color-mix(in srgb, currentColor 55%, transparent); background: color-mix(in srgb, currentColor 5%, transparent); }
.motu-frame__stage { padding: 16px; }`;

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
motu-archipelago { display: block; }
/* Embedded preview lives in the legacy fixed viewport, so opt the results list into auto-fit
   (--gm-scroll-fit) — it measures its own top and fills to the viewport bottom. Standalone has no
   preview-of, so the list keeps growing and the page scrolls. */
motu-archipelago[preview-of] { --gm-scroll-fit: 1; }`;
  document.head.appendChild(style);
}

// Light isolation mode: islands render in light DOM with no shadow anywhere, so the region + island
// styles must be injected globally (once). They are all .gm-* / motu-* scoped.
function ensureLightStyle(css: string): void {
  if (document.getElementById(LIGHT_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = LIGHT_STYLE_ID;
  style.textContent = css + ARCH_LAYOUT_CSS;
  document.head.appendChild(style);
}

/**
 * Registers <motu-archipelago>. The region owns the isolation boundary for all its islands:
 *  - isolation="shadow" (default): one shadow root + one adopted stylesheet; nested islands render
 *    light inside it (no per-island shadow — that overhead is what this collapses).
 *  - isolation="light": no shadow at all; region + island styles injected globally.
 */
export function defineArchipelagoElement(tag = 'motu-archipelago', css = ''): void {
  if (customElements.get(tag)) return;

  // One shared stylesheet for the whole region's shadow (island css + region layout).
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css + ARCH_LAYOUT_CSS);

  class MotuArchipelago extends HTMLElement {
    // `fit` flips the WHOLE region's footprint between the native end-design and the legacy soft-
    // migration view; it fans out to every island (each reads its own data-motu-fit).
    static observedAttributes = ['fit'];
    #rendered = false;
    #previewOf = '';
    #inited = false;
    #isolation: IslandIsolation = 'shadow';
    #fit: MotuFit = 'native';
    #fitObserver?: MutationObserver;

    attributeChangedCallback(name: string, _old: string | null, value: string | null) {
      if (name !== 'fit') return;
      this.#fit = value === 'legacy' ? 'legacy' : 'native';
      if (this.#rendered) this.#applyFit();
    }

    connectedCallback() {
      if (this.#inited) {
        this.#sync();
        return;
      }
      this.#inited = true;
      ensureStyle();
      this.#fit = this.getAttribute('fit') === 'legacy' ? 'legacy' : 'native';
      const isoAttr = this.getAttribute('isolation');
      // Region isolation: explicit attribute wins; otherwise the project-wide default (light for a
      // migration ocean lets one document-level theme cascade into every island).
      this.#isolation = isoAttr === 'light' ? 'light' : isoAttr === 'shadow' ? 'shadow' : getDefaultIsolation();
      this.#previewOf = this.getAttribute('preview-of') ?? '';
      // The archipelago region IS the new design, so it carries the motu skin: reflecting it on the
      // element (the shadow host / light root) is what lets the shared sheet's motu-variant rules
      // (:host([data-motu-theme]) / .motu-root[...]) drive the gradient + radius + hero banner for
      // the whole region — nested islands inherit those tokens. Override with theme="legacy" if needed.
      this.setAttribute('data-motu-theme', this.getAttribute('theme') || 'motu');

      if (this.#previewOf) {
        registerPreviewRegion(this);
        ensureBadge();
        this.#sync();
      } else {
        // Standalone / plain page: the archipelago is the content, always shown.
        this.#render();
      }
    }

    disconnectedCallback() {
      unregisterPreviewRegion(this);
      this.#fitObserver?.disconnect();
      this.#fitObserver = undefined;
      // Leaving the page while previewing: restore the legacy region we hid (the shell banner
      // persists across routes, so it must not stay hidden on other pages).
      this.#region().forEach((n) => (n.style.display = ''));
    }

    __applyPreview(on: boolean) {
      this.#sync(on);
    }

    // Inbound seam (framework-neutral): the host feeds region data by calling this plain DOM method on
    // THIS element, so any ocean can do it in its own syntax (AngularJS via the motuProvide directive,
    // Vue :prop, vanilla assignment). It writes the region store; bound islands receive it as props.
    // Isolation-agnostic — the element itself is always in the host's light DOM, whether the region
    // renders shadow or light inside.
    provide(key: string, value: unknown) {
      const store = getArchipelagoStore(this.getAttribute('name') ?? '');
      if (!store) {
        console.warn(`motu: <motu-archipelago name="${this.getAttribute('name')}"> has no store to provide("${key}")`);
        return;
      }
      // Tag as a host-origin (external) write so the overlay classifies this key as coming from
      // outside the archipelago (the ocean feeding the region via the provide seam).
      if (DEBUG) runWithWriteSource('host', () => store.set(key, value));
      else store.set(key, value);
    }

    // The legacy region(s) this archipelago stands in for while previewing.
    #region(): HTMLElement[] {
      if (!this.#previewOf) return [];
      try {
        return Array.from(document.querySelectorAll(this.#previewOf)) as HTMLElement[];
      } catch {
        return [];
      }
    }

    #sync(on = isPreviewOn()) {
      if (!this.#previewOf) return;
      if (on) {
        this.#render();
        this.style.display = '';
        this.#region().forEach((n) => (n.style.display = 'none'));
      } else {
        this.style.display = 'none';
        this.#region().forEach((n) => (n.style.display = ''));
      }
    }

    #render() {
      if (this.#rendered) return;
      const name = this.getAttribute('name') ?? '';
      // Two spatial views of the same (store-sharing) archipelago: the consolidated `layout` region,
      // or a mountpoint GALLERY that frames each slot on its own — the offline stand-in for islands
      // scattered across distinct ocean callsites. Gallery is used on request (view="mountpoints") or
      // when the archipelago declares no layout (it's distributed by nature).
      const gallery = this.getAttribute('view') === 'mountpoints';
      const layout = !gallery ? getArchipelagoLayout(name) : undefined;
      const html = layout ?? this.#galleryLayout(name);
      if (!html) {
        console.warn(`motu: archipelago "${name}" has no layout and no slots to render`);
        return;
      }
      // The layout's <motu-island> markers upgrade and mount on insertion; nested islands see this
      // archipelago as their ancestor and render light, sharing the region boundary/stylesheet.
      if (this.#isolation === 'shadow') {
        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [sheet];
        const root = document.createElement('div');
        shadow.append(root);
        root.innerHTML = html;
      } else {
        ensureLightStyle(css);
        this.classList.add('motu-root');
        this.innerHTML = html;
      }
      this.#rendered = true;
      this.#applyFit();
    }

    // Synthesize a gallery layout: one framed cell per slot, each holding the slot's <motu-island>
    // marker (which mounts bound to the SHARED store, so cross-island reactivity still flows). Carries
    // the archipelago name + slot on each cell so a composition root can key a per-mountpoint frame.
    #galleryLayout(name: string): string {
      const cells = getArchipelagoSlots(name)
        .map(
          (slot) =>
            `<section class="motu-frame" data-motu-arch="${name}" data-motu-slot="${slot}">` +
            `<header class="motu-frame__label"><span>${slot}</span></header>` +
            `<div class="motu-frame__stage"><motu-island slot="${slot}" theme="motu" fit="native"></motu-island></div>` +
            `</section>`,
        )
        .join('');
      return cells ? `<div class="motu-gallery">${cells}</div>` : '';
    }

    // Fan the region's fit out to every mounted island (they reflect their own data-motu-fit + pass a
    // `fit` prop to structural islands). While in legacy fit, observe the region so islands mounting
    // later (async mount, archipelago switch) also pick it up; native is the default, so no observer.
    #applyFit() {
      const root: ParentNode = this.shadowRoot?.firstElementChild ?? this;
      // Skip islands a human pinned to a specific fit (the overlay's per-island override) so the
      // region toggle can't clobber a deliberately-mixed intermediate state.
      for (const el of root.querySelectorAll('[data-motu-legacy]:not([data-motu-fit-override])')) {
        const island = el as unknown as { fit?: MotuFit };
        if (island.fit !== this.#fit) island.fit = this.#fit;
      }
      if (this.#fit === 'legacy') {
        if (!this.#fitObserver) {
          this.#fitObserver = new MutationObserver(() => this.#applyFit());
          this.#fitObserver.observe(root, { childList: true, subtree: true });
        }
      } else {
        this.#fitObserver?.disconnect();
        this.#fitObserver = undefined;
      }
    }
  }

  customElements.define(tag, MotuArchipelago);
}
