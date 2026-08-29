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
import { installMotuChrome } from '@motu/chrome/css';
import { PAGE_SHELL_CSS } from '@motu/chrome/html';
import { detectPrimarySettled, primaryVars } from '@motu/chrome/primary';
import type { DeclaredChannel } from '@motu/core';
import type { ReactNode } from 'react';
import type { ArchipelagoConfig, Channel, HostBridge, IslandIsolation, MotuChromeTheme, MotuTheme } from '@motu/core';
import { defineLagoon, defineMotuApp, lagoonArchipelagoConfig, type ElementSpec, type LagoonTarget } from './bootstrap';
import { resolveTransportMode, mountTransportToggle, type TransportMode } from './transport-toggle';
import { mountFitToggle } from './fit-toggle';
import type { TideFlow, TideLens, TideView } from './tideline';
import { mountReactLagoon } from './lagoon-react-mount';
import { regionOverrides, type RegionOverrideMaps } from './lagoon-overrides';
import {
  stateNames,
  islandTag,
  pickState,
  publishStates,
  readStateRequest,
  readTarget,
  replayFlow,
  reportState,
  resolveFlowRegion,
  resolveIslandScenario,
  type LagoonEvidence,
} from './lagoon-states';

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
export interface LagoonOverrides extends RegionOverrideMaps {
  /** Outward seam. Defaults to logging intents, which is what you want with no router present. */
  host?: HostBridge;
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
  /**
   * The project's declared states, so `?flow=<name>` and `?target=island:<tag>&scenario=<name>` open
   * this gallery ON one.
   *
   * The gallery is what `lagoon serve` and `lagoon publish` actually build — a region publish uses
   * this entry, not the bare one — so a state address that only worked on `lagoon.html` would not
   * work on the lagoon anybody looks at. That was true of every ISLAND scenario until this entry was
   * given `scenarios` as well as `flows`: the address printed by `motu lagoon states` pointed at the
   * one entry `lagoon serve` never builds, and landed on the first region instead.
   */
  evidence?: LagoonEvidence;
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
/**
 * GUTTERS. The lagoon mounts regions into `#lagoon-root`, which had no page shell at all — no
 * max-width, no padding, no gap — so every project's islands rendered edge-to-edge and touching each
 * other, while the same components on the host application sat in a centred column. The lagoon is the
 * surface that is supposed to show what the page shows; an arrangement it cannot reproduce is a
 * difference a reviewer reads as the component's own.
 *
 * `PAGE_SHELL_CSS` is the shell alone — deliberately not `PAGE_CSS`, which also carries overrides
 * written for the host's server-rendered row shape and fights the React kit.
 *
 * THE MOUNTPOINTS VIEW ONLY, and that qualifier is the whole correction. This was scoped to
 * `#lagoon-root` unconditionally, with a comment claiming a project that declares its own
 * arrangement still wins because its sheet is injected later. That is true of rules on the SAME
 * element and false of the one that mattered: a `max-width` on the CONTAINER cannot be overridden by
 * the child, whatever the child's stylesheet says. So every region rendered in a centred 940px
 * column — and a page designed to fill the screen, like an auth split with `flex h-svh` and two
 * half-width panels, was squeezed into 940px with the rest of the surface left blank. It looked
 * exactly like the lagoon shrinking somebody's page, because it was.
 *
 * The gutters were added for islands rendered BARE — placed individually with no page around them,
 * which is what `mountpoints` shows and is genuinely missing a shell. A REGION renders the
 * archipelago's own `root`: the application's real arrangement, which already decides its own width.
 * Supplying a column there is not a fallback, it is an override.
 */
function installLagoonShell(): void {
  if (typeof document === 'undefined' || document.getElementById('motu-lagoon-shell')) return;
  const style = document.createElement('style');
  style.id = 'motu-lagoon-shell';
  style.textContent = `#lagoon-root:has(> motu-archipelago[view="mountpoints"]){${PAGE_SHELL_CSS.replace(/^\s*main\s*\{|\}\s*$/g, '').trim()}}`;
  // After the chrome sheet, before the project's: `installMotuChrome` prepends, and the project's own
  // stylesheet is added later by the entry, so this lands between them.
  document.head.prepend(style);
}

/**
 * THE ARTIFACT FINDS ITS OWN COLOUR, so a lagoon opened directly is not motu-teal.
 *
 * The host's shell already detects the colour of a lagoon it frames and pushes it in. That covers the
 * shell and nothing else: a published artifact opened at its own URL -- the link you hand somebody --
 * had no one to do it for it, so the page and the dock stayed motu's colour over somebody else's
 * application. Doing it here covers every way the page can be reached, and the shell can then just
 * read the answer instead of computing it again.
 *
 * THREE THINGS IT REFUSES TO DO.
 *
 * It never overrules a DECLARED colour: a project that set `chrome.primary` decided, and inference is
 * for the projects that did not.
 *
 * It never runs when the CHECKS are driving. `motu island snapshot` pictures islands through this
 * exact boot, so a colour derived from whatever had painted by the time the raster ran would put a
 * timing-dependent value into a visual baseline -- the definition of a flaky snapshot, on the system
 * whose whole job is to tell a real change from noise. `lagoonUrl()` sets `autoPrimary=off` on every
 * page the harness opens, so checks stay deterministic and only humans get the inferred colour.
 *
 * And it never blocks the boot: detection is asynchronous and the page renders motu's colour until an
 * answer arrives, which is a moment of default chrome rather than a delay in seeing the region.
 */
function wearOwnColour(config: LagoonConfig): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  // A declared colour is a decision; this is only for its absence.
  if (config.chrome?.primary) return;
  try {
    if (new URLSearchParams(window.location.search).get('autoPrimary') === 'off') return;
  } catch {
    // A page with no parsable search string is a page nobody is driving.
  }
  void detectPrimarySettled(document).then((found) => {
    if (!found) return;
    const vars = primaryVars(found.primary, found.onPrimary);
    for (const [name, value] of Object.entries(vars)) {
      document.documentElement.style.setProperty(name, value);
    }
    // WHAT THE SHELL READS. The artifact is the better place to have decided this -- it excludes its
    // own dock from the raster and it knows whether a colour was declared -- so publishing the answer
    // here lets a host that frames this page use it instead of rasterising the same pixels again.
    (window as unknown as { __motuPrimary?: unknown }).__motuPrimary = found;
  });
}

