'use client';
// Mounting an archipelago inside a Next page.
//
// There is no bridge script here and no injected markers: a Next host is already React, so islands
// render in the page's own tree, in place. What the archipelago still buys — and the reason this is
// not just an import of the ui components — is the discipline: one declared Store per region,
// declarative `bind` from store key to island prop, the host-intent seam, and the seam lens's view of
// all three.
//
// `mount` picks HOW islands attach:
//
//   'react'   (default) each island renders inside this page's React tree. Context, error boundaries
//             and Suspense from the page reach it, and there is one React root for the whole page.
//   'element' each island mounts as a <motu-island> custom element with its own React root. For the
//             case a React host does not actually own the DOM the island lands in — markup rendered
//             by a CMS, a slot filled imperatively — where there is no tree to join.
//
// Isolation is a different axis and is unaffected by this: it decides whether the host's stylesheet
// reaches the island, not which tree the island renders in.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArchipelagoProvider, Island, defineMotuApp, type ElementSpec, type MotuArchipelago } from '@motu/react';
import { setDefaultIsolation } from '@motu/core';
import type { AnyArchipelagoConfig, Channel, HostBridge, IslandIsolation, MotuTheme } from '@motu/core';

export interface ArchipelagoProps {
  /**
   * The archipelago being mounted (from the project's archipelagos registry).
   *
   * Erased region type: mounting only ROUTES a region — it never reads a bind key — so insisting on the
   * declared shape here would force every composition root to be generic for no checking gained. The
   * checking happens where the archipelago is declared.
   */
  config: AnyArchipelagoConfig;
  /** The project's element registry — the same one the lagoon uses. */
  elements: ElementSpec[];
  /** Compiled island stylesheet text (the project's shared sheet). Only used by `mount="element"`. */
  css?: string;
  /** Outward seam: navigate/action intents. Build one with `nextHostBridge(useRouter())`. */
  host?: HostBridge;
  /** Initial store contents, so bound islands render meaningfully on first paint. */
  seed?: Record<string, unknown>;
  /** Inbound channels: host signals mirrored into the store. */
  channels?: Channel[];
  /** Default skin. A Next host has no legacy skin to match, so 'motu'. */
  defaultTheme?: MotuTheme;
  /**
   * Region encapsulation. Defaults to 'light' — the opposite of the framework default, and on purpose.
   * A shadow root is right for an ocean whose stylesheet would otherwise bleed into the islands. Here
   * the app's stylesheet is the POINT: islands are the app's own components, styled by the app's own
   * Tailwind, and a shadow root blocks exactly that, rendering them unstyled inside their own page.
   * Only meaningful for `mount="element"`.
   */
  isolation?: IslandIsolation;
  /** How islands attach. See the note at the top of this file. */
  mount?: 'react' | 'element';
  className?: string;
  /**
   * Place islands yourself with `<Island slot="…">`, anywhere in the page's own markup. Without
   * children every declared slot renders in config order, which is the sensible default for a region
   * that owns its whole area.
   */
  children?: ReactNode;
}

// defineMotuApp registers custom elements, which is global and one-shot per tag: calling it twice for
// the same archipelago throws on re-registration. React StrictMode double-invokes effects and Next
// remounts across navigations, so guard by archipelago id.
const defined = new Set<string>();

function defineElements(props: ArchipelagoProps) {
  if (defined.has(props.config.id)) return;
  defined.add(props.config.id);
  // Must be set before the elements are defined: <motu-archipelago> reads the default when it
  // connects, and a region that has already attached a shadow root cannot give it back.
  setDefaultIsolation(props.isolation ?? 'light');
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
 * export function Actions() {
 *   const router = useRouter();
 *   const host = useMemo(() => nextHostBridge(router), [router]);
 *   return (
 *     <Archipelago config={getArchipelago('actions')!} elements={ELEMENT_REGISTRY} host={host}>
 *       <div className="grid gap-6 lg:grid-cols-2">
 *         <Island slot="network-stats" />
 *         <Island slot="revenue-thanks" />
 *       </div>
 *     </Archipelago>
 *   );
 * }
 * ```
 */
export function Archipelago(props: ArchipelagoProps) {
  if (props.mount === 'element') return <ElementArchipelago {...props} />;

  // Without children, every declared slot renders in config order — the sensible default for a region
  // that owns its whole area. The annotation keeps the union from widening across the React 18/19
  // type boundary this package can be compiled over.
  const placed: ReactNode = props.children ?? (
    <>
      {props.config.islands.map((i) => (
        <Island key={i.slot} slot={i.slot} />
      ))}
    </>
  );

  return (
    <ArchipelagoProvider
      config={props.config}
      elements={props.elements}
      host={props.host}
      seed={props.seed}
      channels={props.channels}
    >
      {placed}
    </ArchipelagoProvider>
  );
}

/** The custom-element path: one React root per island, for a host that does not own this DOM. */
function ElementArchipelago(props: ArchipelagoProps) {
  const ref = useRef<HTMLDivElement>(null);
  // Custom elements only exist in the browser; defining during render would run on the server too.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    defineElements(props);
    setReady(true);
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
