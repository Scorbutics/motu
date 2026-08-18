// A minimal AngularJS host motu can own itself, for environments with NO legacy app on the page
// (the standalone lagoon, a Storybook, a plain preview). It bootstraps an empty motu module on a
// hidden element and keeps its injector so `defineAngularElement` islands can compile against it — the
// caller wires up whatever host context an extracted island needs (e.g. a stubbed host directive
// + fixture scope) via `configure`. Embedded pages ignore this: there the island finds the
// real app injector on document.body instead.

function windowAngular(): any {
  return (window as unknown as { angular?: any }).angular;
}

let hostInjector: any = null;

/** The motu-provided injector (set by provideAngularHost), or null when no host was provided. */
export function motuAngularInjector(): any {
  return hostInjector;
}

export interface ProvideAngularHostOptions {
  /** The AngularJS global. Defaults to window.angular; the lagoon imports the `angular` npm package. */
  angular?: any;
  /** Module names the motu host module depends on. */
  requires?: string[];
  /** Configure the host module before bootstrap: register directives, seed $rootScope via .run(), … */
  configure?: (module: any) => void;
}

/**
 * Bootstraps a motu-owned AngularJS app so islands can run without a legacy host on the page.
 * Idempotent. After this, defineAngularElement falls back to this injector when document.body has none.
 */
export function provideAngularHost(opts: ProvideAngularHostOptions = {}): void {
  const ng = opts.angular ?? windowAngular();
  if (!ng) {
    console.warn('motu: provideAngularHost needs AngularJS (pass { angular } or set window.angular)');
    return;
  }
  (window as unknown as { angular?: any }).angular = ng;
  if (hostInjector) return;
  const mod = ng.module('motuAngularHost', opts.requires ?? []);
  opts.configure?.(mod);
  const host = document.createElement('div');
  host.setAttribute('data-motu-angular-host', '');
  host.style.display = 'none';
  document.body.appendChild(host);
  hostInjector = ng.bootstrap(host, ['motuAngularHost']);
}
