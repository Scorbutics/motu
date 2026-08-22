// Framework-level app assembly. The project supplies a declarative element registry and archipelago
// configs; this wires them: register the custom elements, define each archipelago, then upgrade the
// native placement markers. Keeps composition roots to transport + mode overrides + this one call.

import type { ComponentType } from 'react';
import type { MotuTheme, MotuFit } from '@motu/core';
import {
  defineArchipelago,
  defineArchipelagoElement,
  defineIslandElement,
  type ArchipelagoConfig,
  type ArchipelagoOptions,
  type Channel,
  type HostBridge,
} from '@motu/core';
import { defineReactElement, type DefineOptions } from './defineReactElement';

/** A React-backed registry row: a tag bound to a React component + its options. */
export interface ReactElementSpec<P extends object = any> {
  /**
   * This island shares state with no other island, permanently.
   *
   * An archipelago is shared state; most islands are in none. Declaring it here rather than passing a
   * flag to verify makes it a property of the island — so the check means the same thing whoever runs
   * it, and "not in an archipelago" stops reading as unfinished work.
   */
  standalone?: boolean;
  tag: string;
  component: ComponentType<any>;
  options: Omit<DefineOptions<P>, 'css' | 'defaultTheme'> & { defaultTheme?: MotuTheme };
}

/**
 * A self-registering row for non-React renderers (e.g. an AngularJS island): given the shared
 * css/defaultTheme, it registers its own custom element (via defineAngularElement, etc.). This keeps
 * registerElements — and @motu/react — free of any renderer-specific import.
 */
/**
 * Declare a React-backed island, with its contract checked against the component's own props.
 *
 * A plain `const element: ElementSpec = {…}` annotation cannot do this: `ElementSpec` defaults its
 * props type to `any`, so `input: ['missinos']` and `output: { onProgres: 'x' }` both compile and the
 * island quietly binds — and emits — nothing. Inferring `P` from `component` is what makes the
 * contract answerable by the compiler:
 *
 *   export const element = islandElement({
 *     tag: 'x-week-actions',
 *     component: WeekActionsView,
 *     options: { contract: { input: ['missions'], output: { onProgress: 'week-progress' } } },
 *   });
 *
 * The `const` type parameter keeps the literals — `'week-progress'`, not `string` — so an archipelago
 * can check its `writes` and `on` keys against the events this island actually declares (see
 * `RegionWiringOk`). Without it the tag and every event name widen and the wiring is unverifiable.
 */
export function islandElement<const S extends IslandElementShape>(spec: S & ContractOf<S>): S {
  return spec;
}

/** The loose shape S is inferred against — literals intact, nothing checked yet. */
interface IslandElementShape {
  standalone?: boolean;
  tag: string;
  component: ComponentType<any>;
  options: { contract?: { input?: readonly unknown[]; output?: Readonly<Record<string, string>> } } & Record<string, unknown>;
}

/**
 * The same spec, with its contract re-typed against the component's own props — checked in a second
 * pass, once `S` (and with it the component) has been inferred. Inferring `P` in the same position it
 * is constrained would collapse it to `never`.
 */
type ContractOf<S extends IslandElementShape> = {
  options: Omit<DefineOptions<PropsOf<S['component']>>, 'css' | 'defaultTheme'> & { defaultTheme?: MotuTheme };
};

// `NonNullable` is load-bearing. motu's own scaffold writes `({ title = 'x' }: Props = {})`, whose
// parameter is OPTIONAL, so against React 19's `FunctionComponent<P> = (props: P) => ReactNode` the
// inference is `Props | undefined` — and `keyof (Props | undefined)` is `never`, which silently turns
// every declared `contract.input` name into a type error naming no valid alternative. Found by
// integrating into Twenty; peps never saw it because its React 18 types infer differently.
type PropsOf<C> = C extends ComponentType<infer P> ? NonNullable<P> : never;

export interface CustomElementSpec {
  tag: string;
  define: (shared: RegisterElementsOptions) => void;
}

/** One row of the project's element registry: React-backed, or self-registering for other renderers. */
export type ElementSpec = ReactElementSpec | CustomElementSpec;

export interface RegisterElementsOptions {
  /** Compiled stylesheet text adopted into every island shadow root. */
  css?: string;
  /** Default skin applied unless an entry overrides it. */
  defaultTheme?: MotuTheme;
}

/** Registers every element in the registry, injecting the shared css + default theme. */
export function registerElements(registry: ElementSpec[], opts: RegisterElementsOptions = {}): void {
  for (const entry of registry) {
    if ('define' in entry) {
      entry.define(opts);
      continue;
    }
    const { tag, component, options } = entry;
    defineReactElement(tag, component, {
      ...options,
      css: opts.css,
      defaultTheme: options.defaultTheme ?? opts.defaultTheme,
    } as DefineOptions<any>);
  }
}

export interface MotuArchipelago {
  config: ArchipelagoConfig;
  options?: ArchipelagoOptions;
}

