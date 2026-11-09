// The SCREEN view — the application's own layout, with each of its slots filled by a REGION mounted
// exactly as the region view mounts it. EXPERIMENTAL (see `screens.ts`).
//
// ONE TREE, the layout's, with each region rendered INSIDE it by `regionTree` — the same tree its own
// station renders (its seed, its channels, its providers, its own ArchipelagoProvider and store). It
// was one React root per region at first, which cut React context at every slot: Peps' dashboard
// layout provides the signed-in member, the clock and the badge counts, the page's region reads them
// in the app, and a separate root could never see them. Every region still keeps its own store, so
// nothing here can couple two of them: what crosses is the layout's context — as in the app — and what
// the screen's `host` hands each region, which is what the page's own code does.
//
// NAVIGATION FOLLOWS DECLARED ROUTES. Every region's `host.navigate(path)` is answered by the screen
// list: a path some screen serves opens that screen; a path NO screen serves is refused out loud — a
// banner, a console error and `window.__motuScreen.unresolved` — because a button that leads nowhere
// is exactly the defect a click-through exists to find, and the lagoon used to log it quietly.
import { createElement, Fragment, type ComponentType, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { disposeArchipelago, provideToArchipelago, type HostBridge } from '@motu/core';
import type { ElementSpec } from './bootstrap';
import { regionOverrides, type RegionOverrideMaps } from './lagoon-overrides';
import { regionTree, unmountReactLagoon, type RegionRefOptions } from './lagoon-react-mount';
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
  /** The route's parameters, for a layout reading `useParams()` (the Next adapter's stubs do). */
  params?: Record<string, string>;
  /** Every path a region asked for that no declared screen serves, in order. */
  unresolved: string[];
}

declare global {
  interface Window {
    __motuScreen?: ScreenState;
  }
}

const screenRoots = new Map<HTMLElement, Root>();

/**
 * Requests from the app's OWN navigation — a Next `<Link>` or `router.push` in the layout, which the
 * Next adapter's lagoon stubs turn into a `motu:screen-navigate` event while a screen is showing. One
 * listener per container, replaced with each screen so it always routes through the current one.
 */
const navListeners = new Map<HTMLElement, (e: Event) => void>();

/** The regions a screen mounted, per screen container — torn down WITH the screen, in order. */
const screenRegions = new Map<HTMLElement, string[]>();

/** What is mounted in a container right now — compared with the next screen to decide soft vs hard. */
const mountedScreens = new Map<HTMLElement, { layout: ComponentType<Record<string, unknown>>; providers: readonly unknown[] }>();

const sameProviders = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((p, i) => p === b[i]);

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
  mountedScreens.delete(root);
  screenRoots.get(root)?.unmount();
  screenRoots.delete(root);
  // AFTER the tree is gone, so no island is still bound to the store being forgotten.
  for (const id of screenRegions.get(root) ?? []) disposeArchipelago(id);
  screenRegions.delete(root);
  const listener = navListeners.get(root);
  if (listener) window.removeEventListener('motu:screen-navigate', listener);
  navListeners.delete(root);
  if (window.__motuScreen) window.__motuScreen.ok = false;
}

