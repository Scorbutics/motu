// The AngularJS island renderer: authors an island in the legacy host's OWN language. It compiles a
// template (usually just the legacy directive's own tag, or lifted markup) against a fresh isolate
// scope using the running app's injector, so registered directives/services/filters are available —
// then feeds motu props onto that scope and digests. Because it plugs into the same defineIsland
// base as React, the archipelago can't tell the island is AngularJS: it sets props and listens for
// events exactly the same way. Defaults to LIGHT DOM — shadow DOM fights $compile/$digest and the
// legacy global CSS the component expects.

import { defineIsland, type IslandElementOptions, type IslandInstance } from '@motu/core';
import { motuAngularInjector } from './host';

function angular(): any {
  return (window as unknown as { angular?: any }).angular;
}

// Climb out of any shadow roots to the nearest light-DOM element. AngularJS's injector()/scope() walk
// parentNode, which stops at a shadow boundary — so from an island nested in an archipelago's shadow
// root we must hop shadow hosts to reach the element that actually lives in the app's ng-app DOM.
function lightDomHost(node: Node): Element {
  let current: Node = node;
  for (;;) {
    const root = current.getRootNode();
    if (root instanceof ShadowRoot) current = root.host;
    else break;
  }
  return current as Element;
}

/**
 * Context handed to `onAdopt` — the escape hatch for doing whatever you want with the adopted legacy
 * DOM (hide bits, restyle, wire real-time…). All of that is PROJECT policy, so the framework doesn't
 * grow an option per tweak.
 */
export interface AdoptContext {
  /** The adopted node(s), now inside the island — the real, live legacy DOM (mutate it freely). */
  nodes: HTMLElement[];
  /** The island element the nodes were moved into. */
  container: HTMLElement;
  /** Dispatch a bubbling+composed CustomEvent from the island (handled by the archipelago `on:`). */
  emit: (event: string, detail: unknown) => void;
  /** The AngularJS global, if you need element/scope helpers directly. */
  angular: any;
}

export interface AngularElementSpec {
  /**
   * The AngularJS template HTML compiled for the island. Most often this is just the legacy directive
   * invocation, e.g. `<legacy-user-search criteria="criteria" on-change="onChange($detail)">`, so
   * $compile + the already-registered directive do the real work. Optional when `adopt` is used and
   * matches (then it's only a fallback, e.g. for offline preview).
   */
  template?: string;
  /**
   * ADOPTION mode — the most faithful extraction. Instead of RE-rendering a copy, physically relocate
   * the existing, already-compiled legacy node(s) matching this selector INTO the island. They keep
   * their live scope/bindings (e.g. a host-coupled widget stays wired to the host controller), so nothing
   * is re-compiled — the exact working component is reused, then restored on unmount. If the selector
   * matches nothing (e.g. offline preview with no legacy DOM), it falls back to `template`.
   *
   * DECLARE in element.ts `mount.adopt` — defineAngularElement injects it here. (Authoring
   * it directly on the spec still works as a fallback.) The `onAdopt` behaviour hook stays on the spec.
   */
  adopt?: string;
  /**
   * Escape hatch: run project code against the adopted node(s) after they're moved in — hide bits,
   * restyle, wire real-time (see `watchHostScope`), etc. Return a cleanup, called on unmount (so any
   * DOM you touched is restored when toggling back to the legacy widget). This is where project policy
   * lives, so the framework needn't grow a bespoke option for every tweak.
   */
  onAdopt?: (ctx: AdoptContext) => (() => void) | void;
  /** Optional controller (module-registered name, constructor, or DI array) instantiated for the scope. */
  controller?: unknown;
  /** Expose the controller instance on the scope under this name. Default 'vm'. */
  controllerAs?: string;
  /**
   * Map motu props onto the scope. Default: assigns every prop (data props + injected `onXxx`
   * callbacks + `fit`) directly onto the scope, so the template can reference `criteria`, `onChange`, …
   */
  applyProps?: (scope: any, props: Record<string, unknown>) => void;
  /**
   * EXTRACTION mode. Instead of an isolate scope fed by motu props, derive the island scope from an
   * existing HOST scope so lifted legacy markup keeps its original bindings/configs/actions (e.g. a
   * host field-schema config, the model it edits, its search action). 'parent' = the island element's own
   * parent scope; a selector = that element's scope. The island scope is a NON-isolate child ($new) of
   * it, so those names resolve up the prototype chain. Requires light isolation (the island must live
   * in the host's Angular DOM to have a parent scope). This is the "extract existing code" path.
   *
   * DECLARE in element.ts `mount.inheritScope` — defineAngularElement injects it here.
   */
  inheritScope?: 'parent' | string;
  /**
   * ISOLATE mode refinement: run as a NON-isolate child of the host controller scope that OWNS this
   * property (walked on the $rootScope tree, so it works with debugInfoEnabled(false)) instead of a
   * bare isolate scope off $rootScope. Motu props are still assigned on top and the island's own model
   * stays a local property that flows to the store — but the scope now INHERITS host state, which
   * host-coupled widgets require. Needed whenever lifted markup resolves host helpers (lookups, the
   * logged-in user, suggest callbacks) up the prototype chain and would abort the render without them.
   *
   * NOT authored here — this is the render-time MECHANISM. Declare it (and the host-scope names it
   * pulls in) in the island's element.ts (`mount.hostScopeKey` + `contract.effects` `scope:…`); the
   * `defineAngularElement` wrapper injects the key into this spec. Keeping it out of the `.ng.ts`
   * render body is what leaves the whole contract in one place.
   */
  hostScopeKey?: string;
}

