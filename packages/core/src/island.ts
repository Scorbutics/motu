// The framework-neutral island custom-element base. It owns ALL the plumbing that is independent of
// the rendering technology — shadow-or-light root, the adopted stylesheet, the theme/fit/legacy
// attribute axes, imperative props, attribute coercion, and injected event callbacks — and delegates
// the actual rendering to a pluggable IslandRenderer (React, AngularJS, Lit, vanilla…). This is what
// lets an island be authored in any framework, including the legacy host's own, behind one stable
// custom-element boundary.

import type { MotuTheme, MotuFit, LegacyStrategy } from './theme';

// Stripped in production (see the debug overlay). The definition registry below only populates when
// this build-time constant is true; the typeof guard keeps it safe under bare Node/tsc.
declare const __MOTU_DEBUG__: boolean;
const DEBUG = typeof __MOTU_DEBUG__ !== 'undefined' && __MOTU_DEBUG__;

export type AttrType = 'string' | 'number' | 'boolean';

/**
 * Runtime encapsulation — a third axis, orthogonal to theme (skin) and fit (footprint). 'shadow'
 * isolates CSS/DOM both ways (the safe default for a foreign/hostile ocean: legacy global CSS,
 * jQuery). 'light' drops the shadow root and renders into the element itself, inheriting the host
 * cascade, forms and native events — the friction-free choice when the ocean is trusted and
 * same-language (a legacy-to-legacy or same-framework island).
 */
export type IslandIsolation = 'shadow' | 'light';

// Project-wide default isolation, set once at a composition root (from motu.config.json's `isolation`
// via a build define). The framework FALLBACK stays 'shadow' — safe + deterministic for an unknown
// consumer; a migration project that embeds into a trusted, same-language ocean opts into 'light' so
// islands inherit the host cascade. Precedence: explicit (element.ts / attribute) > this > 'shadow'.
let defaultIsolation: IslandIsolation = 'shadow';

/** Set the project-wide default isolation. Call at a composition root BEFORE registering elements. */
export function setDefaultIsolation(mode: IslandIsolation): void {
  defaultIsolation = mode === 'light' ? 'light' : 'shadow';
}

/** The project-wide default isolation (used when neither element.ts nor the attribute pins one). */
export function getDefaultIsolation(): IslandIsolation {
  return defaultIsolation;
}

/**
 * A declared prop. The richer object form carries the prop's default and/or required flag so the
 * wrapper can guarantee "renders from defaults alone" (defaults filled at mount) and flag a missing
 * required prop — a single schema the wrapper validates and `motu island verify` cross-checks.
 */
export interface PropSpec {
  /** Property name (imperative JS prop; structured data, never an attribute). */
  name: string;
  /** Applied at mount when the prop is still undefined, so the island renders from its defaults alone. */
  default?: unknown;
  /** When true and the prop is absent at mount (no default), the wrapper logs an error. */
  required?: boolean;
}

/**
 * COUPLING — the dependencies an island has BEYOND the shared store: the integration-risk axis. Empty
 * for a well-behaved island (its only inbound coupling is the store, its only outbound is events).
 * Populated only when an island reaches into the host environment, which the lagoon can't reproduce.
 */
export interface IslandCoupling {
  /**
   * External names the island inherits from the host environment (not the store) — the generic,
   * cross-adapter DECLARED dependency. For the AngularJS adapter these are host-scope keys the
   * island's markup resolves up the prototype chain (e.g. `['hostSearchConfig', 'search']`). Declaring them turns an implicit external dependency into a
   * checked contract (see the adapter's verify layer); it does not prove the real embedded host
   * provides them — that stays the integration suite's job.
   */
  hostScope?: string[];
  // --- AngularJS adapter reach MECHANISMS (how the coupling is wired; injected into the render spec by
  //     defineAngularElement so the `.ng.ts` body stays pure render). Declared here so the whole
  //     boundary — what it depends on AND how — lives in one place (element.ts).
  /** AngularJS: host-scope anchor key used to LOCATE the scope to attach to (must be a key that scope owns). */
  hostScopeKey?: string;
  /** AngularJS: relocate (adopt) the live legacy node(s) matching this selector into the island. */
  adopt?: string;
  /** AngularJS: derive the island scope from a host scope ('parent' | selector) instead of an isolate scope + props. */
  inheritScope?: 'parent' | string;
}

