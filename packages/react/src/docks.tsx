'use client';
// DOCKS, AT RUNTIME — the portal the application used to hand-roll, owned by motu and declared.
//
// A region (A) declares that its island goes into another region's (B) dock:
//
//   B: slots: { aside: { dock: 'equipage-aside' } }
//   A: slots: { conseil: { slot: 'base-conseil', dockInto: { region: 'equipage', dock: 'equipage-aside' } } }
//
// B's root receives a DOCK ELEMENT in `aside` — a `display: contents` box that registers itself here.
// A's root renders the island through a React PORTAL into that element, from A's own tree, so the
// island keeps A's context: A's store, A's host bridge, A's providers, A's error boundary. Only the
// DOM lands in B.
//
// WHERE THE ISLAND RENDERS is decided from what is MOUNTED, never from a flag the page threads:
//
//   B's <X.Region> not mounted          -> A's fallback (the claim's own prop), or nowhere ('none')
//   B mounted, its dock not rendered    -> nowhere: WAITING, so it never jumps from the flow into the dock
//   B's dock rendered                   -> inside it
//   server render / first client render -> nowhere: decided before the first paint
//
// Presence is registered by `ArchipelagoProvider` in a layout effect, the dock element through a ref.
// A's root decides in ITS layout effect, which React runs after every descendant's — B is placed
// inside A, so by then B's provider and B's dock have both registered, and the first frame painted
// already has the island in its final place.
import {
  createElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { dockAddress, dockClaimsOf, docksOf, type DockClaim } from '@motujs/core';

// `useLayoutEffect` warns under SSR; the decision is client-only anyway.
const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

// --- the registry ----------------------------------------------------------------------------

/** How many providers of each region are mounted right now. */
const presence = new Map<string, number>();
/** The dock element each `region.dock` rendered, first one wins. */
const targets = new Map<string, HTMLElement>();
const listeners = new Set<() => void>();
let version = 0;
const changed = () => {
  version++;
  listeners.forEach((l) => l());
};
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const getVersion = () => version;
// Never decided on the server: a portal has no server target.
const getServerVersion = () => -1;

/** A region's provider mounted. Returns the release. Called by `ArchipelagoProvider`. */
export function markRegionPresent(id: string): () => void {
  presence.set(id, (presence.get(id) ?? 0) + 1);
  changed();
  return () => {
    const left = (presence.get(id) ?? 1) - 1;
    if (left > 0) presence.set(id, left);
    else presence.delete(id);
    changed();
  };
}

/** Is a provider of this region mounted? */
export function regionPresent(id: string): boolean {
  return (presence.get(id) ?? 0) > 0;
}

const reportedTwice = new Set<string>();

function registerTarget(address: string, el: HTMLElement | null, previous: HTMLElement | null): void {
  if (el) {
    const held = targets.get(address);
    if (held && held !== el && held.isConnected) {
      // ONE ISLAND PER DOCK holds at runtime too: a second copy of B on screen would leave the island
      // in whichever registered first. Said, once, rather than moving it between them.
      if (!reportedTwice.has(address)) {
        reportedTwice.add(address);
        console.error(`motu: dock ${address} is rendered twice — the docked island stays in the first; a dock is one place`);
      }
      return;
    }
    targets.set(address, el);
    changed();
  } else if (previous && targets.get(address) === previous) {
    targets.delete(address);
    changed();
  }
}

/** The element a dock rendered, if it has. */
export function dockTarget(region: string, dock: string): HTMLElement | undefined {
  return targets.get(dockAddress(region, dock));
}

// --- B's side: the place -----------------------------------------------------------------------

export interface DockTargetProps {
  region: string;
  dock: string;
  /** What to show while nothing is docked — the lagoon's placeholder. Never set by `<X.Root>`. */
  empty?: ReactNode;
}

/**
 * The element B's root receives for a dock prop. `display: contents`, so it adds no box: B's layout
 * keeps its own wrapper and CSS, and the docked island lands as that wrapper's child.
 */
export function DockTarget({ region, dock, empty }: DockTargetProps): ReactNode {
  const address = dockAddress(region, dock);
  const held = useRef<HTMLElement | null>(null);
  // STABLE, or React detaches and re-attaches it on every render — and each of those is a registry
  // change that re-renders every placement, which re-renders this: a loop.
  const place = useCallback(
    (el: HTMLElement | null) => {
      const previous = held.current;
      held.current = el;
      registerTarget(address, el, previous);
    },
    [address],
  );
  const filled = useSyncExternalStore(subscribe, () => occupied.has(address), () => false);
  return createElement(
    'div',
    // `data-motu-region-dock`, not `data-motu-dock`: the lagoon's own chrome dock already marks <html>
    // with that one, and a docked island would then read as sitting in the lagoon's panel.
    { 'data-motu-region-dock': address, style: { display: 'contents' } },
    empty && !filled ? empty : null,
    // THE PORTAL'S CONTAINER is its own element with no React children, so the docked island and
    // anything B renders here (the lagoon's placeholder) never share a parent React reconciles.
    createElement('div', {
      'data-motu-region-dock-place': '',
      style: { display: 'contents' },
      ref: place,
    }),
  );
}

/** Docks a docked island has actually landed in — what lets a placeholder step aside. */
const occupied = new Set<string>();
const occupiers = new Map<string, (el: HTMLElement | null) => void>();
function occupy(address: string): (el: HTMLElement | null) => void {
  let fn = occupiers.get(address);
  if (!fn) {
    fn = (el) => {
      if (el) occupied.add(address);
      else occupied.delete(address);
      changed();
    };
    occupiers.set(address, fn);
  }
  return fn;
}

// --- A's side: the island --------------------------------------------------------------------

/** Where one claim's island renders, right now. */
export type DockPlacement =
  | { kind: 'pending' }
  | { kind: 'here' }
  | { kind: 'none' }
  | { kind: 'wait' }
  | { kind: 'dock'; node: HTMLElement };

function placementOf(claim: Pick<DockClaim, 'region' | 'dock' | 'fallback'>): DockPlacement {
  const node = dockTarget(claim.region, claim.dock);
  if (node && node.isConnected) return { kind: 'dock', node };
  if (regionPresent(claim.region)) return { kind: 'wait' };
  return claim.fallback === 'none' ? { kind: 'none' } : { kind: 'here' };
}

/**
 * The placement of every claim a config makes — decided after this component's descendants have
 * committed (see the top of this file), and followed as regions and docks come and go.
 */
export function useDockPlacements(claims: readonly DockClaim[]): Record<string, DockPlacement> {
  const [settled, setSettled] = useState(false);
  useClientLayoutEffect(() => setSettled(true), []);
  const v = useSyncExternalStore(subscribe, getVersion, getServerVersion);
  const out: Record<string, DockPlacement> = {};
  for (const claim of claims) out[claim.prop] = !settled || v < 0 ? { kind: 'pending' } : placementOf(claim);
  return out;
}

/**
 * Apply placements to a root's composed props: a claim's prop keeps its node only at its fallback
 * position; a docked one is returned as a portal for the caller to render beside the root. `nodes` is
 * the island node each claim's prop resolved to (already wrapped in the island).
 */
export function placeDocked(
  composed: Record<string, unknown>,
  claims: readonly DockClaim[],
  placements: Record<string, DockPlacement>,
  ownRegion: string,
): ReactNode[] {
  const portals: ReactNode[] = [];
  for (const claim of claims) {
    const node = composed[claim.prop] as ReactNode;
    const at = placements[claim.prop] ?? { kind: 'pending' };
    composed[claim.prop] = at.kind === 'here' ? node : null;
    if (at.kind === 'dock' && node != null) {
      portals.push(
        createPortal(
          createElement(
            'div',
            {
              style: { display: 'contents' },
              ref: occupy(dockAddress(claim.region, claim.dock)),
              'data-motu-docked-in': dockAddress(claim.region, claim.dock),
              'data-motu-docked-from': `${ownRegion}.${claim.slot}`,
            },
            node,
          ),
          at.node,
          `motu-dock:${claim.prop}`,
        ),
      );
    }
  }
  return portals;
}

/** Fill every dock prop a config opens with its dock element. A page-passed value is never used. */
const reportedPassed = new Set<string>();
export function fillDocks(
  config: { id: string; slots?: Record<string, unknown> },
  composed: Record<string, unknown>,
  empty?: (prop: string, dock: string) => ReactNode,
): void {
  for (const [prop, dock] of Object.entries(docksOf(config))) {
    if (composed[prop] != null && !reportedPassed.has(`${config.id}.${prop}`)) {
      reportedPassed.add(`${config.id}.${prop}`);
      console.error(
        `motu: <${config.id}.Root> was passed \`${prop}\`, which "${config.id}" declares as dock "${dock}" — motu fills a ` +
          `dock with the island another region docks there; the value passed was ignored`,
      );
    }
    composed[prop] = createElement(DockTarget, { key: `dock:${prop}`, region: config.id, dock, empty: empty?.(prop, dock) });
  }
}

export { dockClaimsOf };