/** The AngularJS island contract shaped like defineReactElement's — input/output/effects in one place. */
export type DefineAngularElementOptions = IslandElementOptions;

const NOOP: IslandInstance = { update() {}, unmount() {} };

// Find the scope that OWNS `key` by walking the $rootScope tree ($$childHead/$$nextSibling). Works
// even when the app runs debugInfoEnabled(false) — where angular.element(el).scope() returns undefined
// because scope data isn't attached to DOM elements (the common production optimisation).
function findScopeWith(scope: any, key: string): any {
  if (scope && Object.prototype.hasOwnProperty.call(scope, key)) return scope;
  for (let child = scope?.$$childHead; child; child = child.$$nextSibling) {
    const found = findScopeWith(child, key);
    if (found) return found;
  }
  return null;
}

export interface WatchHostScopeOptions {
  /** Scope expression to watch, e.g. 'search'. */
  expr: string;
  /**
   * Own scope property used to LOCATE the target scope (defaults to the root of `expr`). Use when the
   * watched model is created lazily (e.g. a host `search` model that only exists after the first
   * keystroke) — locate by a property set at compile time, like the host's field-schema config.
   */
  locateBy?: string;
  /** Deep-watch objects (default true). */
  deep?: boolean;
  /** Debounce ms — for real-time typing, avoids firing per keystroke. */
  debounce?: number;
}

/**
 * Watch a host AngularJS scope expression from a DOM `node`, calling `handler` on change. Handles the
 * two hard bits so callers don't have to: resolving the scope with debugInfoEnabled(false) (walks the
 * $rootScope tree instead of relying on element scope data), and RETRYING until the scope exists (the
 * legacy view may still be compiling at mount). Returns a cleanup that stops watching. Use it inside
 * `onAdopt` to wire real-time behaviour from adopted legacy DOM.
 */
export function watchHostScope(
  node: Element,
  opts: WatchHostScopeOptions,
  handler: (value: unknown) => void,
): () => void {
  const ng = angular();
  const el = ng && ng.element(node);
  const injector =
    (el && el.injector()) ||
    (ng && ng.element(lightDomHost(node)).injector()) ||
    (ng && ng.element(document.body).injector()) ||
    motuAngularInjector();
  const rootScope = injector && injector.get('$rootScope');
  const locateKey = opts.locateBy ?? opts.expr.split('.')[0].split('[')[0];

  let unwatch: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let retry: ReturnType<typeof setInterval> | undefined;

  const attach = (): boolean => {
    const scope = (el && el.scope()) || (rootScope && findScopeWith(rootScope, locateKey));
    if (!scope) return false;
    unwatch = scope.$watch(
      opts.expr,
      (v: unknown) => {
        if (!opts.debounce) return handler(v);
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => handler(v), opts.debounce);
      },
      opts.deep ?? true,
    );
    return true;
  };
  if (!attach()) {
    let tries = 0;
    retry = setInterval(() => {
      if (attach() || ++tries > 60) clearInterval(retry);
    }, 50);
  }
  return () => {
    if (retry) clearInterval(retry);
    if (timer) clearTimeout(timer);
    unwatch?.();
  };
}

