// The Next.js host bridge: an island's outward intents become the host app's navigation and events.
//
// Islands are forbidden from touching `history`/`location` (motu island verify enforces it), because
// the host owns the URL — that rule is what lets the same component mount in the lagoon, where there
// is no router at all. So an island emits an INTENT and something at the composition root turns it
// into a real navigation. On a Next host that something is the App Router.
//
// This is deliberately the whole adapter surface for navigation. There is no `defineNextElement`:
// a Next host is already React, so an island mounts as a plain component and needs no custom-element
// wrapper to cross a framework boundary.
import type { HostBridge } from '@motu/core';

/** The slice of Next's App Router this bridge needs — structural, so it accepts the real
 *  `useRouter()` return value without importing next/navigation into the framework. */
export interface NextRouterLike {
  push(href: string): void;
  replace(href: string): void;
  back(): void;
}

export interface NextHostBridgeOptions {
  /** Use `router.replace` instead of `router.push` (navigation that should not stack history). */
  replace?: boolean;
  /** Event name dispatched on `document` for outward actions. Default 'motu:action'. */
  actionEvent?: string;
  /** Handle an action inline instead of (not as well as) dispatching the DOM event. */
  onAction?: (name: string, detail: unknown) => void;
}

/**
 * Build a HostBridge backed by the Next App Router.
 *
 * ```tsx
 * 'use client';
 * const router = useRouter();
 * const host = useMemo(() => nextHostBridge(router), [router]);
 * ```
 *
 * Actions surface as a DOM CustomEvent so host code can listen without the island knowing who is
 * listening — the same shape the AngularJS adapter uses, so an island's outward contract does not
 * change when the ocean recedes.
 */
export function nextHostBridge(router: NextRouterLike, opts: NextHostBridgeOptions = {}): HostBridge {
  const actionEvent = opts.actionEvent ?? 'motu:action';
  return {
    navigate(path: string) {
      if (opts.replace) router.replace(path);
      else router.push(path);
    },
    action(name: string, detail: unknown) {
      opts.onAction?.(name, detail);
      if (typeof document !== 'undefined') {
        document.dispatchEvent(new CustomEvent(actionEvent, { detail: { name, detail }, bubbles: true }));
      }
    },
  };
}

/**
 * A HostBridge for contexts with no router — server rendering, tests, or a host that has not wired
 * one yet. Navigation intents are collected rather than performed, so nothing silently no-ops:
 * assert on `intents` in a test, or read it while wiring a page up.
 */
export function collectingHostBridge(): HostBridge & { intents: { kind: string; value: unknown }[] } {
  const intents: { kind: string; value: unknown }[] = [];
  return {
    intents,
    navigate: (path) => void intents.push({ kind: 'navigate', value: path }),
    action: (name, detail) => void intents.push({ kind: name, value: detail }),
  };
}