/**
 * The island CONTRACT, grouped on the same input / output / coupling axis the debug overlay and
 * `motu island verify` use — so an island's whole boundary is declared in ONE place (its element.ts)
 * instead of split between the registration and the render spec.
 */
export interface IslandContract {
  /** INPUT — props fed from the store/host (data in). Bare names or `{name,default,required}` specs. */
  input?: (string | PropSpec)[];
  /** OUTPUT — injected callback prop -> CustomEvent name it dispatches (data out), e.g. `{ onReset: 'reset' }`. */
  output?: Record<string, string>;
  /** COUPLING — dependencies beyond the store (the integration-risk axis; usually absent). */
  coupling?: IslandCoupling;
}

export interface IslandElementOptions {
  /**
   * The island contract (input / output / coupling) in one place. Preferred over the loose
   * `props`/`events` below — when set, `contract.input` supplies props and `contract.output` supplies
   * events. `props`/`events` remain for islands that haven't adopted the grouped form.
   */
  contract?: IslandContract;
  /** Property names (or richer {name,default,required} specs) set imperatively from JS. Superseded by `contract.input`. */
  props?: (string | PropSpec)[];
  /** Attribute names + coercion type (attributes are always strings in the DOM). */
  attributes?: Record<string, AttrType>;
  /**
   * Stylesheet text. In 'shadow' isolation it is adopted into the shadow root. In 'light' isolation
   * it is injected once globally instead — the island root gets a `.motu-root` marker and a scoped
   * reset/neutralizer so the styles behave the same as under shadow. Authoring rule: target
   * `:where(:host, .motu-root)` (not bare `:host`, which is inert in light DOM) so a single sheet
   * works in both modes.
   */
  css?: string;
  /** Default skin when nothing sets data-motu-theme. */
  defaultTheme?: MotuTheme;
  /**
   * Legacy-fit strategy, reflected as data-motu-legacy for per-strategy CSS.
   *
   * Required only where the host HAS a legacy skin — that requirement lives in `motu island verify`,
   * which knows the project's posture, rather than in this type, which does not. Declaring it under
   * `host: next` would be a field every island fills with a value nothing reads: fitting an island to
   * a legacy footprint is meaningless when there is no legacy footprint. Absent => no attribute.
   */
  legacy?: LegacyStrategy;
  /** Default footprint when nothing sets data-motu-fit. Defaults to 'native'. */
  defaultFit?: MotuFit;
  /** Maps a callback prop name to the CustomEvent it dispatches, e.g. { onReset: 'reset' }. */
  events?: Record<string, string>;
  /** Runtime encapsulation. Defaults to 'shadow'. */
  isolation?: IslandIsolation;
}

/** The live render a renderer returns; the base drives it on prop changes and teardown. */
export interface IslandInstance {
  update(props: Record<string, unknown>): void;
  unmount(): void;
}

/** What the base hands a renderer: where to render, and the current props (data + callbacks + fit). */
export interface IslandMountContext {
  /** Where to render. In shadow isolation this is a div inside the shadow root; in light DOM it is the host element. */
  container: HTMLElement;
  /** The custom element itself — always in the light DOM, so hosts (e.g. an AngularJS injector) remain reachable through it even under shadow isolation. */
  host: HTMLElement;
  props: Record<string, unknown>;
}

/** A rendering adapter: mounts props into the container and returns a live instance. */
export type IslandRenderer = (ctx: IslandMountContext) => IslandInstance;

// --- Dev-only island definition registry (debug overlay) -----------------------------------------
// defineIsland is the one place that holds an island's DECLARED shape (props, events, isolation…),
// which it otherwise discards after registration. The overlay needs it to compute "bound vs default"
// props with zero per-island cost, so in debug builds we keep a read-only tag -> definition map.

/** The declared shape of an island, captured at registration — what the overlay reads per tag. */
export interface IslandDefinition {
  tag: string;
  props: string[];
  attributes: Record<string, AttrType>;
  events: Record<string, string>;
  legacy?: LegacyStrategy;
  defaultFit: MotuFit;
  defaultTheme: MotuTheme;
  isolation: IslandIsolation;
  /** Declared external coupling beyond the store (e.g. AngularJS host-scope reach) — the overlay's EXTERNAL axis. */
  coupling?: IslandCoupling;
}

