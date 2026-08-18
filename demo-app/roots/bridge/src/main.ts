// bridge.js composition root — the EMBEDDED mode wiring. Injected into legacy pages via one
// <script> tag. Everything mode-specific lives here; the components and app config stay mode-agnostic.

import { configure, HttpTransport } from '@motu/runtime';
import { absorbHostTheme, setDefaultIsolation } from '@motu/core';
import { defineMotuApp } from '@motu/react';
import { mountDebugOverlay } from '@motu/debug-overlay';
import { angularHostBridge, angularHttpChannel, installMotuProvide } from '@motu/adapter-angularjs';
import { ELEMENT_REGISTRY, adminArchipelago, membersArchipelago, usersArchipelago } from 'demo-app';
import css from 'demo-app/styles.css?inline';

// Stripped from the prod bridge (vite define __MOTU_DEBUG__ = false), present in the console
// hot-reload build. Guarding the call lets the whole overlay import tree-shake out of production.
declare const __MOTU_DEBUG__: boolean;
// Project-wide default isolation, injected from motu.config.json by vite (see setDefaultIsolation).
declare const __MOTU_ISOLATION__: 'shadow' | 'light';

// Set BEFORE defineMotuApp so every island/region registration below picks up the project default.
setDefaultIsolation(__MOTU_ISOLATION__);

// The motu dispatcher is mounted inside the legacy /rest JAX-RS app. web-console uses a
// module-specific XSRF token (cookie M-XSRF-TOKEN -> header X-M-XSRF-TOKEN).
configure(
  new HttpTransport('/api/rest/motu', {
    xsrfCookieName: 'M-XSRF-TOKEN',
    xsrfHeaderName: 'X-M-XSRF-TOKEN',
  }),
);

// Legacy islands adopt the host's exact palette AND shape via the --x-* token contract. The one bit
// of project knowledge — where those values live in the console markup — stays here in the composition
// root, not in the framework: the primary is the ocean-blue section header; the border/radius come
// from a host form input so islands match the legacy field shape. Any token whose source isn't on the
// page keeps its stylesheet fallback.
absorbHostTheme({
  primary: { selector: '#sectionInner .section-content > h1' },
  border: { selector: '#sectionInner .section-content input', property: 'border-top-color', into: '--x-border' },
  radius: { selector: '#sectionInner .section-content input', property: 'border-top-left-radius', into: '--x-radius' },
});

// Seed the motu list from the legacy sticky search so it renders the right data before the user
// runs a fresh search.
function readStickySearch(): Record<string, unknown> {
  try {
    const sticky = JSON.parse(localStorage.getItem('stickySearch') || '{}');
    return sticky.member ?? {};
  } catch {
    return {};
  }
}

const host = angularHostBridge();

// Register the motuProvide directive on the legacy 'app' module (before it bootstraps) so the JSP can
// feed host data into a motu boundary element with the host's own scope. The member partial uses it:
//   <motu-island slot="member-search-ng" ... motu-provide="searchConfig: hostSearchConfig">
// to mirror the host's field schema into the store (framework-neutral seam; no host scope-walking).
installMotuProvide();

defineMotuApp({
  elements: ELEMENT_REGISTRY,
  css,
  // Embedded uses the legacy skin by design so islands match the host — no gradients or preview fonts.
  defaultTheme: 'legacy',
  archipelagos: [
    { config: adminArchipelago, options: { host } },
    // The Users page: only the Search box is extracted so far. It's default-OFF via legacy-toggle, so
    // prod still shows the legacy search until someone flips it. NOTE: the Users *results* list is
    // still legacy AngularJS — driving it from this island needs an outbound channel (or extracting the
    // results island too); today the toggled-on search island writes the motu store only.
    { config: usersArchipelago, options: { host } },
    {
      config: membersArchipelago(),
      options: {
        host,
        seed: { criteria: readStickySearch() },
        // Coexistence sync (inbound, optional): the LEGACY search's criteria flow into the store so
        // using the OLD search also refreshes the motu list (which then self-fetches via the
        // contract). Generic — it only taps $http by URL. Drop it once the legacy search is gone.
        channels: [
          angularHttpChannel({
            match: /\/rest\/member\/(?:search|summarize)\/\d+/,
            onRequest: (req, store) =>
              store.set('criteria', (req.body as Record<string, unknown>) ?? {}),
          }),
        ],
      },
    },
  ],
});

// Dev-only seam lens. Guarded so the import is dead-code-eliminated from the production bridge.
if (__MOTU_DEBUG__) mountDebugOverlay();
