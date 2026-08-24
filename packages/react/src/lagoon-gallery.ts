// The lagoon gallery, framework-side.
//
// This used to be scaffolded into every project as a ~130-line `main.tsx`. That was a mistake with a
// long tail: the gallery is FRAMEWORK behaviour, so every improvement to it (the tide line, the seam
// lens, recorded callsite frames) reached only projects scaffolded after the change, and older ones
// silently kept a worse lagoon with no signal that they were behind. Anything motu owns belongs here,
// where `git pull` delivers it; what stays in the project is only what motu cannot know.
//
// A project therefore declares its lagoon in `lagoon.config.json`, and — when a declaration cannot
// express it — overrides behaviour in `lagoon.ts`. The remaining shim (`main.tsx`) is glue that must
// live in the app because Vite requires it there: the build-time defines, `import.meta.glob`, the
// project's own registry, and the debug overlay (which @motu/react must not depend on, so the app
// hands it in).
import { configure, HttpTransport, type Transport } from '@motu/runtime';
import { MockTransport, type Fixture } from '@motu/runtime/mock';
import { setDefaultIsolation, applyMotuChrome, markSandbox } from '@motu/core';
import type { DeclaredChannel } from '@motu/core';
import type { ReactNode } from 'react';
import type { ArchipelagoConfig, Channel, HostBridge, IslandIsolation, MotuChromeTheme, MotuTheme } from '@motu/core';
import { defineMotuApp, type ElementSpec } from './bootstrap';
import { resolveTransportMode, mountTransportToggle, type TransportMode } from './transport-toggle';
import { mountFitToggle } from './fit-toggle';
import { mountTideLine, type TideLens, type TideView } from './tideline';
import { mountReactLagoon } from './lagoon-react-mount';

/** `lagoon.config.json` — everything about a project's lagoon that a declaration can carry. */
export interface LagoonConfig {
  /** Prose the palette shows under "About this lagoon". */
  about?: string;
  /** Build-time transport default. `MOTU_TRANSPORT` overrides; a browser toggle overrides that. */
  transport?: TransportMode;
  /** Base URL for the HTTP transport, when this project has a dispatcher to talk to. */
  httpBase?: string;
  /** Skin. The lagoon previews the end design, so 'motu' unless a project says otherwise. */
  defaultTheme?: MotuTheme;
  /**
   * Point motu's own chrome at this application's colours, so the tooling looks like it belongs to
   * the page it frames instead of to motu. Reference the host's tokens rather than copying values:
   * `{ "primary": "hsl(var(--primary))", "onPrimary": "hsl(var(--primary-foreground))" }`. Omit it
   * and motu's teal stands.
   */
  chrome?: MotuChromeTheme;
  /**
   * Per-archipelago presentation, keyed by id: a human label and an explicit order. Ids absent from
   * this map still appear (a new archipelago must never need a config edit to become visible) — they
   * sort after the listed ones, by registry order.
   */
  stations?: Record<string, { label?: string; order?: number }>;
  /** Archipelago ids to leave out of the gallery entirely. */
  exclude?: string[];
}

