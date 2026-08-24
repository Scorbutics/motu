// The lagoon harness entry, framework-side. A composition root's lagoon entry is a thin shim: it reads
// the build-injected target/fit and hands this the project's element registry + fixtures + archipelago
// resolver. Everything else — mock transport wiring, the default host, target resolution, mount — is
// generic and lives here so every project's lagoon entry stays 3 lines.
import { configure } from '@motu/runtime';
import { MockTransport, type Fixture } from '@motu/runtime/mock';
import { FailingTransport } from '@motu/runtime/mock';
import { applyMotuChrome, bindEntries, markCoverageSandbox } from '@motu/core';
import type { DeclaredChannel } from '@motu/core';
import type { ReactNode } from 'react';
import type { HostBridge, MotuFit, ArchipelagoConfig, Channel, MotuChromeTheme } from '@motu/core';
import { defineLagoon, lagoonArchipelagoConfig, type ElementSpec, type LagoonTarget } from './bootstrap';
import { mountReactLagoon } from './lagoon-react-mount';

export interface LagoonBootstrapOptions {
  /** The project's element registry (same one the real composition roots use). */
  elements: ElementSpec[];
  /** Compiled island stylesheet text. */
  css?: string;
  /** MockTransport fixtures replayed offline (no backend/login). */
  fixtures?: Fixture[];
  /** Roles the mock caller holds, satisfying the fixtures' role gates. */
  roles?: string[];
  /** Resolve an archipelago config by id (the project's registry lookup). */
  resolveArchipelago: (id: string) => ArchipelagoConfig | undefined;
  /** "island:x-some-tag" | "archipelago:members"; empty => the members archipelago. */
  target?: string;
  /** "native" | "legacy" — only meaningful for an island target. */
  fit?: string;
  /** Outward channel; a console-logging no-op by default. */
  host?: HostBridge;
  /** 'region' (the app's arrangement) or 'mountpoints' (every declared slot, framed separately). */
  view?: 'region' | 'mountpoints';
  /** Initial store contents so bound islands render meaningfully. Overrides `overrides.seed`. */
  seed?: Record<string, unknown>;
  /** Inbound channels: host signals mirrored into the store (same as the real composition roots). */
  channels?: DeclaredChannel[];
  /**
   * The project's lagoon overrides — the same `lagoon.ts` the GALLERY entry uses, keyed by archipelago
   * id.
   *
   * Without this the focused lagoon ran with no region seed at all, while the gallery ran with one:
   * the two entries showed different things from the same sources, and the focused entry is the one
   * `motu island verify` / `motu archipelago verify` drive. So every runtime check was asserting
   * against defaults, never against the state the region is actually fed — a weaker claim than
   * "renders in the lagoon" sounds like. The region is resolved from the target, including for an
   * island target (the region that declares it).
   */
  overrides?: {
    seed?: Record<string, Record<string, unknown>>;
    channels?: Record<string, DeclaredChannel[]>;
    layout?: Record<string, (island: (slot: string) => ReactNode) => ReactNode>;
    providers?: Record<string, (children: ReactNode, slot: string) => ReactNode>;
    /**
     * What the PAGE passes on an island element — the lagoon's stand-in for a prop that is not
     * region state (a URL builder, a formatter). Honoured by the gallery since it existed; absent
     * from this type, and therefore silently dropped here, which is why an island whose picture
     * needs one rendered a blank frame in every check while the gallery showed it.
     */
    props?: Record<string, Record<string, Record<string, unknown>>>;
    /**
     * The project's boot hook. Same reason as `props`: the gallery calls it, the type here did not
     * name it, so it was never called on the entry every check drives.
     */
    setup?: () => void;
  };
  /** Every archipelago, so an `island:` target can find the region that declares it. */
  archipelagos?: Record<string, { islands: { slot?: string; element: string; bind?: Record<string, string> }[] }>;
  /** Element id to append the archipelago into (default 'lagoon'). */
  mountId?: string;
  /** When set, every contract call fails with this HTTP status — verify's error-resilience mount. */
  forceErrorStatus?: number;
  /**
   * Point motu's chrome at this application's colours (see `applyMotuChrome`). The focused lagoon
   * shows little chrome of its own, but the tokens also reach anything mounted alongside it — the
   * seam lens above all — so a project's colour should not depend on which entry you opened.
   *
   * Any CSS colour works, which is the point: reference the host's token to follow a rebrand
   * (`hsl(var(--primary))`), reach for a darker one it already defines (`hsl(var(--primary-control))`),
   * or derive one when a brand primary is too bright to sit under white chrome
   * (`color-mix(in srgb, hsl(var(--primary)) 70%, #000)`).
   */
  chrome?: MotuChromeTheme;
  /**
   * How islands attach — and it must match what the host application does, or the lagoon verifies a
   * mount path the project does not ship.
   *
   *   'element' (default) <motu-island> custom elements, one React root each. The ocean case.
   *   'react'   islands render in the lagoon's own React tree, exactly as they do in a React host.
   */
  mount?: 'element' | 'react';
}