const islandDefinitions = new Map<string, IslandDefinition>();

/** The declared definition for a tag (debug only; undefined in production). */
export function getIslandDefinition(tag: string): IslandDefinition | undefined {
  return islandDefinitions.get(tag);
}

/** Every registered island definition (debug only; empty in production). */
export function getIslandDefinitions(): IslandDefinition[] {
  return [...islandDefinitions.values()];
}

/**
 * Capture an island's declared shape WITHOUT defining a custom element.
 *
 * `defineIsland` used to be the only way into this map, which quietly tied the overlay to the
 * custom-element path: under `mount: 'react'` — the default for a React host, and what the lagoon
 * uses — no element is ever defined, so every island reported "No declared props" and, because the
 * coupling view is computed from those prop rows' store keys, "No shared store keys" too. The
 * declarations were right; nothing had registered them. Registering elements just to fix the overlay
 * would be the wrong trade (it defines global custom elements a React host has no use for, and the
 * lagoon skips `defineMotuApp` for a real reason — `defineArchipelago` must not run twice), so the
 * metadata is registrable on its own.
 *
 * Debug-only, like the map it fills: a no-op in production builds.
 */
export function registerIslandDefinition(tag: string, opts: IslandElementOptions): void {
  if (!DEBUG) return;
  const inputProps = opts.contract?.input ?? opts.props ?? [];
  islandDefinitions.set(tag, {
    tag,
    props: inputProps.map((p) => (typeof p === 'string' ? p : p.name)),
    attributes: { ...(opts.attributes ?? {}) },
    events: { ...(opts.contract?.output ?? opts.events ?? {}) },
    legacy: opts.legacy,
    defaultFit: opts.defaultFit ?? 'native',
    defaultTheme: opts.defaultTheme ?? 'legacy',
    isolation: opts.isolation ?? defaultIsolation,
    coupling: opts.contract?.coupling ? { ...opts.contract.coupling } : undefined,
  });
}

const THEME_ATTR = 'data-motu-theme';
const FIT_ATTR = 'data-motu-fit';
const LEGACY_ATTR = 'data-motu-legacy';

function coerce(value: string, type: AttrType): unknown {
  if (type === 'number') return value === '' ? undefined : Number(value);
  if (type === 'boolean') return value != null && value !== 'false';
  return value;
}

// The marker class the light-DOM isolation hangs off. In light DOM there is no shadow host, so island
// CSS must be authored to also match `.motu-root` (see :where(:host, .motu-root)); the reset and the
// legacy-element neutralizer below are scoped to it too, so nothing leaks either way.
const ROOT_CLASS = 'motu-root';
const LIGHT_RESET_ID = 'motu-light-reset';

// The three-part light-DOM isolation reset — what the shadow boundary gave for free, reproduced with
// plain selectors so `isolation: 'light'` stays a mount-level flag:
//  1. a predictable box model, scoped to the root (never the whole page);
//  2. a scoped preflight baseline (kept minimal here — the app sheet carries the rest);
//  3. neutralize INBOUND legacy element (tag) selectors: legacy `table td { padding }` still reaches
//     our <td> in the same document, so reset the tags legacy stylesheets commonly touch to a clean
//     baseline INSIDE the root. Scoped via :where(.motu-root) for ZERO scope-specificity so the
//     island's own .gm-*/.motu-* classes always win; higher-specificity legacy id/class rules can
//     still reach in — the accepted light-DOM trade (decided by grepping the legacy sheet, not here).
const LIGHT_RESET_CSS = `
:where(.${ROOT_CLASS}), :where(.${ROOT_CLASS}) *, :where(.${ROOT_CLASS}) *::before, :where(.${ROOT_CLASS}) *::after { box-sizing: border-box; }
:where(.${ROOT_CLASS}) :is(h1,h2,h3,h4,h5,h6,p,ul,ol,li,dl,dd,figure,blockquote,fieldset,legend,table,thead,tbody,tfoot,tr,th,td) { margin: 0; padding: 0; border: 0; background: none; }
:where(.${ROOT_CLASS}) :is(ul,ol) { list-style: none; }
:where(.${ROOT_CLASS}) table { border-collapse: collapse; border-spacing: 0; }
:where(.${ROOT_CLASS}) :is(button,input,select,textarea) { font: inherit; color: inherit; }`;

