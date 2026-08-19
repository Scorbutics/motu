'use client';
// Mounting an archipelago inside a Next page.
//
// There is no bridge.js here and no injected markers: a Next host is already React, so a page renders
// <Archipelago /> directly. What the custom elements still buy us — and the reason this is not just an
// import of the ui components — is the archipelago itself: one declared Store, declarative `bind` from
// store key to island prop, the host-intent seam, and the debug overlay's view of all three. That is
// the discipline motu is for; dropping to bare imports would drop it.
//
// Everything here is client-side by construction. The islands mount into the DOM and hold state, so
// the page (or layout) that renders this must be a client component — which is exactly the boundary
// `@motu/adapter-next/verify` checks an island stays inside.
import { useEffect, useRef, useState } from 'react';
import { defineMotuApp, type ElementSpec, type MotuArchipelago } from '@motu/react';
import type { ArchipelagoConfig, Channel, HostBridge, MotuTheme } from '@motu/core';

export interface ArchipelagoProps {
  /** The archipelago being mounted (from the project's archipelagos registry). */
  config: ArchipelagoConfig;
  /** The project's element registry — the same one the lagoon uses. */
  elements: ElementSpec[];
  /** Compiled island stylesheet text (the project's shared sheet). */
  css?: string;
  /** Outward seam: navigate/action intents. Build one with `nextHostBridge(useRouter())`. */
  host?: HostBridge;
  /** Initial store contents, so bound islands render meaningfully on first paint. */
  seed?: Record<string, unknown>;
  /** Inbound channels: host signals mirrored into the store. */
  channels?: Channel[];
  /** Default skin. A Next host has no legacy skin to match, so 'motu'. */
  defaultTheme?: MotuTheme;
  className?: string;
}

// defineMotuApp registers custom elements, which is global and one-shot per tag: calling it twice for
// the same archipelago throws on re-registration. React StrictMode double-invokes effects and Next
// remounts across navigations, so guard by archipelago id.
const defined = new Set<string>();

function define(props: ArchipelagoProps) {
  if (defined.has(props.config.id)) return;
  defined.add(props.config.id);
  const archipelagos: MotuArchipelago[] = [
    { config: props.config, options: { host: props.host, seed: props.seed, channels: props.channels } },
  ];
  defineMotuApp({
    elements: props.elements,
    archipelagos,
    css: props.css,
    defaultTheme: props.defaultTheme ?? 'motu',
  });
}

/**
 * Render one archipelago into a Next page.
 *
 * ```tsx
 * 'use client';
 * import { Archipelago, nextHostBridge } from '@motu/adapter-next';
 * import { ELEMENT_REGISTRY, getArchipelago } from '@/motu/src';
 *
 * export function Directory() {
 *   const router = useRouter();
 *   const host = useMemo(() => nextHostBridge(router), [router]);
 *   return <Archipelago config={getArchipelago('directory')!} elements={ELEMENT_REGISTRY} host={host} />;
 * }
 * ```
 */
export function Archipelago(props: ArchipelagoProps) {
  const ref = useRef<HTMLDivElement>(null);
  // Custom elements only exist in the browser; defining during render would run on the server too.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    define(props);
    setReady(true);
    // The registration is global and one-shot; re-running it on prop changes would be a no-op at best
    // and a double-define at worst. Store/host updates flow through the archipelago, not through here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.config.id]);

  useEffect(() => {
    const mount = ref.current;
    if (!ready || !mount) return;
    const el = document.createElement('motu-archipelago');
    el.setAttribute('name', props.config.id);
    mount.appendChild(el);
    return () => el.remove();
  }, [ready, props.config.id]);

  return <div ref={ref} className={props.className} />;
}
