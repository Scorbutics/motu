// The SCREEN view — the application's own layout, with each of its slots filled by a REGION mounted
// exactly as the region view mounts it. EXPERIMENTAL (see `screens.ts`).
//
// ONE ROOT PER REGION, deliberately, inside the layout's tree. Each region gets the same
// `mountReactLagoon` call its own station makes — its seed, its channels, its providers, its wire —
// into a container the layout places. So a region looks and behaves on a screen exactly as it does
// alone, every region keeps its own store, and nothing here can couple two of them: the only thing
// that crosses is what the screen's `host` hands each one, which is what the page's own code does.
//
// NAVIGATION FOLLOWS DECLARED ROUTES. Every region's `host.navigate(path)` is answered by the screen
// list: a path some screen serves opens that screen; a path NO screen serves is refused out loud — a
// banner, a console error and `window.__motuScreen.unresolved` — because a button that leads nowhere
// is exactly the defect a click-through exists to find, and the lagoon used to log it quietly.
import { createElement, useLayoutEffect, useRef, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { disposeArchipelago, type HostBridge } from '@motu/core';
import type { ElementSpec } from './bootstrap';
import { regionOverrides, type RegionOverrideMaps } from './lagoon-overrides';
import { mountReactLagoon, unmountReactLagoon, type RegionRefOptions } from './lagoon-react-mount';
import { isRegionSlot, matchScreen, type ScreenConfig, type ScreenSlot } from './screens';

export interface ScreenMountOptions {
  elements: ElementSpec[];
  overrides?: RegionOverrideMaps;
  screens: readonly ScreenConfig[];
  /** The bridge everything else on the host does (actions are passed through to it). */
  host: HostBridge;
  /**
   * The island stylesheet. A screen mounts its regions through the REACT path whatever the lagoon's
   * own mount mode is, and on an element-mode lagoon nothing else puts the sheet in the document —
   * the first screen rendered every island as unstyled text, with every check still green.
   */
  css?: string;
  /** How a region placed on this screen resolves a region it REFERENCES (see `RegionRefSlot`). */
  regionRefs?: RegionRefOptions;
  /** Called when a navigation opened another screen, so the gallery can move its address and panel. */
  onNavigated?: (screen: ScreenConfig, path: string) => void;
}

export interface ScreenState {
  ok: boolean;
  screen?: string;
  path?: string;
  /** Every path a region asked for that no declared screen serves, in order. */
  unresolved: string[];
}

declare global {
  interface Window {
    __motuScreen?: ScreenState;
  }
}

const screenRoots = new Map<HTMLElement, Root>();

/** The regions a screen mounted, per screen container — torn down WITH the screen, in order. */
const screenRegions = new Map<HTMLElement, { el: HTMLElement; id: string }[]>();

/**
 * Take a screen out of a container: every region it mounted (root, channels, STORE), then the
 * layout. The gallery calls this before mounting a region there, and a screen before the next one.
 *
 * Explicit and ordered, not left to effect cleanups: those run while React is rendering the parent
 * root, and unmounting a child root then is the "synchronously unmount a root while React was already
 * rendering" warning — once per region per navigation. Disposing the store is what makes the next
 * screen's regions start from THEIR seed and THEIR host bridge (see `disposeArchipelago`).
 */
export function unmountScreen(root: HTMLElement): void {
  for (const { el, id } of screenRegions.get(root) ?? []) {
    unmountReactLagoon(el);
    disposeArchipelago(id);
  }
  screenRegions.delete(root);
  screenRoots.get(root)?.unmount();
  screenRoots.delete(root);
}

/** One slot of the layout: a container, and a region mounted into it for as long as it exists. */
function RegionSlot({ slot, mountRegion }: { slot: ScreenSlot; mountRegion: (el: HTMLElement, slot: ScreenSlot) => void }): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  // Mounted once; torn down by `unmountScreen`, never by a cleanup here (see its comment).
  useLayoutEffect(() => {
    if (ref.current) mountRegion(ref.current, slot);
  }, [slot, mountRegion]);
  if (!isRegionSlot(slot)) {
    return createElement(
      'section',
      { className: 'motu-screen-plain', 'data-motu-screen-slot': 'not-a-region', style: PLAIN_STYLE },
      createElement('strong', { style: { display: 'block', marginBottom: 6 } }, 'Not a motu region (yet)'),
      slot.notARegion,
    );
  }
  return createElement('div', { ref, className: 'motu-screen-slot', 'data-motu-screen-region': slot.id, style: { display: 'contents' } });
}

const PLAIN_STYLE = {
  padding: '20px 22px',
  border: '2px dashed rgba(127,127,127,.45)',
  borderRadius: 4,
  font: '13px/1.5 system-ui, sans-serif',
  opacity: 0.85,
} as const;

/**
 * Mount a screen at a path into `root`. Returns false (and mounts the refusal) when no declared
 * screen serves the path — a lagoon address that resolves to nothing must not render something else.
 */
