// Thin lagoon entry: reads the vite-injected target/fit and hands the generic lagoon harness
// (@motu/react → bootstrapLagoon) the project's element registry, fixtures, and archipelago resolver.
// All harness logic is framework-side; this file only supplies app-specific inputs.
import { bootstrapLagoon } from '@motu/react';
import { setDefaultIsolation } from '@motu/core';
import { angularHostScopeChannel } from '@motu/adapter-angularjs';
import { ELEMENT_REGISTRY, getArchipelago, ALL_FIXTURES, ALL_ROLES } from 'demo-app';
import css from 'demo-app/styles.css?inline';
import { setupLagoonAngularHost } from './angular-host.js';

// Injected by vite.config from MOTU_TARGET / MOTU_FIT. Empty target => the members archipelago.
declare const __MOTU_TARGET__: string; // "island:x-company-lookup" | "archipelago:members"
declare const __MOTU_FIT__: string; //    "native" | "legacy"
declare const __MOTU_FORCE_ERROR__: string; // "" | "500" | "403" — verify's error-resilience mount
// Project-wide default isolation, injected from motu.config.json by vite (see setDefaultIsolation).
declare const __MOTU_ISOLATION__: 'shadow' | 'light';

// Set BEFORE bootstrapLagoon so single-target verify exercises the project's real isolation posture.
setDefaultIsolation(__MOTU_ISOLATION__);

// Give AngularJS islands (e.g. the extracted member-search) a host so they render offline.
setupLagoonAngularHost();

/**
 * PER-ISLAND PROPS THE PAGE PASSES AND THE REGION DOES NOT CARRY.
 *
 * `loading` is the profile hero's own prop, not a region key: the page knows it is waiting on two
 * requests, and no island owns that fact. Without a stand-in here the island would be previewed and
 * approved in a state the application never shows it in — which is what `integrate check`'s
 * `island-props` refuses, and it is right to.
 *
 * A STAND-IN, NOT THE REAL THING: `false` is the state the page spends almost all of its time in.
 * The skeleton itself is still reachable — it is one of the island's own scenarios, at its own
 * address — which is the right place for a state the region does not own.
 *
 * Declared as `const props`, the KIND-FIRST shape, because that is the one `integrate check` reads.
 */
const props = {
  profile: {
    'profile-hero': { loading: false },
  },
};

bootstrapLagoon({
  overrides: { props },
  elements: ELEMENT_REGISTRY,
  css,
  fixtures: ALL_FIXTURES,
  roles: ALL_ROLES,
  resolveArchipelago: getArchipelago,
  // Same channel as the embedded bridge: mirror the host's field schema into the store so the
  // search island receives its `config` prop. The lagoon host seeds a stub config (no widgetBuilder),
  // so the island falls back to its own MEMBER_SEARCH_CONFIG.
  channels: [angularHostScopeChannel({ key: 'hostSearchConfig', into: 'searchConfig' })],
  target: typeof __MOTU_TARGET__ === 'string' ? __MOTU_TARGET__ : '',
  fit: typeof __MOTU_FIT__ === 'string' ? __MOTU_FIT__ : '',
  forceErrorStatus:
    typeof __MOTU_FORCE_ERROR__ === 'string' && __MOTU_FORCE_ERROR__ ? Number(__MOTU_FORCE_ERROR__) : undefined,
});
