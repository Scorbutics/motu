// The lagoon gallery entry.
//
// MIGRATED FROM A HAND-ROLLED GALLERY. This file used to be the gallery itself: it configured the
// transport, mounted the transport and fit toggles, built its own archipelago switcher with its own
// localStorage keys, injected the frame stylesheets, and mounted the tide line. All of that now lives
// in @motu/react (`startLagoon`), which is what `motu init` scaffolds and what every other project
// uses — so improvements to the gallery arrive with the framework instead of needing this file
// rewritten.
//
// It mattered beyond tidiness: the chrome moved OUT of the artifact, and a hand-rolled gallery
// publishes neither the catalogue nor the control surface the host's sidebar reads. This project was
// the only one left drawing its own dock, and so the only one that could not show the region sheet,
// the seams, the island scope or coverage.
//
// What stays here is only what Vite requires in the app: the build-time defines, the project's own
// registry and stylesheet, the frame glob, and the debug overlay — which @motu/react must not depend
// on, so the app hands it in.
import { HttpTransport } from '@motu/runtime';
import { setDefaultIsolation, type HostBridge } from '@motu/core';
import { startLagoon, overridesFor, type TransportMode } from '@motu/react';
import { angularHostScopeChannel } from '@motu/adapter-angularjs';
import {
  mountDebugOverlay,
  toggleDebugOverlay,
  isDebugOverlayOpen,
  subscribeDebugOverlay,
  mountFindings,
  currentFindings,
  currentSheet,
  currentSeams,
  currentIslands,
  currentCoupling,
  currentCoverage,
  watchSeams,
  toggleRecording,
  recordingState,
} from '@motu/debug-overlay';
import { ELEMENT_REGISTRY, ARCHIPELAGOS, membersArchipelago, usersArchipelago, ALL_FIXTURES, ALL_ROLES } from 'demo-app';
import css from 'demo-app/styles.css?inline';
import config from '../lagoon.config.json';
import { setupLagoonAngularHost } from './angular-host.js';
// Ambient ocean cascade (lagoon-only): the host's typography/palette + the --x-* token contract, so
// light islands inherit the ocean look offline exactly as they would embedded. Injected early so
// island styles still win.
import './ocean.css';

// Build/dev default for the transport, injected by vite.config from the MOTU_TRANSPORT env var.
// Empty string means "unset" → mock, so agents get backend-free data.
declare const __MOTU_TRANSPORT__: string;
// Present in the lagoon by default (the sandbox); MOTU_DEBUG=0 strips it.
declare const __MOTU_DEBUG__: boolean;
// Project-wide default isolation, injected from motu.config.json by vite.
declare const __MOTU_ISOLATION__: 'shadow' | 'light';

// BEFORE anything mounts, so the lagoon previews the project's real isolation posture.
setDefaultIsolation(__MOTU_ISOLATION__);

const host: HostBridge = {
  navigate: (path) => {
    console.log('[host] navigate', path);
    window.location.hash = path.startsWith('/') ? '#' + path : '#/' + path;
  },
  action: (name, detail) => {
    console.log('[host] action', name, detail);
  },
};

// Authored per-mountpoint frames (lagoon-only): the stand-in geometry for each slot's distinct ocean
// callsite. Authored files AND `motu archipelago record-frame` output both live in src/frames/*.css;
// the bridge never ships them, because in the ocean the real callsite provides the container.
const frames = import.meta.glob('./frames/*.css', {
  query: '?inline',
  import: 'default',
  eager: true,
}) as Record<string, string>;

startLagoon({
  elements: ELEMENT_REGISTRY,
  archipelagos: ARCHIPELAGOS,
  fixtures: ALL_FIXTURES,
  roles: ALL_ROLES,
  css,
  config,
  frames,
  isolation: __MOTU_ISOLATION__,
  transport: typeof __MOTU_TRANSPORT__ === 'string' ? __MOTU_TRANSPORT__ : '',
  debug: __MOTU_DEBUG__,
  overrides: {
    host,
    // Stands up a fake AngularJS host so the extracted member-search island renders offline. It was a
    // top-level call; `setup` is the declared point for it and runs in BOTH views rather than only
    // whichever happened to import this module first.
    setup: setupLagoonAngularHost,
    /**
     * HTTP is the only mode this project builds itself.
     *
     * The real backend sits behind the dev proxy and wants this project's own XSRF cookie and header
     * names, which `httpBase` alone cannot say. Mock is deliberately left to the default: the lagoon
     * has to work offline, and every island already owns its fixtures.
     */
    transportFor: (mode: TransportMode) =>
      mode === 'http'
        ? new HttpTransport('/api/rest/motu', {
            xsrfCookieName: 'M-XSRF-TOKEN',
            xsrfHeaderName: 'X-M-XSRF-TOKEN',
          })
        : undefined,
    // PER REGION, and only where it is meant. Only `members` has a search island reading
    // `searchConfig`, so only it gets that channel — wiring it to the others would show up in the
    // lens as channels nothing reads, which is a finding rather than a configuration.
    regions: [
      overridesFor(membersArchipelago(), {
        seed: { criteria: {} },
        // Mirror the host's field schema into the store so the search island receives its `config`
        // prop. The lagoon seeds a stub (no widgetBuilder), so the island uses its own config.
        channels: [angularHostScopeChannel({ key: 'hostSearchConfig', into: 'searchConfig' })],
      }),
      overridesFor(usersArchipelago, { seed: { criteria: {} } }),
    ],
  },
  // The seam lens, handed in rather than imported: @motu/react must not depend on the dev-only
  // package, and __MOTU_DEBUG__ strips both the overlay and this wiring together.
  lens: __MOTU_DEBUG__
    ? {
        mount: mountDebugOverlay,
        toggle: toggleDebugOverlay,
        isOpen: isDebugOverlayOpen,
        subscribe: subscribeDebugOverlay,
        mountFindings,
        findings: currentFindings,
        sheet: currentSheet,
        seams: currentSeams,
        islands: currentIslands,
        coupling: currentCoupling,
        coverage: currentCoverage,
        toggleRecording,
        recordingState,
        watch: watchSeams,
      }
    : undefined,
});