/** A part of the layout that is not a motu region yet — said, with the reason. */
function plainSlot(reason: string): ReactNode {
  return createElement(
    'section',
    { className: 'motu-screen-plain', 'data-motu-screen-slot': 'not-a-region', style: PLAIN_STYLE },
    createElement('strong', { style: { display: 'block', marginBottom: 6 } }, 'Not a motu region (yet)'),
    reason,
  );
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
  const hit = matchScreen(opts.screens, path);
  const accepted = hit ? hit.screen.accepts?.(hit.params) ?? true : true;

  // A LAYOUT THAT STAYS, as it does in the app. Next keeps a layout mounted across navigations and
  // swaps only the page, so its state lives on — Peps' « Nouveautés » modal opens "once per session",
  // and a screen view that rebuilt the layout on every click reopened it on every click, over the
  // sidebar, so the second click landed on the modal. Same layout and same providers: reconcile in
  // place. Anything else: a fresh tree.
  const prev = mountedScreens.get(root);
  const soft =
    !!hit &&
    accepted === true &&
    !!prev &&
    prev.layout === hit.screen.layout &&
    sameProviders(prev.providers, hit.screen.providers ?? []) &&
    screenRoots.has(root);
  const kept = new Set(soft ? screenRegions.get(root) ?? [] : []);
  if (!soft) {
    unmountScreen(root);
    // A REGION may be mounted here (the gallery's own station view): take its root down first, or two
    // React roots end up owning one container.
    unmountReactLagoon(root);
    screenRoots.set(root, createRoot(root));
  } else {
    const listener = navListeners.get(root);
    if (listener) window.removeEventListener('motu:screen-navigate', listener);
  }
  const reactRoot = screenRoots.get(root)!;

  if (!hit) {
    Object.assign(state, { ok: false, screen: undefined, path });
    reactRoot.render(banner(`No declared screen serves ${path}`, `Declared: ${opts.screens.map((s) => s.path).join(' · ')}`));
    console.error(`motu: no declared screen serves "${path}" — declared: ${opts.screens.map((s) => s.path).join(', ')}`);
    return false;
  }
  if (accepted !== true) {
    Object.assign(state, { ok: false, screen: hit.screen.id, path });
    reactRoot.render(banner(`The lagoon cannot show ${path}`, accepted));
    console.error(`motu: screen "${hit.screen.id}" refuses ${path} — ${accepted}`);
    return false;
  }
  Object.assign(state, { ok: true, screen: hit.screen.id, path, params: hit.params });
  // Tell a layout reading the router (`usePathname`) where it now is.
  window.dispatchEvent(new CustomEvent('motu:screen-location', { detail: { path, params: hit.params } }));
  const hostSeeds = hit.screen.host?.({ params: hit.params }) ?? {};

  // THE NAVIGATION A REGION ASKS FOR, answered by the screen list rather than the page's router.
  const host: HostBridge = {
    navigate: (to: string) => {
      const target = matchScreen(opts.screens, to);
      const refusal = target ? target.screen.accepts?.(target.params) ?? true : true;
      if (target && refusal !== true) {
        state.unresolved.push(to);
        console.error(`motu: screen "${target.screen.id}" refuses ${to} — ${refusal}`);
        showUnresolved(root, to, refusal);
        return;
      }
      if (target) {
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

  // The layout's own links and router calls, routed exactly like a region's `host.navigate`.
  const onAppNavigate = (e: Event) => {
    const to = (e as CustomEvent<string>).detail;
    if (typeof to === 'string') host.navigate(to);
  };
  navListeners.set(root, onAppNavigate);
  window.addEventListener('motu:screen-navigate', onAppNavigate);

  // FRESH, as a route mounts a page's region: whatever store an earlier view left under this id (its
  // own station, a previous screen) would keep that view's seed and host bridge.
  const regionIds: string[] = [];
  const regionNode = (slot: ScreenSlot): ReactNode => {
    if (!isRegionSlot(slot)) return plainSlot(slot.notARegion);
    regionIds.push(slot.id);
    if (kept.has(slot.id)) {
      // ON BOTH SCREENS (the demo's sidebar is the shell region on every one): it stays mounted, and the
      // new screen's host values reach it the way the page's code would — `provide`, not a fresh seed.
      for (const [key, value] of Object.entries(hostSeeds[slot.id] ?? {})) provideToArchipelago(slot.id, key, value);
    } else {
      disposeArchipelago(slot.id);
    }
    const ov = regionOverrides(opts.overrides, slot.id);
    // The screen's host values OVER the region's own lagoon seed: the seed is the region alone, the
    // screen is the region where the app puts it.
    const seed = { ...(ov.seed ?? {}), ...(hostSeeds[slot.id] ?? {}) };
    // KEYED BY REGION, so the same region in the same slot is the same element across screens.
    return createElement(Fragment, { key: slot.id }, regionTree(slot, {
      elements: opts.elements,
      ...ov,
      // The function form derives root props from the seed, exactly as the region view resolves it.
      hostProps: typeof ov.hostProps === 'function' ? ov.hostProps(seed) : ov.hostProps,
      host,
      seed,
      // `page` is a different view of a region; on a screen the region is shown as a region.
      page: undefined,
      view: 'region',
      regionRefs: opts.regionRefs,
    }));
  };

  const props: Record<string, ReactNode> = {};
  for (const [prop, slot] of Object.entries(hit.screen.slots)) props[prop] = regionNode(slot);
  const previous = screenRegions.get(root) ?? [];
  screenRegions.set(root, regionIds);
  mountedScreens.set(root, { layout: hit.screen.layout, providers: hit.screen.providers ?? [] });
  // What the app renders AROUND the layout, outermost first.
  let tree: ReactNode = createElement(hit.screen.layout, props);
  for (const P of [...(hit.screen.providers ?? [])].reverse()) tree = createElement(P, null, tree);
  // Committed synchronously, so the regions that LEFT are unmounted before their stores are forgotten.
  flushSync(() => reactRoot.render(tree));
  for (const id of previous) if (!regionIds.includes(id)) disposeArchipelago(id);
  return true;
}
function banner(title: string, detail: string): ReactNode {
  return createElement(
    'div',
    { role: 'alert', style: { margin: 24, padding: '16px 18px', border: '2px solid #b44a35', borderRadius: 4, font: '14px/1.5 system-ui, sans-serif' } },
    createElement('strong', { style: { display: 'block' } }, title),
    createElement('span', { style: { opacity: 0.8 } }, detail),
  );
}

/** A dismissable bar over the screen: the click went nowhere, and it says where it tried to go. */
function showUnresolved(root: HTMLElement, to: string, why?: string): void {
  const bar = document.createElement('div');
  bar.setAttribute('role', 'alert');
  bar.dataset.motuScreenUnresolved = to;
  bar.textContent = why
    ? `This control navigates to ${to}, which the lagoon cannot show: ${why}`
    : `This control navigates to ${to}, and no declared screen serves it.`;
  Object.assign(bar.style, {
    position: 'fixed', left: '50%', bottom: '24px', transform: 'translateX(-50%)', zIndex: '2147483000',
    padding: '10px 16px', borderRadius: '4px', background: '#b44a35', color: '#fff',
    font: '13px/1.4 system-ui, sans-serif', boxShadow: '0 6px 20px rgba(0,0,0,.3)', cursor: 'pointer',
  });
  bar.addEventListener('click', () => bar.remove());
  root.ownerDocument.body.appendChild(bar);
  setTimeout(() => bar.remove(), 6000);
}