/** Parse the "kind:value" target string into a LagoonTarget, resolving archipelagos via the project. */
function resolveTarget(opts: LagoonBootstrapOptions): LagoonTarget {
  const raw = (typeof opts.target === 'string' && opts.target) || 'archipelago:members';
  const [kind, ...rest] = raw.split(':');
  const value = rest.join(':');
  if (kind === 'island') {
    const fit = (typeof opts.fit === 'string' && opts.fit) as MotuFit | '';
    return { kind: 'island', tag: value, fit: fit || undefined };
  }
  const config = opts.resolveArchipelago(value);
  if (!config) throw new Error(`lagoon: unknown archipelago "${value}"`);
  return { kind: 'archipelago', config };
}

/**
 * Install `window.__motuLagoonHarness` — re-render this page against another target.
 *
 * Separate from `window.__motuLagoon` (which the CURRENT mount installs, and replaces every time it
 * mounts): this one has to survive the mounts it triggers.
 */
function installHarness(opts: LagoonBootstrapOptions, host: HostBridge): void {
  const w = window as unknown as { __motuLagoonHarness?: unknown };
  w.__motuLagoonHarness = {
    mount(target: string, options?: { fit?: string; forceError?: number }) {
      // The transport is part of what is being asked for: 'the same island, but the backend fails'.
      configure(
        options?.forceError
          ? new FailingTransport(options.forceError)
          : new MockTransport(opts.fixtures ?? [], opts.roles ?? []),
      );
      render({ ...opts, target, fit: options?.fit ?? opts.fit, host });
      return true;
    },
  };
}

/**
 * Boot the lagoon focused on ONE target in isolation, backed by MockTransport. Configures the mock
 * transport from the supplied fixtures, resolves the target, mounts it, and returns the element.
 */
/**
 * The archipelago id whose seed applies to this target.
 *
 * An `archipelago:` target names it. An `island:` target does not — the island's seed lives on the
 * region that declares it, so find the region holding that tag. An island in no region (or in two)
 * gets nothing rather than a guess.
 */
function regionIdFor(target: LagoonTarget, opts: LagoonBootstrapOptions): string | undefined {
  if (target.kind === 'archipelago') return target.config.id;
  const owners = Object.entries(opts.archipelagos ?? {}).filter(([, cfg]) =>
    cfg.islands?.some((i) => i.element === target.tag),
  );
  // Guarded by the length check above; `noUncheckedIndexedAccess` cannot see that, and adopting
  // projects type-check this source.
  return owners.length === 1 ? owners[0]![0] : undefined;
}

/**
 * Translate a REGION seed into the namespace a single-island target uses.
 *
 * A lone island is mounted through a synthesised config whose binds are SAME-NAMED (prop `missions` ->
 * key `missions`), which is what lets an island with no region be driven at all, and what the
 * `scenarios` in every evidence file are written against. The region's own binds are not same-named —
 * `missions` comes from `receivedMissions` — so handing the region seed over untranslated puts keys in
 * the store that nothing reads, and the island renders its empty state while the region view shows
 * data. Translate through the region's bind instead of changing the synthesised binds, so existing
 * scenarios keep working.
 */
