// The shell region's binding. motu and the region's own declaration, nothing else — the same rule as
// the page bindings beside it, so `removal-check` deletes this file whole.
import { createRegion } from '@motu/react';
import { shellArchipelago } from 'demo-app/archipelagos/shell';
import { ELEMENT_REGISTRY } from 'demo-app';
import { useHostBridge } from '../lib/routing.js';

export const Shell = createRegion(shellArchipelago, {
  elements: ELEMENT_REGISTRY,
  // The bar's `app-navigate` becomes a URL in the archipelago; this is what pushes it.
  useHost: useHostBridge,
  // Both keys established before the first paint. `section` is null until the route is read, which
  // the bar renders as nothing lit — a designed state, not `undefined` reaching a component.
  seed: { section: null, dataSource: 'sandbox' },
});