/** `lagoon.ts` — the escape hatch for what a JSON declaration cannot hold: functions and objects. */
export interface LagoonOverrides {
  /**
   * Per region: the environment its islands cannot render without, installed in EVERY view.
   *
   * Distinct from `layout`, which is the ARRANGEMENT and only the region view renders. See
   * `mountReactLagoon`'s `providers` for the failure that made the distinction necessary.
   */
  providers?: Record<string, (children: ReactNode, slot: string) => ReactNode>;
  /** Outward seam. Defaults to logging intents, which is what you want with no router present. */
  host?: HostBridge;
  /** Inbound channels per archipelago id — host signals mirrored into the store. */
  channels?: Record<string, DeclaredChannel[]>;
  /** Initial store contents per archipelago id, so bound islands render meaningfully. */
  seed?: Record<string, Record<string, unknown>>;
  /**
   * Per region, per slot: the props the PAGE passes on the island element itself.
   *
   * The page has always been able to write `<R.Island slot="diff-viewer" props={{ shotUrl }} />` for
   * what is not region state — where the host lives, a formatter, a URL builder — and the lagoon had
   * no counterpart at all. So the island rendered here without them and nothing said so: they are not
   * bound keys, so `fed` does not look, and a flow asserting the island's TEXT passes while the part
   * that needs the prop is blank. Measured on the review console: the diff viewer's <img> had
   * `src=""` and `naturalWidth: 0` — the whole point of the island — with every check green.
   *
   * DATA, like `seed`, and a stand-in is expected: the lagoon's `shotUrl` should return a fixture
   * image, not reach the real host.
   */
  props?: Record<string, Record<string, Record<string, unknown>>>;
  /**
   * The region's ARRANGEMENT, per archipelago id — rendered by calling the APPLICATION's own layout
   * component with islands in its slots.
   *
   * The alternative is an archipelago-level `layout` template, which is a second copy of an
   * arrangement the host page already expresses — the same restate-instead-of-reference mistake the
   * region contract type exists to prevent, and it drifts the same way. A React host has a real
   * component for this; point at it:
   *
   *   layout: { actions: (island) => <ActionsLayout notice={island('activity-notice')} … /> }
   *
   * `island(slot)` renders the island registered for that slot. A slot the layout does not place
   * simply does not appear — which is how the lagoon shows a region whose page also holds non-island
   * content. Absent => the archipelago's `layout` template, then declared order.
   */
  layout?: Record<string, (island: (slot: string) => ReactNode) => ReactNode>;
  /** Run before anything mounts — e.g. standing up a fake host for a foreign-framework island. */
  setup?: () => void;
  /**
   * Build the transport yourself, when `httpBase` cannot say enough — a dispatcher behind XSRF
   * cookie/header names, a custom session hook. Return undefined to fall back to the default for that
   * mode. The lagoon must still work offline, so 'mock' should normally be left alone.
   */
  transportFor?: (mode: TransportMode) => Transport | undefined;
}

/** The dev-only seam lens, handed in by the app so @motu/react keeps no dependency on it. */
export interface LagoonLens extends TideLens {
  mount: (opts: { chip: boolean }) => void;
}

export interface StartLagoonOptions {
  elements: ElementSpec[];
  /** The project's archipelagos by id (its registry). */
  archipelagos: Record<string, ArchipelagoConfig>;
  fixtures?: Fixture[];
  roles?: string[];
  css?: string;
  config?: LagoonConfig;
  overrides?: LagoonOverrides;
  /** Project-wide isolation, injected from motu.config.json by the lagoon's vite config. */
  isolation?: IslandIsolation;
  /** Build-time transport default (`MOTU_TRANSPORT`), '' when unset. */
  transport?: string;
  /**
   * Build-time target (`MOTU_TARGET`), e.g. "archipelago:actions". `motu lagoon serve/publish
   * --archipelago X` sets it so the artifact opens on that region instead of whatever the last
   * visitor happened to select.
   */
  target?: string;
  /** False strips the lens and its tab. */
  debug?: boolean;
  /**
   * How islands attach — must match the host application, and the focused lagoon. 'react' renders
   * them in this page's own tree; 'element' uses <motu-archipelago> custom elements.
   */
  mount?: 'element' | 'react';
  lens?: LagoonLens;
  /** Recorded callsite frames (`motu archipelago record-frame` output), as a Vite glob result. */
  frames?: Record<string, string>;
  /** Element the archipelago mounts into. */
  mountId?: string;
}

/** Intents have nowhere real to go here — logging them is the point: you SEE that an island emitted a
 *  navigation instead of performing one, which is the rule the lagoon exists to keep honest. */
const LOGGING_HOST: HostBridge = {
  navigate: (path) => console.log('[host] navigate', path),
  action: (name, detail) => console.log('[host] action', name, detail),
};