function translateRegionSeed(
  seed: Record<string, unknown> | undefined,
  target: LagoonTarget,
  regionId: string | undefined,
  opts: LagoonBootstrapOptions,
): Record<string, unknown> | undefined {
  if (!seed || target.kind !== 'island' || !regionId) return seed;
  const island = opts.archipelagos?.[regionId]?.islands?.find((i) => i.element === target.tag);
  if (!island?.bind) return seed;
  const out: Record<string, unknown> = { ...seed };
  for (const [prop, key] of bindEntries(island)) {
    if (key in seed) out[prop] = seed[key];
  }
  return out;
}

/**
 * THE ISLAND STYLESHEET, on the React path.
 *
 * `css` reaches `defineLagoon` on the ELEMENT path and reached nothing at all on the React one — a
 * project with `"mount": "react"` bundled its `shared/styles.css` and never inserted it here. The
 * gallery fixed exactly this and the fix was never carried across, so the focused entry — the one
 * `motu island verify`, the flow checks and both snapshot lanes drive — rendered every island naked.
 *
 * Light DOM, so one <style> in the head; the element path adopts the same text per shadow root and
 * must not get a second copy, which is what the `mount` test is for. Same id as the gallery uses, so
 * whichever entry runs first wins and neither doubles up.
 */
function installIslandStyles(opts: LagoonBootstrapOptions): void {
  if (opts.mount !== 'react' || !opts.css || typeof document === 'undefined') return;
  const ID = 'motu-island-styles';
  if (document.getElementById(ID)) return;
  const style = document.createElement('style');
  style.id = ID;
  style.textContent = opts.css;
  document.head.appendChild(style);
}

/**
 * Translate the region's per-slot PROPS for whatever is actually mounted.
 *
 * Same shape of problem as `translateRegionSeed`, and the same cause: a lone island is mounted
 * through a synthesised one-slot config whose slot is literally `'lagoon'`, so the region's own slot
 * key ("diff-viewer") matches nothing and the island is mounted without the prop. The review
 * console's viewer takes its image URL that way — it rendered `<img src="">` in every island check
 * and every baseline, while the gallery, which mounts the real region, showed the picture.
 */
function propsFor(
  target: LagoonTarget,
  regionId: string | undefined,
  opts: LagoonBootstrapOptions,
): Record<string, Record<string, unknown>> | undefined {
  const bySlot = regionId ? opts.overrides?.props?.[regionId] : undefined;
  if (!bySlot) return undefined;
  if (target.kind === 'archipelago') return bySlot;
  const slot = opts.archipelagos?.[regionId!]?.islands?.find((i) => i.element === target.tag)?.slot;
  const own = slot ? bySlot[slot] : undefined;
  return own ? { lagoon: own } : undefined;
}

export function bootstrapLagoon(opts: LagoonBootstrapOptions): HTMLElement {
// THE LAGOON IS NOT PRODUCTION, and coverage must know it before any region mounts. A lagoon that
// beacons posts the states its own FLOWS produce into the corpus, and the next comparison reports
// them as covered in production — the tool validating itself, with a report that looks better rather
// than broken. The fold still runs; only egress is refused. See markCoverageSandbox.
markCoverageSandbox();
  // Before anything paints, so the chrome never flashes motu's default over the host's palette.
  applyMotuChrome(opts.chrome ?? {});
  // THE PROJECT'S OWN BOOT HOOK, on the focused entry too.
  //
  // The gallery has always called it (`startLagoon` -> `overrides.setup?.()`); this entry never did —
  // and this is the entry EVERY CHECK DRIVES. `motu island verify`, the flow checks, `responsive`,
  // `a11y` and both snapshot lanes all navigate to `lagoon.html`, so a project whose `setup` installs
  // anything a render depends on was measured without it, forever, while the gallery a human opens
  // looked correct. The review console installs motu's chrome sheet there: every one of its visual
  // baselines was an unstyled page, and the checks were green because the baseline was unstyled too.
  //
  // Idempotent by contract — the gallery re-runs it on hot reload — so calling it here is safe even
  // when both entries end up loaded.
  opts.overrides?.setup?.();
  installIslandStyles(opts);
  configure(
    opts.forceErrorStatus
      ? new FailingTransport(opts.forceErrorStatus)
      : new MockTransport(opts.fixtures ?? [], opts.roles ?? []),
  );

  const host: HostBridge = opts.host ?? {
    navigate: (path) => console.log('[lagoon] navigate', path),
    action: (name, detail) => console.log('[lagoon] action', name, detail),
  };

  // RE-AIM THE SAME PAGE.
  //
  // Everything a check needs is already loaded here: the whole registry, every fixture, the mock
  // transport. Reloading the page for the next island (or the next fit, or a forced 500) rebuilt all
  // of that to look at a different corner of it — seconds of boot per question, and the questions are
  // milliseconds. This lets the harness say "now show me x-week-nav, with a failing backend", and the
  // page re-renders in place. It is the same seam the lagoon's own switcher uses; the checks are just
  // another visitor.
  installHarness(opts, host);

  return render({ ...opts, host });
}