function assignProps(scope: any, props: Record<string, unknown>, spec: AngularElementSpec): void {
  if (spec.applyProps) spec.applyProps(scope, props);
  else Object.assign(scope, props);
}

// Schedule a digest without throwing if one is already running (motu mounts/updates from outside
// AngularJS, e.g. a store subscription or the custom-element lifecycle).
function digest(scope: any): void {
  const phase = scope?.$root?.$$phase;
  if (phase) scope.$evalAsync();
  else scope.$applyAsync();
}

// ADOPTION: physically move existing compiled node(s) into the island (no re-compile — they keep
// their live scope/bindings), remembering where they came from to restore them on unmount. Project
// policy (hide/restyle/wire real-time) runs in the spec's `onAdopt` hook.
function adopt(nodes: HTMLElement[], container: HTMLElement, spec: AngularElementSpec): IslandInstance {
  const origins = nodes.map((node) => ({
    node,
    parent: node.parentNode,
    next: node.nextSibling,
    display: node.style.display,
  }));
  for (const { node } of origins) {
    node.style.display = '';
    container.appendChild(node);
  }

  let cleanup: (() => void) | void;
  if (spec.onAdopt) {
    const emit = (event: string, detail: unknown) =>
      container.dispatchEvent(new CustomEvent(event, { bubbles: true, composed: true, detail }));
    cleanup = spec.onAdopt({ nodes, container, emit, angular: angular() });
  }

  return {
    update() {},
    unmount() {
      cleanup?.();
      // Restore in reverse document order so each saved nextSibling is back in place first.
      for (let i = origins.length - 1; i >= 0; i--) {
        const { node, parent, next, display } = origins[i];
        node.style.display = display;
        if (parent && parent.isConnected) {
          parent.insertBefore(node, next && next.parentNode === parent ? next : null);
        } else {
          node.remove();
        }
      }
    },
  };
}