const STORAGE_KEY = 'motu:lagoon:archipelago';
const VIEW_KEY = 'motu:lagoon:view';

const DEFAULT_ABOUT =
  'This is the lagoon: the project&apos;s islands rendered against fixtures, with no backend, no ' +
  'session and no host application around them. What renders here is what an island can do on its own.';

/** Stations in display order: configured ones first (by `order`, then registry order), then the rest. */
function resolveStations(
  archipelagos: Record<string, ArchipelagoConfig>,
  config: LagoonConfig,
): { id: string; label: string }[] {
  const exclude = new Set(config.exclude ?? []);
  const stations = config.stations ?? {};
  return Object.keys(archipelagos)
    .filter((id) => !exclude.has(id))
    .map((id, index) => ({
      id,
      label: stations[id]?.label ?? id,
      // Unlisted ids sort after listed ones, keeping registry order among themselves. A new
      // archipelago shows up on its own; configuring it is for renaming and ordering, not visibility.
      order: stations[id]?.order ?? Number.MAX_SAFE_INTEGER - Object.keys(archipelagos).length + index,
    }))
    .sort((a, b) => a.order - b.order)
    .map(({ id, label }) => ({ id, label }));
}

/**
 * Boot the lagoon gallery: every archipelago the project ships, under motu's own chrome.
 *
 * The single-target lagoon (`bootstrapLagoon`) is the one `motu island verify` drives and stays bare
 * on purpose. This is the human surface.
 */