/** Render one target into the lagoon's mount element. Called on boot and by the harness. */
function render(opts: LagoonBootstrapOptions & { host: HostBridge }): HTMLElement {
  const host = opts.host;
  const target = resolveTarget(opts);
  const mountEl = document.getElementById(opts.mountId ?? 'lagoon');

  // An explicit `seed` still wins; otherwise take the region's own, so the focused entry and the
  // gallery are fed from one source.
  const regionId = regionIdFor(target, opts);
  // AN ISLAND CHECK MUST NOT BORROW THE REGION'S SEED.
  //
  // A single-island mount was given `overrides.seed[regionId]` so it would "render meaningfully" in
  // the lagoon — reasonable for a human looking at it, and fatal for `default-props`, whose whole
  // claim is that the island renders from DEFAULTS alone. peps' week navigator crashed on an empty
  // week list and the browser reported nothing, because the region seed handed it a populated one;
  // the same island under happy-dom, which seeds nothing, threw immediately. The check was passing on
  // data it invented for the preview.
  //
  // `?seed=off` is set by `motu island verify`. A human opening the lagoon still gets the seeded view.
  const seedOff =
    typeof location !== 'undefined' && new URLSearchParams(location.search).get('seed') === 'off';
  const regionSeed = seedOff && target.kind === 'island' ? undefined : regionId ? opts.overrides?.seed?.[regionId] : undefined;
  const seed = translateRegionSeed(
    opts.seed ?? regionSeed,
    target,
    regionId,
    opts,
  );
  const channels = opts.channels ?? (regionId ? opts.overrides?.channels?.[regionId] : undefined);

  if (opts.mount === 'react') {
    const config = lagoonArchipelagoConfig(target, { elements: opts.elements, seed });
    mountReactLagoon(mountEl, config, {
      elements: opts.elements,
      host,
      seed: seed ?? { criteria: {} },
      channels,
      // Only for a whole-region target: a single-island target is mounted through a synthesised
      // one-slot config, and the app's layout would place slots that mount does not have.
      layout: target.kind === 'archipelago' && regionId ? opts.overrides?.layout?.[regionId] : undefined,
      // NOT gated on the view the way `layout` is: providers are what an island cannot render
      // without, so a single-slot mount needs them exactly as much as the region does.
      providers: regionId ? opts.overrides?.providers?.[regionId] : undefined,
      // Per-slot props the page supplies and the region does not carry — re-keyed for a lone island.
      props: propsFor(target, regionId, opts),
      fit: target.kind === 'island' ? target.fit : undefined,
      // The harness drives DECLARED wires in 'mountpoints', where every slot the archipelago names is
      // framed on its own. In 'region' the app's arrangement decides what exists — an island behind a
      // closed drawer is simply absent — and a check for "does this declared wire carry something"
      // must not depend on that.
      view: opts.view,
    });
    return mountEl ?? document.body;
  }

  const el = defineLagoon(target, {
    elements: opts.elements,
    css: opts.css,
    defaultTheme: 'motu',
    host,
    seed: seed ?? { criteria: {} },
    channels,
  });

  document.getElementById(opts.mountId ?? 'lagoon')?.appendChild(el);
  return el;
}
