// SCREENS — what the application looks like at one address: its own layout, and which REGION fills
// which part of it.
//
// EXPERIMENTAL. A prototype of a third level above islands and regions, and deliberately the THINNEST
// of the three. A screen holds no state and declares no keys, writes or flows:
//
//   island   a component with a declared surface
//   region   declared state — who owns each key, which flows it must end in
//   screen   ARRANGEMENT — a route, the app's own layout, region per slot
//
// What it must never become is a bigger region. Regions stay as small as their coupling, every check
// stays per region, and two regions on one screen still share nothing but what the HOST gives each of
// them (a session, the section the URL is in). If two regions on a screen ever need to WRITE the same
// key, that is motu saying they are one region — not a reason for the screen to hold state.
//
// The layout is the APPLICATION'S component — the same rule as a region's `root` and the lagoon's
// `layout`: a second, hand-drawn copy of the arrangement is the drift this framework exists to avoid.
import type { ComponentType, ReactNode } from 'react';
import type { AnyArchipelagoConfig } from '@motu/core';

/**
 * A part of the layout that is NOT a motu region yet — a page still written as plain components.
 *
 * Declared rather than left out, because "this part of the screen is not islanded" is a fact about
 * the app's adoption, and a screen that silently drew nothing there would look like a broken one.
 * The lagoon renders a labelled placeholder naming the reason.
 */
export interface NotARegion {
  notARegion: string;
}

export type ScreenSlot = AnyArchipelagoConfig | NotARegion;

export const notARegion = (reason: string): NotARegion => {
  if (!reason.trim()) throw new Error('motu: notARegion() needs a reason — it is shown on the screen');
  return { notARegion: reason };
};

export const isRegionSlot = (s: ScreenSlot): s is AnyArchipelagoConfig => !('notARegion' in s);

export interface ScreenContext {
  /** The route's parameters (`/member/:memberId` -> `{ memberId }`). */
  params: Record<string, string>;
}

export interface ScreenConfig {
  id: string;
  label?: string;
  /** The route, Express-style: `/events`, `/member/:memberId`. Matched against a whole pathname. */
  path: string;
  /** The application's own layout component. Each key of `slots` is one of its props. */
  layout: ComponentType<Record<string, unknown>>;
  /**
   * What the app renders AROUND this layout, outermost first — the providers of the layouts above it
   * that cannot themselves render here (a Next root layout draws <html>/<body> and loads fonts). The
   * application's own components, listed, never re-implemented: Peps' dashboard sidebar needs the
   * root layout's `CookieConsentProvider`, and without it threw before the screen drew anything.
   */
  providers?: ComponentType<{ children?: ReactNode }>[];
  /** Layout prop -> the region that fills it (or `notARegion(why)`). */
  slots: Record<string, ScreenSlot>;
  /**
   * What the HOST gives each region on this screen, by region id — the values the page's own code
   * would `provide` (the section the URL is in, who is signed in, a member resolved from `:memberId`).
   * Merged over the region's own lagoon seed. Data only: a screen computes no region state.
   */
  host?: (ctx: ScreenContext) => Record<string, Record<string, unknown>>;
  /** A concrete path to open the screen at, for a route with parameters. Defaults to `path`. */
  example?: string;
  /**
   * Which parameters the LAGOON can honour — `true`, or the reason it cannot.
   *
   * `path` is the APP's route, so a link to any team is a link the app serves and the static check
   * accepts it. But a region's lagoon stand-ins are often fixed on one entity (a channel built on one
   * team), and opening `/teams/<another>` would then show that one team under the other's id — the
   * silent substitution motu refuses everywhere else. So the screen refuses those params out loud,
   * with the reason, and serves the ones it can.
   */
  accepts?: (params: Record<string, string>) => true | string;
}

/** Declare a screen. Identity at runtime; the point is the type, and one place a check can read. */
export function screen(config: ScreenConfig): ScreenConfig {
  if (!config.path.startsWith('/')) throw new Error(`motu: screen "${config.id}" path must start with "/" (got "${config.path}")`);
  if (/:[A-Za-z_]\w*/.test(config.path) && !config.example) {
    throw new Error(`motu: screen "${config.id}" has a parameter in "${config.path}" — give it an \`example\` path to open it at`);
  }
  return config;
}

/** `/member/:memberId` -> a matcher returning the params, or null. Whole-path, trailing slash tolerated. */
export function compileScreenPath(path: string): (pathname: string) => Record<string, string> | null {
  const names: string[] = [];
  const source = path
    .replace(/\/+$/, '')
    .split('/')
    .map((part) => {
      const m = /^:([A-Za-z_]\w*)$/.exec(part);
      if (m) {
        names.push(m[1]!);
        return '([^/]+)';
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  const re = new RegExp(`^${source || ''}/?$`);
  return (pathname) => {
    const hit = re.exec(pathname.split(/[?#]/)[0] ?? '');
    if (!hit) return null;
    return Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(hit[i + 1] ?? '')]));
  };
}

/** The screen a path opens, and its params — or null when no declared screen serves it. */
export function matchScreen(screens: readonly ScreenConfig[], pathname: string): { screen: ScreenConfig; params: Record<string, string> } | null {
  for (const s of screens) {
    const params = compileScreenPath(s.path)(pathname);
    if (params) return { screen: s, params };
  }
  return null;
}