function render(container: HTMLElement, host: HTMLElement, initialProps: Record<string, unknown>, spec: AngularElementSpec): IslandInstance {
  // Adoption first: reuse the real, already-compiled node(s) when present (embedded legacy page).
  if (spec.adopt) {
    const found = Array.from(document.querySelectorAll(spec.adopt)) as HTMLElement[];
    if (found.length) return adopt(found, container, spec);
  }
  if (!spec.template) {
    console.warn('motu: nothing to render (adopt matched no nodes and no template fallback)');
    return NOOP;
  }
  const ng = angular();
  if (!ng) {
    console.warn('motu: defineAngularElement requires AngularJS on the page');
    return NOOP;
  }
  // The real legacy app injector when embedded; otherwise a motu-provided host (lagoon/preview).
  // Resolve via the HOST element (always in light DOM) so the app injector stays reachable even under
  // shadow isolation, where the render container lives behind the shadow boundary. lightDomHost also
  // hops out of an archipelago's shadow root when the island is nested inside one.
  const injector =
    ng.element(lightDomHost(host)).injector() ||
    ng.element(document.body).injector() ||
    motuAngularInjector();
  if (!injector) {
    console.warn('motu: no AngularJS app on the page (embed on a legacy page, or call provideAngularHost)');
    return NOOP;
  }
  const $compile = injector.get('$compile');
  const $rootScope = injector.get('$rootScope');

  // Build the live scope's controller + compile the template into the container. Split out so a
  // hostScopeKey island can DEFER it until its host scope exists.
  const compile = (scope: any): IslandInstance => {
    if (spec.controller != null) {
      const $controller = injector.get('$controller');
      scope[spec.controllerAs ?? 'vm'] = $controller(spec.controller, { $scope: scope });
    }
    // Support multi-root templates (e.g. a lifted title + form): compile + append every root node.
    const linked = $compile(ng.element(spec.template!))(scope);
    const nodes: ChildNode[] = Array.prototype.slice.call(linked);
    for (const node of nodes) container.appendChild(node);
    digest(scope);
    return {
      update(next) {
        if (spec.inheritScope) {
          if (spec.applyProps) spec.applyProps(scope, next);
        } else {
          assignProps(scope, next, spec);
        }
        digest(scope);
      },
      unmount() {
        scope.$destroy();
        if (typeof linked.remove === 'function') linked.remove();
        else for (const node of nodes) node.remove();
      },
    };
  };

  // Extraction mode: a NON-isolate child of a host scope (inherits its bindings/configs/actions).
  if (spec.inheritScope) {
    const sourceEl =
      spec.inheritScope === 'parent' ? host : document.querySelector(spec.inheritScope);
    const source = (sourceEl && ng.element(sourceEl).scope()) || $rootScope;
    const scope = source.$new();
    if (spec.applyProps) spec.applyProps(scope, initialProps);
    return compile(scope);
  }

  // Plain isolate scope fed by motu props.
  if (!spec.hostScopeKey) {
    const scope = $rootScope.$new(true);
    assignProps(scope, initialProps, spec);
    return compile(scope);
  }

  // hostScopeKey: a NON-isolate child of the host controller scope (found by that owned prop; works
  // with debugInfoEnabled(false)) so host-coupled widgets resolve inherited state — lifted markup
  // can read host helpers (lookups, the logged-in user) off the scope chain and would abort without
  // them. Motu props are assigned on top; the island's own model (e.g. `draft`) stays local -> store.
  // The host scope is set by the host controller and may not exist yet on initial load (mount races the
  // controller), so DEFER the compile until it appears; fall back to an isolate scope after a timeout so
  // a missing host never leaves the island blank.
  const childOf = (hostScope: any): any => {
    const scope = (hostScope || $rootScope).$new(!hostScope);
    assignProps(scope, initialProps, spec);
    return scope;
  };
  const found = findScopeWith($rootScope, spec.hostScopeKey);
  if (found) return compile(childOf(found));

  let inst: IslandInstance | undefined;
  let latest = initialProps;
  let disposed = false;
  let tries = 0;
  const poll = setInterval(() => {
    const hostScope = disposed ? null : findScopeWith($rootScope, spec.hostScopeKey!);
    if (disposed || hostScope || ++tries >= 60) {
      clearInterval(poll);
      if (disposed) return;
      inst = compile(childOf(hostScope));
      inst.update(latest);
    }
  }, 50);
  return {
    update(next) {
      latest = next;
      inst?.update(next);
    },
    unmount() {
      disposed = true;
      clearInterval(poll);
      inst?.unmount();
    },
  };
}

/**
 * Registers an island whose body is authored in AngularJS. Same registration contract as
 * defineReactElement (input/output/coupling via `contract`, plus legacy/fit), so it drops into the
 * archipelago and the element registry identically — only the rendering technology differs. The
 * host-scope MECHANISM (`hostScopeKey`) comes from the element's `mount` and is injected
 * into the render spec here, so the `.ng.ts` body stays pure render (template + controller) and the
 * whole contract lives in element.ts. Isolation defaults to 'light'.
 */
export function defineAngularElement(
  tag: string,
  spec: AngularElementSpec,
  opts: DefineAngularElementOptions,
): void {
  // The ATTACH mechanisms (adopt / inheritScope / hostScopeKey) are declared in the element's `mount`
  // and injected into the render spec here, so the `.ng.ts` body stays pure render. Values authored on
  // the spec remain a fallback.
  //
  // They used to live in `contract.coupling`, which read as part of the island's boundary and is not:
  // they say WHERE in a legacy scope tree this element attaches. The names it RESOLVES from that scope
  // are boundary facts and live in `contract.effects` as `scope:…`, beside the modules and the tables.
  const c = opts.mount ?? {};
  const effectiveSpec: AngularElementSpec = {
    ...spec,
    adopt: c.adopt ?? spec.adopt,
    inheritScope: c.inheritScope ?? spec.inheritScope,
    hostScopeKey: c.hostScopeKey ?? spec.hostScopeKey,
  };
  defineIsland(tag, ({ container, host, props }) => render(container, host, props, effectiveSpec), {
    ...opts,
    isolation: opts.isolation ?? 'light',
  });
}