export function startLagoon(opts: StartLagoonOptions): void {
  const config = opts.config ?? {};
  const overrides = opts.overrides ?? {};

// THE LAGOON IS NOT PRODUCTION, and coverage must know it before any region mounts. A lagoon that
// beacons posts the states its own FLOWS produce into the corpus, and the next comparison reports
// them as covered in production — the tool validating itself, with a report that looks better rather
// than broken. The fold still runs; only egress is refused. See markSandbox.
markSandbox();
  if (opts.isolation) setDefaultIsolation(opts.isolation);
  // THE KIT'S CLASS RULES, AND THEN THE HOST'S PALETTE OVER THEM. Two different things, and only the
  // second one used to happen.
  //
  // `applyMotuChrome` sets --motu-* custom properties on documentElement; it injects no rules. So
  // anything the lagoon draws itself — the tide line, the lens — looked right, while an island built
  // from `@motu/chrome/react` rendered as unstyled text: `Panel`, `PanelHead` and `Row` emit
  // `.motu-sheet-panel`, `.motu-cap`, `.motu-row`, whose rules live in `motuChromeCss()` and were
  // nowhere in a built lagoon. Verified on a published one: zero `.motu-sheet-panel` rules in any
  // stylesheet.
  //
  // That made the lagoon disagree with the host application about how one component looks — and the
  // lagoon is the surface that is supposed to be the TRUTH about that. It is not a project's job to
  // remember to install the kit its islands are painted with, so the lagoon runs motu chrome by
  // default. `installMotuChrome` is idempotent (it checks its own <style id>) and prepends, so a
  // project's own sheet still wins on anything it chooses to override.
  installMotuChrome();
  installLagoonShell();
  // Before anything paints, so the chrome never flashes motu's default over the host's palette.
  applyMotuChrome(config.chrome ?? {});
  wearOwnColour(config);
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
          ? [{ config, options: { host, seed: regionOverrides(overrides, id).seed, channels: regionOverrides(overrides, id).channels } }]
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

  // A REQUESTED FLOW CHOOSES THE STATION. `?flow=<name>` is an address for a state, and a state
  // belongs to exactly one region — making the visitor also know (and type) which region declares it
  // would be asking for the one thing the catalogue already knows.
  publishStates(opts.evidence, stations.map((s) => ({ id: s.id, label: s.label })));
  const request = readStateRequest();
  let flowRegion: string | undefined;
  if (request.flow) {
    const resolved = resolveFlowRegion(opts.evidence, request);
    if ('region' in resolved && ids.includes(resolved.region)) flowRegion = resolved.region;
    else {
      reportState({
        ok: false,
        target: 'this lagoon',
        kind: 'flow',
        ...('region' in resolved
          ? { error: `region "${resolved.region}" is not in this lagoon`, available: ids }
          : { error: resolved.error, available: resolved.available }),
      });
    }
  }
  if (flowRegion) current = flowRegion;
  // `?region=<id>` on its own opens that station — the same address, minus the state.
  else if (request.region && ids.includes(request.region)) current = request.region;

  // AN ISLAND, ADDRESSED — `?target=island:<tag>`, optionally `&scenario=<name>`.
  //
  // Not a station, and deliberately not "the region that declares it, seeded". An island can be
  // standalone — in no region at all, which is a permanent and legitimate state — and for one that
  // IS in a region, a scenario is authored against the island's own prop names while the region
  // binds different ones. Seeding a region with them puts keys in the store nothing reads and shows
  // the region's ordinary state under the scenario's name. So this mounts the island alone, through
  // the same synthesised one-slot config `motu island verify` drives, inside the gallery's chrome:
  // what a human looks at is what was verified.
  const wantedIsland = islandTag(readTarget() ?? opts.target);
  let island: { tag: string; seed?: Record<string, unknown> } | undefined;
  // A REFUSAL MOUNTS NOTHING. The banner alone is not the refusal: leaving the first region on screen
  // under it is the substitution being refused, and a screenshot of it looks like a working lagoon.
  let refused = false;
  if (wantedIsland && !opts.elements.some((e) => e.tag === wantedIsland)) {
    reportState({
      ok: false,
      target: `island:${wantedIsland}`,
      kind: request.scenario ? 'scenario' : 'none',
      error: `no island "${wantedIsland}" in this lagoon`,
      available: opts.elements.map((e) => e.tag),
    });
    refused = true;
  } else if (wantedIsland && request.scenario) {
    const wanted = resolveIslandScenario(opts.evidence?.scenarios, wantedIsland, request.scenario);
    reportState(wanted.outcome);
    // AN UNRESOLVABLE STATE MUST NOT RENDER SOMETHING ELSE. The focused entry refuses to mount on a
    // scenario it could not resolve; this entry has to refuse identically, or the same address means
    // "refused" on one and "here is some other state" on the other.
    if (wanted.outcome.ok) island = { tag: wantedIsland, seed: wanted.seed };
    else refused = true;
  } else if (wantedIsland) {
    reportState({ ok: true, target: `island:${wantedIsland}`, kind: 'none' });
    island = { tag: wantedIsland };
  } else if (request.scenario) {
    reportState({
      ok: false,
      target: 'this lagoon',
      kind: 'scenario',
      error: `?scenario= addresses an ISLAND's state — name the island (target=island:x-…), or address a region with ?flow=`,
      available: Object.keys(opts.evidence?.scenarios ?? {}),
    });
    refused = true;
  }

  let view: TideView = localStorage.getItem(VIEW_KEY) === 'mountpoints' ? 'mountpoints' : 'region';

  function mount(id: string): void {
    if (!id) return;
    current = id;
    localStorage.setItem(STORAGE_KEY, id);
    // Changing region leaves whatever flow was showing behind with the region that had it.
    shownFlow = activeFlowName(id);
    // A host rendering this lagoon's chrome from outside follows the same changes the in-page panel
    // does, and finds out the same way: by being told, not by polling the DOM for what changed.
    controlChanged();

    if (react) {
      // Same path the host application and `motu island verify` use, so the surface a human judges
      // here is the one that ships and the one that was verified.
      mountReactLagoon(root, opts.archipelagos[id]!, {
        elements: opts.elements,
        host,
        ...regionOverrides(overrides, id),
        view,
      });
      tide.setActive(current, view);
      tide.setFlows(flowsOf(id), activeFlowName(id));
      applyRequestedFlow(id);
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
    tide.setFlows(flowsOf(id), activeFlowName(id));
    applyRequestedFlow(id);
  }

  /**
   * Mount the addressed island ALONE, in this page's chrome.
   *
   * The station list stays visible and nothing in it is lit: what is mounted is not a region, and
   * lighting the one that happens to declare this island would say otherwise. Picking a station from
   * the tide line leaves island mode, and drops the address with it.
   */
  function mountIsland(open: { tag: string; seed?: Record<string, unknown> }): void {
    const target: LagoonTarget = { kind: 'island', tag: open.tag };
    const synthesised = lagoonArchipelagoConfig(target, { elements: opts.elements, seed: open.seed });
    if (react) {
      mountReactLagoon(root, synthesised, {
        elements: opts.elements,
        host,
        seed: open.seed ?? {},
        view,
      });
    } else {
      root!.replaceChildren();
      root!.appendChild(
        defineLagoon(target, {
          elements: opts.elements,
          css: opts.css,
          defaultTheme: config.defaultTheme ?? 'motu',
          host,
          seed: open.seed,
        }),
      );
    }
    // Nothing in the station list is lit — this is not a region — so the bar carries the address
    // instead, and the bay stays there to leave by.
    const state = window.__motuLagoonState;
    tide.setActive('', view, state?.name ? `${open.tag} · ${state.name}` : open.tag);
    tide.setFlows([], null);
  }

  /**
   * Drive the mounted region to the requested flow's state — on EVERY mount of the region that
   * declares it, because switching view (or station and back) re-mounts and the state a flow reached
   * does not survive that. Mounting any OTHER region records that no state is applied rather than
   * leaving the previous verdict standing, which would outlive the region it described.
   */
  function applyRequestedFlow(id: string): void {
    if (!request.flow || !flowRegion) return;
    if (id !== flowRegion) {
      reportState({ ok: true, target: `archipelago:${id}`, kind: 'none' });
      return;
    }
    const flow = pickState(opts.evidence?.flows?.[id], request.flow);
    if (!flow) return; // reported at boot, with the whole catalogue
    void replayFlow(flow, request.step).then((outcome) =>
      reportState({ ...outcome, target: `archipelago:${id}` }),
    );
  }

  // The lens mounts BEFORE the chrome — it restores its own open state, so it remembers being on
  // across a reload. No chip in the toolbar: the lens draws its own tab on the edge of its panel, so
  // opening and closing happen in one place instead of from inside a popup that closes behind it.
  const lens = opts.debug === false ? undefined : opts.lens;
  lens?.mount({ chip: false });

  /**
   * Which row the panel should light, given what the URL asked for.
   *
   * RESOLVED, not compared: an address carries the slug (`a-good-password-…`) and the rows carry the
   * declared name, so comparing the two strings lit nothing when a flow was opened from its own URL —
   * the state was applied and the panel said no state was.
   */
  const activeFlowName = (id: string): string | null => {
    if (!request.flow || id !== flowRegion) return null;
    const flow = pickState(opts.evidence?.flows?.[id], request.flow);
    return flow?.name ?? null;
  };

  /** The flows the mounted region declares, for the panel to list. */
  const flowsOf = (id: string): TideFlow[] =>
    (opts.evidence?.flows?.[id] ?? []).map((f, i) => ({
      name: f.name ?? `#${i + 1}`,
      steps: (f.steps ?? []).length,
    }));

  /**
   * THE CONTROL SURFACE, so the chrome does not have to live in here.
   *
   * The catalogue (`__motuLagoonStates`) already says what this build can be opened in; this says how
   * to open it. Together they are everything a host needs to render the lagoon's chrome OUTSIDE the
   * artifact — which is the point: the dock is bundled into every published page today, so changing
   * it means republishing every lagoon, and it overlays an application it is only supposed to be
   * looking at.
   *
   * DRIVEN, NOT NAVIGATED. The alternative is for a host to reload the frame with `?region=…&flow=…`,
   * which works and is what the addresses are for — but it is a full reload of an artifact that can
   * be 19 MB, per click. These are the same handlers the in-page dock calls, so a host driving them
   * gets exactly what pressing the dock gets, including the URL rewrite that keeps the address
   * pasteable.
   *
   * Installed on `window` rather than passed anywhere, because the consumer is in another document.
   */
  const publishControl = (): void => {
    (window as unknown as { __motuLagoonControl?: unknown }).__motuLagoonControl = {
      regions: () => stations.map((x) => ({ id: x.id, label: x.label })),
      current: () => ({ region: current, view, island: island ?? null, flow: shownFlow }),
      show: (id: string) => onStation(id),
      setView: (next: TideView) => onView(next),
      runFlow: (name: string | null) => onFlow(name),
      /**
       * The transport and fit chips, for a panel drawn outside this page.
       *
       * READ, NOT REGISTERED — the same trick the command palette already uses on them. They are
       * mounted by whichever package owns them (`@motu/core`'s toolbar, and anything that appends to
       * it later), into an element with a known id, so a control added by a future package appears
       * out here with nothing to keep in sync.
       */
      chips: () => {
        const bar = document.getElementById('motu-toolbar');
        if (!bar) return [];
        return [...bar.querySelectorAll('button')].map((b, i) => ({
          index: i,
          label: (b.textContent ?? '').trim(),
          title: b.title ?? '',
          pressed: b.getAttribute('aria-pressed') === 'true' || b.getAttribute('aria-current') === 'true',
        }));
      },
      /** What the lens has noticed about the region on screen, or null when there is no lens. */
      findings: () => (lens && lens.findings ? lens.findings() : null),
      /** The region sheet: the declaration, proved by the region that is running. */
      sheet: () => (lens && lens.sheet ? lens.sheet() : null),
      /** What feeds the region, what it asked for, and what it pushed back. */
      seams: () => (lens && lens.seams ? lens.seams() : null),
      /** What each mounted island was actually given. */
      islands: () => (lens && lens.islands ? lens.islands() : null),
      pressChip: (index: number) => {
        const bar = document.getElementById('motu-toolbar');
        (bar?.querySelectorAll('button')[index] as HTMLButtonElement | undefined)?.click();
      },
      /** Told whenever the mounted region, view or flow changes, so a host's chrome can follow. */
      subscribe: (fn: () => void) => {
        controlWatchers.add(fn);
        return () => controlWatchers.delete(fn);
      },
    };
  };
  /** The flow the region is currently showing, or null for the state the page seeds. */
  let shownFlow: string | null = null;
  const controlWatchers = new Set<() => void>();
  const controlChanged = () => {
    for (const fn of controlWatchers) fn();
  };

  // HOISTED OUT OF THE PANEL'S OPTIONS so there is exactly one definition of each. The in-page dock
  // and a host driving this page from outside it must do the SAME thing — a second copy of "pick a
  // region" is the kind of duplicate that stays correct until one of them is fixed.
    // Picking a station LEAVES an island address, and takes it out of the URL: leaving it there
    // would hand someone a link that reopens the island they navigated away from.
  const onStation = (id: string) => {
      if (island) {
        const url = new URL(location.href);
        url.searchParams.delete('target');
        url.searchParams.delete('scenario');
        history.replaceState(null, '', url);
        island = undefined;
        reportState({ ok: true, target: `archipelago:${id}`, kind: 'none' });
      }
      mount(id);
  };

  const onView = (next: TideView) => {
      view = next;
      localStorage.setItem(VIEW_KEY, next);
      if (island) mountIsland(island);
      else mount(current);
  };

    // RUNNING A FLOW FROM THE PANEL, and leaving an address behind.
    //
    // The URL is rewritten to the one that reaches this state, so what a person is looking at can be
    // pasted to someone else — the same address `motu lagoon states` prints. Picking "As seeded" is a
    // remount: a flow leaves the region where its last step put it, and going back to what the page
    // establishes is a state too.
  const onFlow = (name: string | null) => {
      // WHICH STATE IS SHOWING, remembered rather than inferred. A host drawing this panel from
      // outside cannot read it from anywhere else: the in-page dock kept it in its own DOM, so a
      // second reader had nothing to go on and lit "As seeded" forever, whatever you pressed.
      shownFlow = name;
      controlChanged();
      const url = new URL(location.href);
      url.searchParams.set('region', current);
      if (name) url.searchParams.set('flow', name);
      else url.searchParams.delete('flow');
      url.searchParams.delete('step');
      history.replaceState(null, '', url);

      // A RELOAD, and it has to be. Forgetting the region's keys is not the same as starting again: a
      // source is installed once, with the store, and re-mounting reuses both — so a region whose
      // source FETCHES came back holding nothing and sat at its pre-answer state ("Vérification du
      // lien…") for good, which is not a state the page establishes, it is one it passes through. The
      // address is already in the URL, so a reload loses nothing and restores everything.
      if (!name) {
        tide.setFlowOutcome('reloading…');
        location.reload();
        return;
      }
      const flow = pickState(opts.evidence?.flows?.[current], name);
      if (!flow) {
        tide.setFlowOutcome(`no flow "${name}" in ${current}`, false);
        return;
      }
      tide.setFlowOutcome('running…');
      // FROM THE STATE THE PAGE SEEDS, every time. Flows are sequences and the region keeps what the
      // last one left; running two in a row without this would show the second one's steps applied on
      // top of the first one's result, under the second one's name.
      window.__motuLagoon?.reset?.();
      void replayFlow(flow, null).then((outcome) => {
        reportState({ ...outcome, target: `archipelago:${current}` });
        tide.setFlowOutcome(
          outcome.ok ? `applied ${outcome.applied}/${outcome.of} step(s)` : (outcome.error ?? 'could not run'),
          outcome.ok,
        );
      });
  };

  publishControl();

  /**
   * NO PANEL IN HERE ANY MORE.
   *
   * The dock was bundled into every artifact, which meant changing it republished every lagoon that
   * existed, and it had to overlay the application because it lived in the same document. It is drawn
   * by whoever HOSTS the lagoon now — the host app around a framed artifact, or `motu lagoon serve`
   * for the dev loop and the checks — from `@motu/chrome/dock`, reading the catalogue this page
   * publishes and driving the control surface below.
   *
   * What stays here is what only this page can know: the catalogue, the handlers, and which state is
   * showing. `mountTideLine` is still exported for the older entry (`bootstrapLagoon`) that mounts it
   * directly; nothing on this path imports it, so it shakes out of the bundle.
   */
  const tide = {
    setActive: (..._a: unknown[]) => controlChanged(),
    setFlows: (..._a: unknown[]) => controlChanged(),
    /** The outcome of a flow already lands in `__motuLagoonState`, which is what a driver reads. */
    setFlowOutcome: (..._a: unknown[]) => {},
  };


  if (island) {
    mountIsland(island);
  } else if (refused) {
    // Said above, in the banner and in `window.__motuLagoonState`. Nothing renders under it.
    root.replaceChildren();
  } else if (ids.length) {
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
