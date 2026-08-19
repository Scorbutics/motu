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
import { setDefaultIsolation } from '@motu/core';
import type { ArchipelagoConfig, Channel, HostBridge, IslandIsolation, MotuTheme } from '@motu/core';
import { defineMotuApp, type ElementSpec } from './bootstrap.js';
import { resolveTransportMode, mountTransportToggle, type TransportMode } from './transport-toggle.js';
import { mountFitToggle } from './fit-toggle.js';
import { mountTideLine, type TideLens, type TideView } from './tideline.js';

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
  /** Outward seam. Defaults to logging intents, which is what you want with no router present. */
  host?: HostBridge;
  /** Inbound channels per archipelago id — host signals mirrored into the store. */
  channels?: Record<string, Channel[]>;
  /** Initial store contents per archipelago id, so bound islands render meaningfully. */
  seed?: Record<string, Record<string, unknown>>;
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
  /** False strips the lens and its buoy. */
  debug?: boolean;
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

  if (opts.isolation) setDefaultIsolation(opts.isolation);
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

  defineMotuApp({
    elements: opts.elements,
    css: opts.css,
    defaultTheme: config.defaultTheme ?? 'motu',
    archipelagos: stations.map(({ id }) => ({
      config: opts.archipelagos[id],
      options: { host, seed: overrides.seed?.[id], channels: overrides.channels?.[id] },
    })),
  });

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
  let current = localStorage.getItem(STORAGE_KEY) ?? '';
  if (!ids.includes(current)) current = ids[0] ?? '';
  let view: TideView = localStorage.getItem(VIEW_KEY) === 'mountpoints' ? 'mountpoints' : 'region';

  function mount(id: string): void {
    if (!id) return;
    current = id;
    localStorage.setItem(STORAGE_KEY, id);
    root!.replaceChildren();
    const el = document.createElement('motu-archipelago');
    el.setAttribute('name', id);
    // 'mountpoints' frames each slot separately (islands placed individually across the host);
    // 'region' renders the archipelago's own layout.
    if (view === 'mountpoints') el.setAttribute('view', 'mountpoints');
    root!.appendChild(el);
    tide.setActive(current, view);
  }

  // The lens mounts BEFORE the chrome, which reads its restored state to draw the buoy — so the lens
  // remembers being on across a reload. No chip of its own: the tide bay owns the trigger, or a
  // page-wide lens would be summoned from inside a popup that closes behind it.
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