export function mountScreen(root: HTMLElement, path: string, opts: ScreenMountOptions): boolean {
  const state: ScreenState = window.__motuScreen && window.__motuScreen.unresolved ? window.__motuScreen : { ok: false, unresolved: [] };
  window.__motuScreen = state;

  if (opts.css && !root.ownerDocument.getElementById('motu-island-styles')) {
    const style = root.ownerDocument.createElement('style');
    style.id = 'motu-island-styles';
    style.textContent = opts.css;
    root.ownerDocument.head.appendChild(style);
  }
  unmountScreen(root);
  // A REGION may be mounted here (the gallery's own station view): take its root down first, or two
  // React roots end up owning one container.
  unmountReactLagoon(root);
  const reactRoot = createRoot(root);
  screenRoots.set(root, reactRoot);

  const hit = matchScreen(opts.screens, path);
  if (!hit) {
    Object.assign(state, { ok: false, screen: undefined, path });
    reactRoot.render(banner(`No declared screen serves ${path}`, opts.screens.map((s) => s.path).join(' · ')));
    console.error(`motu: no declared screen serves "${path}" — declared: ${opts.screens.map((s) => s.path).join(', ')}`);
    return false;
  }
  Object.assign(state, { ok: true, screen: hit.screen.id, path });
  const hostSeeds = hit.screen.host?.({ params: hit.params }) ?? {};

  // THE NAVIGATION A REGION ASKS FOR, answered by the screen list rather than the page's router.
  const host: HostBridge = {
    navigate: (to: string) => {
      if (matchScreen(opts.screens, to)) {
        // A microtask, not synchronously: the request comes from inside an island's event handler,
        // and unmounting the tree that is dispatching it is a React error.
        queueMicrotask(() => {
          if (mountScreen(root, to, opts)) {
            const now = matchScreen(opts.screens, to)!;
            opts.onNavigated?.(now.screen, to);
          }
        });
        return;
      }
      state.unresolved.push(to);
      console.error(`motu: a region navigated to "${to}", and no declared screen serves it`);
      showUnresolved(root, to);
    },
    action: (name: string, detail: unknown) => opts.host.action(name, detail),
  };

  const mountRegion = (el: HTMLElement, slot: ScreenSlot) => {
    if (!isRegionSlot(slot)) return;
    // FRESH, as a route mounts a page's region: whatever store an earlier view left under this id
    // (the region's own station, a previous screen) would keep that view's seed and host bridge.
    disposeArchipelago(slot.id);
    screenRegions.set(root, [...(screenRegions.get(root) ?? []), { el, id: slot.id }]);
    const ov = regionOverrides(opts.overrides, slot.id);
    // The screen's host values OVER the region's own lagoon seed: the seed is the region alone, the
    // screen is the region where the app puts it.
    const seed = { ...(ov.seed ?? {}), ...(hostSeeds[slot.id] ?? {}) };
    mountReactLagoon(el, slot, {
      elements: opts.elements,
      ...ov,
      // The function form derives root props from the seed, exactly as the region view resolves it.
      hostProps: typeof ov.hostProps === 'function' ? ov.hostProps(seed) : ov.hostProps,
      host,
      seed,
      // `page` is a different view of a region; on a screen the region is mounted as a region.
      page: undefined,
      view: 'region',
      regionRefs: opts.regionRefs,
    });
  };

  const props: Record<string, ReactNode> = {};
  for (const [prop, slot] of Object.entries(hit.screen.slots)) {
    props[prop] = createElement(RegionSlot, { key: `${hit.screen.id}:${prop}:${path}`, slot, mountRegion });
  }
  reactRoot.render(createElement(hit.screen.layout, props));
  return true;
}

function banner(title: string, detail: string): ReactNode {
  return createElement(
    'div',
    { role: 'alert', style: { margin: 24, padding: '16px 18px', border: '2px solid #b44a35', borderRadius: 4, font: '14px/1.5 system-ui, sans-serif' } },
    createElement('strong', { style: { display: 'block' } }, title),
    createElement('span', { style: { opacity: 0.8 } }, `Declared: ${detail}`),
  );
}

/** A dismissable bar over the screen: the click went nowhere, and it says where it tried to go. */
function showUnresolved(root: HTMLElement, to: string): void {
  const bar = document.createElement('div');
  bar.setAttribute('role', 'alert');
  bar.dataset.motuScreenUnresolved = to;
  bar.textContent = `This control navigates to ${to}, and no declared screen serves it.`;
  Object.assign(bar.style, {
    position: 'fixed', left: '50%', bottom: '24px', transform: 'translateX(-50%)', zIndex: '2147483000',
    padding: '10px 16px', borderRadius: '4px', background: '#b44a35', color: '#fff',
    font: '13px/1.4 system-ui, sans-serif', boxShadow: '0 6px 20px rgba(0,0,0,.3)', cursor: 'pointer',
  });
  bar.addEventListener('click', () => bar.remove());
  root.ownerDocument.body.appendChild(bar);
  setTimeout(() => bar.remove(), 6000);
}