function ensureLightReset(): void {
  if (document.getElementById(LIGHT_RESET_ID)) return;
  const style = document.createElement('style');
  style.id = LIGHT_RESET_ID;
  style.textContent = LIGHT_RESET_CSS;
  document.head.appendChild(style);
}

// A light-isolation island can't adopt a stylesheet (no shadow), so its css is injected once globally.
// Deduped by exact content: every island shares the same compiled sheet, so this injects it a single
// time no matter how many light islands mount.
const injectedLightStyles = new Set<string>();
function ensureLightStyle(css: string): void {
  if (!css || injectedLightStyles.has(css)) return;
  injectedLightStyles.add(css);
  const style = document.createElement('style');
  style.setAttribute('data-motu-light', '');
  style.textContent = css;
  document.head.appendChild(style);
}

// True when the element is mounted inside a <motu-archipelago> — crossing shadow boundaries via the
// host chain, since the archipelago may own a shadow root. Nested islands defer isolation to the
// region (render light, share its one stylesheet) instead of each opening their own shadow.
function insideArchipelago(el: Element): boolean {
  let node: Node | null = el.parentNode;
  while (node) {
    if (node instanceof ShadowRoot) {
      node = node.host;
      continue;
    }
    if ((node as Element).tagName?.toLowerCase() === 'motu-archipelago') return true;
    node = (node as Element).parentNode;
  }
  return false;
}

/**
 * Defines an island custom element `tag` backed by a rendering adapter. Reflects two orthogonal CSS
 * axes (data-motu-theme skin, data-motu-fit footprint) plus the static data-motu-legacy strategy,
 * and a third axis — isolation — chosen at registration: 'shadow' (encapsulated) or 'light' (inherits
 * the host). The renderer stays framework-specific; everything else here is neutral.
 */