export function startLagoon(opts: StartLagoonOptions): void {
  const config = opts.config ?? {};
  const overrides = opts.overrides ?? {};

// THE LAGOON IS NOT PRODUCTION, and coverage must know it before any region mounts. A lagoon that
// beacons posts the states its own FLOWS produce into the corpus, and the next comparison reports
// them as covered in production — the tool validating itself, with a report that looks better rather
// than broken. The fold still runs; only egress is refused. See markSandbox.
markSandbox();
  if (opts.isolation) setDefaultIsolation(opts.isolation);
  // Before anything paints, so the chrome never flashes motu's default over the host's palette.
  applyMotuChrome(config.chrome ?? {});
  overrides.setup?.();

  const mode = resolveTransportMode(typeof opts.transport === 'string' ? opts.transport : config.transport ?? '');
  // Mock by default and mock whenever there is nothing to talk to: the lagoon has to work with no
  // backend, no session and no login, or it is not a place a loop can close in.
  const custom = overrides.transportFor?.(mode);
  if (custom) {
    configure(custom);
  } else if (mode === 'http' && config.httpBase) {
    configure(new HttpTransport(config.httpBase));
  } else {
    configure(new MockTransport(opts.fixtures ?? [], opts.roles ?? []));
  }

  const host = overrides.host ?? LOGGING_HOST;
  const stations = resolveStations(opts.archipelagos, config);

  const react = opts.mount === 'react';
  // THE ISLAND STYLESHEET, on the React path too.
  //
  // Only the element path passed `css` to `defineMotuApp`, so a project mounting with React bundled
  // its `shared/styles.css` and never inserted it — the sheet `motu init` scaffolds, and that
  // `css-tokens` checks, was dead on arrival. The Next hosts never noticed: their styling arrives
  // through the app's own globals.css, not through this. A greenfield vite project styled nothing at
  // all until it was published and looked at.
  //
  // Light DOM, so one <style> in the head; the element path adopts the same text per shadow root.
  if (react && opts.css && typeof document !== 'undefined') {
    const ID = 'motu-island-styles';
    if (!document.getElementById(ID)) {
      const style = document.createElement('style');
      style.id = ID;
      style.textContent = opts.css;
      document.head.appendChild(style);
    }
  }
  // The element path has to define the custom elements up front. The React path must NOT: defining
  // them would register the islands' archipelagos a second time and hand the elements a different
  // store than the one <ArchipelagoProvider> resolves.
  if (!react) {
    defineMotuApp({
      elements: opts.elements,
      css: opts.css,
      defaultTheme: config.defaultTheme ?? 'motu',
      // `stations` is derived from `opts.archipelagos`, so every id resolves — but
      // `noUncheckedIndexedAccess` cannot see that, and adopting projects type-check this source.
      // Filtered rather than asserted: an id that somehow had no config would render an empty
      // station, and dropping it is the honest answer.
      archipelagos: stations.flatMap(({ id }) => {
        const config = opts.archipelagos[id];
        return config
          ? [{ config, options: { host, seed: overrides.seed?.[id], channels: overrides.channels?.[id] } }]
          : [];
      }),
    });
  }

  // Recorded callsite frames: stand-in geometry for each slot's real placement in the host. Lagoon
  // only — in the host, the real callsite supplies the container.
  const frames = Object.values(opts.frames ?? {});
  if (frames.length) {
    const style = document.createElement('style');
    style.textContent = frames.join('\n');
    document.head.appendChild(style);
  }

  const root = document.getElementById(opts.mountId ?? 'lagoon-root');
  if (!root) throw new Error(`lagoon: no #${opts.mountId ?? 'lagoon-root'} element to mount into`);

  const ids = stations.map((s) => s.id);
  // A build-time target wins over the remembered selection: it is what the artifact was published
  // FOR, and a stale localStorage entry from a different region should not override it.
  const targeted = (opts.target ?? '').startsWith('archipelago:') ? (opts.target ?? '').slice('archipelago:'.length) : '';
  let current = targeted || localStorage.getItem(STORAGE_KEY) || '';
  if (!ids.includes(current)) current = ids[0] ?? '';
  let view: TideView = localStorage.getItem(VIEW_KEY) === 'mountpoints' ? 'mountpoints' : 'region';

  function mount(id: string): void {
    if (!id) return;
    current = id;
    localStorage.setItem(STORAGE_KEY, id);

    if (react) {
      // Same path the host application and `motu island verify` use, so the surface a human judges
      // here is the one that ships and the one that was verified.
      mountReactLagoon(root, opts.archipelagos[id]!, {
        elements: opts.elements,
        host,
        seed: overrides.seed?.[id],
        channels: overrides.channels?.[id],
        layout: overrides.layout?.[id],
        providers: overrides.providers?.[id],
        props: overrides.props?.[id],
        view,
      });
      tide.setActive(current, view);
      return;
    }

    root!.replaceChildren();
    const el = document.createElement('motu-archipelago');
    el.setAttribute('name', id);
    // 'mountpoints' frames each slot separately (islands placed individually across the host);
    // 'region' renders the archipelago's own layout.
    if (view === 'mountpoints') el.setAttribute('view', 'mountpoints');
    root!.appendChild(el);
    tide.setActive(current, view);
  }

  // The lens mounts BEFORE the chrome — it restores its own open state, so it remembers being on
  // across a reload. No chip in the toolbar: the lens draws its own tab on the edge of its panel, so
  // opening and closing happen in one place instead of from inside a popup that closes behind it.
  const lens = opts.debug === false ? undefined : opts.lens;
  lens?.mount({ chip: false });

  const tide = mountTideLine({
    stations,
    transport: mode,
    about: config.about ?? DEFAULT_ABOUT,
    lens: lens ? { toggle: lens.toggle, isOpen: lens.isOpen, subscribe: lens.subscribe } : undefined,
    onStation: (id) => mount(id),
    onView: (next) => {
      view = next;
      localStorage.setItem(VIEW_KEY, next);
      mount(current);
    },
  });

  if (ids.length) {
    mount(current);
  } else {
    root.innerHTML =
      '<p style="color:#6b7280;padding:40px 20px">No archipelagos yet — run <code>motu archipelago ' +
      'create &lt;id&gt;</code>, then <code>motu island create &lt;name&gt;</code>.</p>';
  }

  // Chips adopted into the tide bar: the transport calls run through, and the fit the region wears.
  mountTransportToggle(mode);
  mountFitToggle();
}
