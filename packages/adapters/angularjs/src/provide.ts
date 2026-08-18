// The AngularJS-ocean shim for motu's neutral inbound seam. motu boundary elements
// (<motu-archipelago>, <motu-island>) expose a plain-DOM `provide(key, value)`; Vue, Angular 2+ and
// vanilla can feed them with native property binding, but AngularJS has no DOM-property binding — so
// this attribute directive bridges it. Because it links against the element's OWN host scope, it
// resolves the expression by normal inheritance (no scope-walking, works with debugInfoEnabled(false)).

function windowAngular(): any {
  return (window as unknown as { angular?: any }).angular;
}

export interface InstallMotuProvideOptions {
  /** The AngularJS global (defaults to window.angular). */
  angular?: any;
  /** Host app module to register the directive on. Default 'app'. */
  module?: string;
}

/**
 * Registers the `motuProvide` attribute directive on the host app module. Put it on a motu boundary
 * element placed in the HOST template (light DOM, compiled at bootstrap) to feed host data into the
 * region/island store using the host's own scope:
 *
 *   <motu-archipelago name="members" motu-provide="searchConfig: hostSearchConfig"></motu-archipelago>
 *
 * `key: expr` pairs separated by ';'. The expression must be in scope AT the element — put the binding
 * where the data lives (or lift the data). Must be called before the app bootstraps (as bridge.js is).
 */
export function installMotuProvide(opts: InstallMotuProvideOptions = {}): void {
  const ng = opts.angular ?? windowAngular();
  if (!ng) {
    console.warn('motu: installMotuProvide needs AngularJS (pass { angular } or set window.angular)');
    return;
  }
  ng.module(opts.module ?? 'app').directive('motuProvide', () => ({
    restrict: 'A',
    link(scope: any, el: any, attrs: any) {
      const node = el[0];
      const provide = typeof node.provide === 'function' ? node.provide.bind(node) : null;
      if (!provide) {
        console.warn('motu: motuProvide on an element with no provide() (not a motu boundary element)');
        return;
      }
      String(attrs.motuProvide)
        .split(';')
        .forEach((pair: string) => {
          const idx = pair.indexOf(':');
          if (idx < 0) return;
          const key = pair.slice(0, idx).trim();
          const expr = pair.slice(idx + 1).trim();
          if (key && expr) scope.$watch(expr, (v: unknown) => provide(key, v));
        });
    },
  }));
}
