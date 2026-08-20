'use client';
// Mounting islands INSIDE the host's own React tree.
//
// The custom-element path (`defineReactElement` -> `createRoot` per island) exists because the ocean
// is not React: there is no tree to join, so every island must bootstrap one. Carrying that into a
// React host is a mistake with consequences beyond the wasted roots — each root is its own CONTEXT
// boundary, its own error boundary, its own Suspense boundary, and it cannot be server-rendered. A
// component that calls `useClock()` throws inside an island while working fine two lines above it in
// the same page, which is not a limitation anyone can reason about.
//
// So on a React host an island is what it always was — the app's own component, fed by the store,
// emitting through the seam — rendered in place. What the island CONTRACT buys is unchanged: props
// come from declared `bind` keys, output goes to declared handlers, and the seam lens sees all of it.
// The only thing that goes away is the DOM wrapper nobody needed.
//
// Isolation is a separate axis and stays where it was: it decides whether the host's CSS reaches the
// island, not which tree the island renders in. A React host that does NOT own the DOM an island
// mounts into (markup rendered by a CMS, a slot filled imperatively) is the case the custom element
// still serves — that path remains, unchanged.
import {
  Children,
  cloneElement,
  createContext,
  createElement,
  isValidElement,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  defineArchipelago,
  getArchipelagoStore,
  registerIslandDefinition,
  registerMountedIsland,
  runWithWriteSource,
  type AnyArchipelagoConfig,
  type ArchipelagoConfig,
  type Channel,
  type HostBridge,
  type IslandElementOptions,
  type MotuFit,
  type Store,
} from '@motu/core';
import type { ElementSpec, ReactElementSpec } from './bootstrap.js';

interface ArchipelagoValue {
  config: AnyArchipelagoConfig;
  store: Store;
  host: HostBridge | undefined;
  byTag: Map<string, ReactElementSpec>;
}

const ArchipelagoContext = createContext<ArchipelagoValue | null>(null);

/** An island's declared inputs, as `{ name, default }` — from the grouped contract or flat props. */
function declaredInputs(spec: ReactElementSpec): { name: string; default?: unknown }[] {
  const options = spec.options as { contract?: { input?: unknown[] }; props?: unknown[] } | undefined;
  const entries = options?.contract?.input ?? options?.props ?? [];
  return entries
    .map((p) => (typeof p === 'string' ? { name: p } : (p as { name: string; default?: unknown })))
    .filter((p) => p && typeof p.name === 'string');
}

/** Callback prop -> event name, from the grouped contract or the flat `events` map. */
function declaredOutputs(spec: ReactElementSpec): Record<string, string> {
  const options = spec.options as { contract?: { output?: Record<string, string> }; events?: Record<string, string> } | undefined;
  return options?.contract?.output ?? options?.events ?? {};
}

export interface ArchipelagoProviderProps {
  config: AnyArchipelagoConfig;
  /** The project's element registry — the same one the lagoon and the custom-element path use. */
  elements: ElementSpec[];
  /** Outward seam for navigate/action intents. */
  host?: HostBridge;
  /** Initial store contents. */
  seed?: Record<string, unknown>;
  /** Inbound channels: host signals mirrored into the store. */
  channels?: Channel[];
  children?: ReactNode;
}

/**
 * Declares an archipelago and puts its store in React context, so `<Island slot="…">` below can find
 * it. The store, the slot registry and the host bridge are the SAME ones the custom-element path
 * registers, so the debug overlay, `provide()` and channels behave identically either way.
 */
