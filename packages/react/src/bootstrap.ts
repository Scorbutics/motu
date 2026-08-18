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
import { defineReactElement, type DefineOptions } from './defineReactElement.js';

/** A React-backed registry row: a tag bound to a React component + its options. */
export interface ReactElementSpec<P extends object = any> {
  tag: string;
  component: ComponentType<any>;
  options: Omit<DefineOptions<P>, 'css' | 'defaultTheme'> & { defaultTheme?: MotuTheme };
}

/**
 * A self-registering row for non-React renderers (e.g. an AngularJS island): given the shared
 * css/defaultTheme, it registers its own custom element (via defineAngularElement, etc.). This keeps
 * registerElements — and @motu/react — free of any renderer-specific import.
 */
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

/** Bind each seeded store key to a same-named island prop (`{ criteria: 'criteria', … }`). */
function seedBind(seed: Record<string, unknown> | undefined): Record<string, string> {
  return Object.fromEntries(Object.keys(seed ?? {}).map((k) => [k, k]));
}

/**
 * The lagoon: mount ONE target in isolation against whatever transport the caller already configured
 * (Mock in verify / offline preview). For an island target it synthesises a one-island archipelago so
 * the same mount path (<motu-archipelago> → <motu-island>) is exercised as in production. Returns the
 * <motu-archipelago> element; append it to the DOM to render.
 */
export function defineLagoon(target: LagoonTarget, opts: DefineLagoonOptions): HTMLElement {
  const config: ArchipelagoConfig =
    target.kind === 'archipelago'
      ? target.config
      : {
          id: 'lagoon',
          // Bind every seeded store key to a same-named prop so seeding the store actually DRIVES a
          // single island (otherwise a lone island can't be exercised by input — its props stay
          // default). This is what lets verify's differentiation check feed distinct seeds and observe
          // distinct output. Extra binds for props the island lacks are harmless.
          islands: [
            { slot: 'lagoon', element: target.tag, bind: seedBind(opts.seed) },
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
