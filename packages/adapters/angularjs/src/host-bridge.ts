// The AngularJS host bridge: motu island intents become AngularJS navigation, wrapped in a digest
// so the SPA reacts. Outward actions surface as a DOM CustomEvent legacy handlers can listen for.
// This is the reusable adapter form of the glue that used to live in the bridge composition root.

import type { HostBridge } from '@motu/core';

function injector(): any {
  return (window as unknown as { angular?: any }).angular?.element(document.body).injector();
}

export interface AngularHostBridgeOptions {
  /** Event name dispatched on document for outward actions. Default 'motu:action'. */
  actionEvent?: string;
}

/** Builds a HostBridge backed by AngularJS $location (navigation) + a DOM event (actions). */
export function angularHostBridge(opts: AngularHostBridgeOptions = {}): HostBridge {
  const actionEvent = opts.actionEvent ?? 'motu:action';
  const go = (url: string) => {
    const inj = injector();
    if (!inj) {
      window.location.hash = url.startsWith('/') ? '#' + url : '#/' + url;
      return;
    }
    const $location = inj.get('$location');
    const $rootScope = inj.get('$rootScope');
    $rootScope.$apply(() => $location.url(url));
  };
  return {
    navigate: go,
    action: (name, detail) => {
      document.dispatchEvent(new CustomEvent(actionEvent, { detail: { name, detail } }));
    },
  };
}