export function ArchipelagoProvider({ config, elements, host, seed, channels, children }: ArchipelagoProviderProps): ReactElement {
  const value = useMemo<ArchipelagoValue>(() => {
    // The islands' DECLARED shape, for the seam lens. On the custom-element path `defineIsland` does
    // this; the React path defines no elements, so without this call the overlay knew every island's
    // store binds but none of its props, and reported both "No declared props" and — since coupling is
    // derived from those props' store keys — "No shared store keys". Debug-only and idempotent.
    // Self-registering entries (`define`) are left alone: they run defineIsland themselves.
    for (const entry of elements) {
      // Same widening `defineReactElement` does when it hands these options to `defineIsland`: the
      // registry types attributes per-prop, the element machinery by name.
      if ('component' in entry) {
        registerIslandDefinition(entry.tag, (entry.options ?? {}) as unknown as IslandElementOptions);
      }
    }

    // defineArchipelago builds a NEW Store and re-registers every slot. React StrictMode and Fast
    // Refresh both re-run this, and a second call would silently swap the store out from under any
    // island already bound to the first one. Reuse the registered store when the id is already known.
    const existing = getArchipelagoStore(config.id);
    const store = existing ?? defineArchipelago(config, { host, seed, channels });
    return {
      config,
      store,
      host,
      byTag: new Map(
        elements.filter((e): e is ReactElementSpec => 'component' in e).map((e) => [e.tag, e]),
      ),
    };
    // Keyed by archipelago id: the registration is global and one-shot, and re-running it on every
    // prop identity change would rebuild the store on each render of the host page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.id]);

  // `createElement`, with the return type ANNOTATED — not JSX.
  //
  // Two constraints meet here. Left uninferred, `createElement(Context.Provider, …)` infers
  // `FunctionComponentElement<ProviderProps<…>>`, which React 19's types reject in a child position
  // (its `ReactPortal` requires `children`), so a host app on React 19 compiling motu's sources fails
  // with "ArchipelagoProvider cannot be used as a JSX component". Writing it as JSX fixes the type and
  // breaks the RUNTIME: this file is transformed by whatever the consumer uses, and a loader that does
  // not pick up the workspace's `jsx: react-jsx` emits a classic transform needing `React` in scope —
  // `ReferenceError: React is not defined`, at render, in a package that has no JSX anywhere else.
  // Annotating the return keeps the call plain and satisfies both type versions.
  return createElement(ArchipelagoContext.Provider, { value }, children);
}

/** The archipelago's store, for host code that needs to read or drive it (not for islands). */
export function useMotuStore(): Store {
  const ctx = useContext(ArchipelagoContext);
  if (!ctx) throw new Error('motu: useMotuStore must be used inside <ArchipelagoProvider>');
  return ctx.store;
}

export interface IslandProps {
  /** The slot this island fills, as declared in the archipelago config. */
  slot: string;
  /** Footprint. Structural islands branch on it; CSS-only strategies ignore it. */
  fit?: MotuFit;
  /** Escape hatch for a prop the archipelago does not declare (a page-local callback, say). */
  props?: Record<string, unknown>;
  className?: string;
  /**
   * The host page's OWN element for this slot — `<Island slot="x"><Panel a={a} /></Island>`.
   *
   * This is the "page seeds, store augments" shape. The page keeps writing its own JSX with its own
   * props; motu publishes those props into the region store and overrides them only where a sibling
   * has driven the key. Deleting the `<Archipelago>`/`<Island>` wrappers then leaves the page's own
   * markup rendering exactly as before — which is what makes removing motu a no-op rather than a
   * breakage. Without children, the island is rendered from the registry (the original path).
   */
  children?: ReactNode;
}

/**
 * Render the island registered for `slot`, in place, in the host's own React tree.
 *
 * Props are assembled exactly as `mountIsland` assembles them for the custom element — declared
 * defaults, then the archipelago's static `props`, then reactive `bind` values — so an island cannot
 * behave differently depending on which path mounted it.
 */
export function Island({ slot, fit, props: extra, className, children }: IslandProps) {
  const ctx = useContext(ArchipelagoContext);
  if (!ctx) throw new Error(`motu: <Island slot="${slot}"> must be used inside <ArchipelagoProvider>`);

  const spec = ctx.config.islands.find((i) => i.slot === slot);
  const elementSpec = spec ? ctx.byTag.get(spec.element) : undefined;

  // Re-render on any store write. The store is a coarse notifier by design (one listener list, no
  // per-key subscriptions), so this mirrors what the custom element does: re-apply all binds on any
  // change. Islands are few and their renders cheap; a finer scheme would be optimising the wrong end.
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => ctx.store.subscribe(bump), [ctx.store]);

  // Output callbacks, built ONCE per island rather than per render.
  //
  // A fresh function identity every render is not merely wasteful: a component that lists its
  // callback in an effect's dependencies (a normal, correct thing to do) then re-runs that effect on
  // every render, and if the effect writes to the store the write re-renders the island and the loop
  // never settles. The handler only ever needs the archipelago's config, the store and the host, all
  // of which are stable for the life of the island.
  const handlers = useMemo(() => {
    const out: Record<string, (detail: unknown) => void> = {};
    if (!spec || !elementSpec) return out;
    for (const [callbackProp, eventName] of Object.entries(declaredOutputs(elementSpec))) {
      const handler = spec.on?.[eventName];
      out[callbackProp] = (detail: unknown) => {
        if (!handler) return;
        // Tag the island as the writer, so the lens attributes store writes the same way it does for
        // an event dispatched by the custom element.
        runWithWriteSource(slot, () => handler(detail, { store: ctx.store, host: ctx.host! }));
      };
    }
    return out;
  }, [spec, elementSpec, slot, ctx.store, ctx.host]);

  // The page's own element for this slot, if it supplied one.
  const hosted = children != null && isValidElement(children) ? (Children.only(children) as ReactElement) : null;
  const hostedProps = (hosted?.props ?? {}) as Record<string, unknown>;

  // THE PAGE SEEDS. Publish the props the page passed into the region store, under the archipelago's
  // declared bind keys, so a sibling can read what this island was given without the page having to
  // hand its state to motu.
  //
  // Published on CHANGE, not on every render, and that is the whole subtlety: re-publishing an
  // unchanged prop on every render would clobber a sibling's write to the same key the moment
  // anything re-rendered. While the page keeps passing a value, the page owns it (the store is a
  // read-mirror); a key becomes store-owned only when the page stops passing it.
  const publishedRef = useRef<Record<string, unknown>>({});
  useEffect(() => {
    if (!hosted || !spec?.bind) return;
    for (const [prop, key] of Object.entries(spec.bind)) {
      if (!(prop in hostedProps)) continue;
      const value = hostedProps[prop];
      if (Object.is(publishedRef.current[key], value)) continue;
      publishedRef.current[key] = value;
      runWithWriteSource(slot, () => ctx.store.set(key, value));
    }
  });

  const wrapperRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!spec || !wrapperRef.current) return;
    // Make the island visible to the seam lens, which the custom-element path gets for free.
    return registerMountedIsland({ slot, element: spec.element, el: wrapperRef.current, spec, store: ctx.store });
  }, [slot, spec, ctx.store]);

  if (!spec) {
    console.warn(`motu: no island registered for slot "${slot}"`);
    return null;
  }
  if (!elementSpec) {
    console.warn(`motu: slot "${slot}" wants <${spec.element}>, which is not in the element registry`);
    return null;
  }

  const Component = elementSpec.component;
  const resolved: Record<string, unknown> = {};

  // 1. Declared defaults, so an island renders from defaults alone here too — the rule the lagoon
  //    depends on, and the reason the app's own component never has to grow defaults it does not want.
  for (const input of declaredInputs(elementSpec)) {
    if (input.default !== undefined) resolved[input.name] = input.default;
  }
  // 2. Static props from the archipelago.
  Object.assign(resolved, spec.props ?? {});
  // 3. Reactive binds.
  //
  //    Registry path (no children): an undefined store value must not clobber a declared default.
  //
  //    Hosted path (the page supplied the element): ONE precedence rule — the store wins when the key
  //    is bound and HAS BEEN SET, otherwise the page's own prop stands. `has()` rather than a value
  //    test, so a sibling that deliberately sets a key to `undefined` is honoured instead of silently
  //    falling back to the page.
  for (const [prop, key] of Object.entries(spec.bind ?? {})) {
    if (hosted) {
      if (ctx.store.has(key)) resolved[prop] = ctx.store.get(key);
    } else {
      const value = ctx.store.get(key);
      if (value !== undefined) resolved[prop] = value;
    }
  }
  // 4. Output: each declared callback routes to the archipelago's handler for that event name.
  //    Hosted path: the page's own handler still fires. motu OBSERVES the output; it does not take it
  //    over, or deleting the wrapper would silently drop wiring the page already had.
  if (hosted) {
    for (const [callbackProp, handler] of Object.entries(handlers)) {
      const pageHandler = hostedProps[callbackProp];
      resolved[callbackProp] = (detail: unknown) => {
        if (typeof pageHandler === 'function') (pageHandler as (d: unknown) => void)(detail);
        handler(detail);
      };
    }
  } else {
    Object.assign(resolved, handlers);
  }
  if (fit) resolved.fit = fit;
  Object.assign(resolved, extra ?? {});

  // display:contents — a real element for the lens to outline and for `data-motu-*` markers, with no
  // box of its own, so placing an island changes nothing about the page's layout.
  return createElement(
    'div',
    {
      ref: wrapperRef,
      className,
      'data-motu-island': spec.element,
      'data-motu-slot': slot,
      style: className ? undefined : { display: 'contents' },
    },
    hosted ? cloneElement(hosted, resolved) : createElement(Component as never, resolved),
  );
}