export function defineIsland(tag: string, render: IslandRenderer, opts: IslandElementOptions): void {
  if (customElements.get(tag)) return;

  // The contract (grouped) supersedes the loose props/events. Resolve both to a single shape here so
  // the rest of the element machinery is unchanged whichever form the island used.
  const inputProps = opts.contract?.input ?? opts.props ?? [];
  const events = opts.contract?.output ?? opts.events ?? {};

  // Normalize the prop schema: bare strings and {name,default,required} specs both reduce to a spec.
  const propSpecs: PropSpec[] = inputProps.map((p) => (typeof p === 'string' ? { name: p } : p));
  const propNames = propSpecs.map((s) => s.name);

  const isolation: IslandIsolation = opts.isolation ?? defaultIsolation;
  registerIslandDefinition(tag, { ...opts, isolation });
  const sheet = isolation === 'shadow' && opts.css ? new CSSStyleSheet() : undefined;
  if (sheet && opts.css) sheet.replaceSync(opts.css);

  class MotuIsland extends HTMLElement {
    static observedAttributes = [...Object.keys(opts.attributes ?? {}), THEME_ATTR, FIT_ATTR];

    #instance?: IslandInstance;
    #container?: HTMLElement;
    #props: Record<string, unknown> = {};
    #handlers: Record<string, (detail: unknown) => void> = {};
    #theme: MotuTheme;
    #fit: MotuFit;

    constructor() {
      super();
      // The container (and whether this island owns a shadow root) is decided lazily in
      // connectedCallback: it depends on WHERE the island mounts (standalone -> shadow; inside an
      // archipelago -> light), which isn't known until it is connected.
      this.#theme = (this.getAttribute(THEME_ATTR) as MotuTheme) || opts.defaultTheme || 'legacy';
      this.#fit = (this.getAttribute(FIT_ATTR) as MotuFit) || opts.defaultFit || 'native';
      for (const p of propNames) {
        Object.defineProperty(this, p, {
          get: () => this.#props[p],
          set: (v) => {
            this.#props[p] = v;
            this.#pushUpdate();
          },
        });
      }
      // Settable so a host can change the skin at runtime; CSS reacts to the attribute, no re-render.
      Object.defineProperty(this, 'theme', {
        get: () => this.#theme,
        set: (v: MotuTheme) => {
          if (v && v !== this.#theme) {
            this.#theme = v;
            this.#reflectTheme();
          }
        },
      });
      // Settable footprint. Unlike theme, changing fit can change the DOM (structural islands), so it
      // re-renders as well as reflecting the attribute for CSS.
      Object.defineProperty(this, 'fit', {
        get: () => this.#fit,
        set: (v: MotuFit) => {
          if (v && v !== this.#fit) {
            this.#fit = v;
            this.#reflectFit();
            this.#pushUpdate();
          }
        },
      });
      // Event callbacks are stable per element (they only close over dispatchEvent). composed:true is
      // mandatory in shadow isolation — without it events die at the boundary; harmless in light DOM.
      for (const [prop, eventName] of Object.entries(events)) {
        this.#handlers[prop] = (detail: unknown) =>
          this.dispatchEvent(new CustomEvent(eventName, { bubbles: true, composed: true, detail }));
      }
    }

    connectedCallback() {
      this.#reflectTheme();
      this.#reflectFit();
      // No strategy declared (a host with no legacy skin) => no attribute, so `[data-motu-legacy]`
      // CSS cannot match something that was never a real posture.
      if (opts.legacy && this.getAttribute(LEGACY_ATTR) !== opts.legacy) this.setAttribute(LEGACY_ATTR, opts.legacy);
      if (!this.#container) this.#setupContainer();
      this.#applyDefaults();
      this.#instance = render({ container: this.#container!, host: this, props: this.#currentProps() });
    }

    // Fill declared defaults for props still unset at mount (so the island renders from defaults
    // alone — props are set before connect by mountIsland), then flag a required prop left unsupplied.
    #applyDefaults() {
      for (const spec of propSpecs) {
        if (spec.default !== undefined && this.#props[spec.name] === undefined) {
          this.#props[spec.name] = spec.default;
        }
        if (spec.required && this.#props[spec.name] === undefined) {
          console.error(`motu: <${tag}> is missing required prop "${spec.name}"`);
        }
      }
    }

    // Standalone islands keep their configured isolation (shadow by default). Inside a
    // <motu-archipelago> the region owns ONE boundary + stylesheet, so nested islands render light.
    #setupContainer() {
      if (isolation === 'shadow' && !insideArchipelago(this)) {
        const shadow = this.attachShadow({ mode: 'open' });
        if (sheet) shadow.adoptedStyleSheets = [sheet];
        this.#container = document.createElement('div');
        shadow.append(this.#container);
        return;
      }
      // Light DOM: render into the element itself so it inherits the host (or region) cascade. When we
      // are directly in the document light DOM (not nested inside an archipelago's shadow, which
      // already isolates us) set up the light-DOM isolation: the .motu-root marker, the scoped
      // reset/neutralizer, and — for a standalone light island — its own sheet injected globally
      // (inside an archipelago the region already injected the shared sheet).
      this.#container = this;
      if (!(this.getRootNode() instanceof ShadowRoot)) {
        this.classList.add(ROOT_CLASS);
        ensureLightReset();
        if (isolation === 'light' && opts.css && !insideArchipelago(this)) ensureLightStyle(opts.css);
      }
    }

    disconnectedCallback() {
      this.#instance?.unmount();
      this.#instance = undefined;
    }

    attributeChangedCallback(name: string, _old: string | null, value: string | null) {
      if (name === THEME_ATTR) {
        this.#theme = (value as MotuTheme) || 'legacy';
        return;
      }
      if (name === FIT_ATTR) {
        this.#fit = (value as MotuFit) || 'native';
        this.#pushUpdate();
        return;
      }
      const type = opts.attributes?.[name];
      if (!type) return;
      this.#props[name] = coerce(value ?? '', type);
      this.#pushUpdate();
    }

    #currentProps(): Record<string, unknown> {
      return { ...this.#props, ...this.#handlers, fit: this.#fit };
    }

    #pushUpdate() {
      this.#instance?.update(this.#currentProps());
    }

    #reflectTheme() {
      if (this.getAttribute(THEME_ATTR) !== this.#theme) this.setAttribute(THEME_ATTR, this.#theme);
    }

    #reflectFit() {
      if (this.getAttribute(FIT_ATTR) !== this.#fit) this.setAttribute(FIT_ATTR, this.#fit);
    }
  }

  customElements.define(tag, MotuIsland);
}