export interface MotuAppConfig {
  /** The project's declarative element registry. */
  elements: ElementSpec[];
  /** Archipelagos to define, each with its mode-specific host/seed/channels. */
  archipelagos: MotuArchipelago[];
  /** Compiled stylesheet text for the island shadow roots. */
  css?: string;
  /** Default skin ('legacy' embedded, 'motu' standalone). */
  defaultTheme?: MotuTheme;
}

/** Assembles a motu app from declarative config. Call once at a composition root. */
export function defineMotuApp(app: MotuAppConfig): void {
  registerElements(app.elements, { css: app.css, defaultTheme: app.defaultTheme });
  for (const { config, options } of app.archipelagos) {
    defineArchipelago(config, options);
  }
  defineIslandElement();
  defineArchipelagoElement('motu-archipelago', app.css);
}

/** What the lagoon renders in isolation: a single island (by tag) or a whole archipelago (by config). */
export type LagoonTarget =
  | { kind: 'island'; tag: string; fit?: MotuFit }
  | { kind: 'archipelago'; config: ArchipelagoConfig };

export interface DefineLagoonOptions {
  /** The project's element registry (same as the real composition roots use). */
  elements: ElementSpec[];
  /** Compiled island stylesheet text. */
  css?: string;
  /** Default skin — the lagoon previews the modern look, so 'motu'. */
  defaultTheme?: MotuTheme;
  /** Outward channel; a warning no-op by default. */
  host?: HostBridge;
  /** Initial store contents so bound islands render meaningfully. */
  seed?: Record<string, unknown>;
  /** Inbound channels: host signals mirrored into the store (same as the real composition roots). */
  channels?: Channel[];
}

/** The prop names an island declares as input, from either the grouped `contract.input` or `props`. */
function declaredInputs(elements: ElementSpec[], tag: string): string[] {
  const spec = elements.find((e) => e.tag === tag) as ReactElementSpec | undefined;
  const options = spec?.options as
    | { contract?: { input?: unknown[] }; props?: unknown[] }
    | undefined;
  const entries = options?.contract?.input ?? options?.props ?? [];
  return entries
    .map((p) => (typeof p === 'string' ? p : (p as { name?: string })?.name))
    .filter((n): n is string => typeof n === 'string' && n.length > 0);
}

/**
 * Store-key -> prop binds for a lone island in the lagoon.
 *
 * Seeded keys alone are not enough. The lagoon entry of a scaffolded project passes no seed at all —
 * it cannot know which island the build is focused on — so deriving binds only from the seed left a
 * single-island target with NO binds, and `provide()` had nothing to drive. verify's data-flow check
 * then reported "inputs don't reach the output" for every async island, which was true of the harness
 * rather than of the island. Bind every DECLARED input as well: the element spec already states what
 * the island accepts, so the store can drive any of it. Binds for props the island lacks are inert.
 */
function islandBind(elements: ElementSpec[], tag: string, seed: Record<string, unknown> | undefined): Record<string, string> {
  const names = new Set<string>([...Object.keys(seed ?? {}), ...declaredInputs(elements, tag)]);
  return Object.fromEntries([...names].map((k) => [k, k]));
}

/**
 * The lagoon: mount ONE target in isolation against whatever transport the caller already configured
 * (Mock in verify / offline preview). For an island target it synthesises a one-island archipelago so
 * the same mount path (<motu-archipelago> → <motu-island>) is exercised as in production. Returns the
 * <motu-archipelago> element; append it to the DOM to render.
 */
/**
 * The archipelago a lagoon target represents. Extracted so the element path and the React path build
 * the SAME config — an island target must not mean two different things depending on how it mounts.
 */
export function lagoonArchipelagoConfig(target: LagoonTarget, opts: Pick<DefineLagoonOptions, 'elements' | 'seed'>): ArchipelagoConfig {
  return target.kind === 'archipelago'
    ? target.config
    : {
        id: 'lagoon',
        islands: [{ slot: 'lagoon', element: target.tag, bind: islandBind(opts.elements, target.tag, opts.seed) }],
        layout: `<motu-island slot="lagoon"${target.fit ? ` fit="${target.fit}"` : ''}></motu-island>`,
      };
}

export function defineLagoon(target: LagoonTarget, opts: DefineLagoonOptions): HTMLElement {
  const config: ArchipelagoConfig =
    target.kind === 'archipelago'
      ? target.config
      : {
          id: 'lagoon',
          // Bind the island's declared inputs (and any seeded key) to same-named store keys, so
          // writing the store actually DRIVES the island — otherwise a lone island can't be exercised
          // by input and its props stay at their defaults. This is what lets verify's differentiation
          // check feed distinct values and observe distinct output.
          islands: [
            { slot: 'lagoon', element: target.tag, bind: islandBind(opts.elements, target.tag, opts.seed) },
          ],
          layout: `<motu-island slot="lagoon"${target.fit ? ` fit="${target.fit}"` : ''}></motu-island>`,
        };

  defineMotuApp({
    elements: opts.elements,
    css: opts.css,
    defaultTheme: opts.defaultTheme ?? 'motu',
    archipelagos: [{ config, options: { host: opts.host, seed: opts.seed, channels: opts.channels } }],
  });

  const el = document.createElement('motu-archipelago');
  el.setAttribute('name', config.id);
  return el;
}
