import { createElement, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { defineIsland } from '@motu/core';
import { runWithIsland } from '@motu/runtime';
import type { MotuTheme, MotuFit, LegacyStrategy, IslandElementOptions, IslandIsolation, IslandMount } from '@motu/core';
import type { EffectEntry } from '@motu/types';

// Stripped in production (see the debug overlay). Only in debug builds does rendering run inside an
// island attribution window, so contract calls made in effects are tied to this island.
declare const __MOTU_DEBUG__: boolean;
const DEBUG = typeof __MOTU_DEBUG__ !== 'undefined' && __MOTU_DEBUG__;

type AttrType = 'string' | 'number' | 'boolean';

type PropEntry<P> = (keyof P & string) | { name: keyof P & string; default?: unknown; required?: boolean };

export interface DefineOptions<P> {
  /**
   * The island contract (input / output / effects) in one place — the same grouped form the AngularJS
   * adapter uses, so an island's whole boundary is declared here rather than as loose props/events.
   * When set, `contract.input` supplies props and `contract.output` supplies events.
   */
  contract?: {
    /** INPUT — props fed from the store/host (data in). */
    input?: readonly PropEntry<P>[];
    /**
     * OUTPUT — callback prop -> CustomEvent name (data out), e.g. `{ onReset: 'reset' }`.
     *
     * The prop is `keyof P`: an island whose declared output does not exist on the component emits
     * nothing, silently, for as long as nobody notices. That was a runtime discovery ("declared but
     * never fired"); here it is a build error.
     */
    output?: Readonly<Partial<Record<keyof P & string, string>>>;
    /**
     * EFFECTS — everything this island reaches that it was not handed: a service module it imports, a
     * React context, a session hook, an AngularJS scope name, a database table.
     *
     * The third leg of the boundary, and the one that used to be two. `ambient` lived here (typed only
     * for React islands) while `coupling` lived in `@motu/core` (typed for everyone and holding
     * AngularJS mount mechanisms) — one idea under two names, in two files, neither complete. See
     * `IslandContract.effects`; the kind prefixes are documented there.
     *
     * It is the reach most likely to make an island unmountable somewhere else, and it hides: standing
     * a module down in the lagoon's `alias` table looks like build configuration rather than a
     * dependency. Verify derives the true list — from that table for modules, from what the region
     * actually reached for data — and reconciles it with this one.
     */
    effects?: readonly EffectEntry[];
  };
  /** How it attaches to a legacy scope (AngularJS). Mechanism, not boundary — see `IslandMount`. */
  mount?: IslandMount;
  /**
   * Props set imperatively from JS (structured data goes here, never attributes). Either a bare name
   * or a `{ name, default?, required? }` spec so the wrapper fills defaults / flags a missing required
   * prop at mount. `name` is constrained to the component's props. Superseded by `contract.input`.
   */
  props?: readonly PropEntry<P>[];
  /** Attribute names + coercion type (attributes are always strings in the DOM). */
  attributes?: Partial<Record<keyof P & string, AttrType>>;
  /** Stylesheet text adopted into the shadow root (e.g. compiled theme), shared per tag. */
  css?: string;
  /** Default skin when nothing sets data-motu-theme. Embedded should pass 'legacy' (match host). */
  defaultTheme?: MotuTheme;
  /**
   * Legacy-fit strategy — how this island satisfies the host's footprint when mounted in legacy fit.
   * 'fill'/'inline' are CSS-only (zero component code); 'structural' means the component branches on
   * the injected `fit` prop. See LegacyStrategy.
   *
   * REQUIRED when the project's host has a legacy skin, and that requirement is enforced by
   * `motu island verify` (which reads the posture from motu.config.json) rather than by this type
   * (which cannot). Under `host: next` it is not optional but ABSENT — see the `legacy-strategy` rule.
   */
  legacy?: LegacyStrategy;
  /** Default footprint when nothing sets data-motu-fit. Defaults to 'native' (modern shape). */
  defaultFit?: MotuFit;
  /**
   * Maps a component callback prop to the DOM CustomEvent it dispatches, e.g.
   * `{ onCriteriaChanged: 'criteria-changed' }`. The wrapper injects each `onXxx` callback, so the
   * component stays plain React (props in, callbacks out) with no framework `emit`.
   */
  events?: Record<string, string>;
  /**
   * Runtime encapsulation. Defaults to 'shadow' (isolated). Pass 'light' to render into the element
   * itself and inherit the host's styles/forms/events — for a friendly, same-language ocean.
   */
  isolation?: IslandIsolation;
}

/**
 * Wraps a plain React component in a motu island custom element. All the neutral plumbing (shadow or
 * light root, theme/fit/legacy axes, imperative props, attribute coercion, injected event callbacks)
 * lives in `defineIsland`; this only supplies the React rendering adapter, so the component stays
 * plain React (props in, `onXxx` callbacks out) with no framework code.
 */
export function defineReactElement<P extends object>(
  tag: string,
  Component: ComponentType<P & { fit?: MotuFit }>,
  opts: DefineOptions<P>,
): void {
  defineIsland(
    tag,
    ({ container, props }) => {
      const root = createRoot(container);
      const paint = (p: unknown) => root.render(createElement(Component, p as P & { fit?: MotuFit }));
      // In debug builds, force the render (and its passive effects, e.g. a self-fetch on prop change)
      // to run synchronously inside this island's attribution window, so any contract call fired there
      // is tied to this tag. flushSync only affects timing in the debug build; prod paints normally.
      const commit = DEBUG
        ? (p: unknown) => runWithIsland(tag, () => flushSync(() => paint(p)))
        : paint;
      commit(props);
      return {
        update: (next) => commit(next),
        unmount: () => root.unmount(),
      };
    },
    opts as unknown as IslandElementOptions,
  );
}
