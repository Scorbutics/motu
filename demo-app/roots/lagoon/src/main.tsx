import { configure, HttpTransport } from '@motu/runtime';
import { MockTransport } from '@motu/runtime/mock';
import { setDefaultIsolation, type HostBridge } from '@motu/core';
import { defineMotuApp, resolveTransportMode, mountTransportToggle, mountFitToggle, mountTideLine, type TideView, type TransportMode, type MotuArchipelago } from '@motu/react';
import { angularHostScopeChannel } from '@motu/adapter-angularjs';
import { mountDebugOverlay, toggleDebugOverlay, isDebugOverlayOpen, subscribeDebugOverlay } from '@motu/debug-overlay';
import { ELEMENT_REGISTRY, membersArchipelago, adminArchipelago, usersArchipelago, ALL_FIXTURES, ALL_ROLES } from 'demo-app';
import css from 'demo-app/styles.css?inline';
import { setupLagoonAngularHost } from './angular-host.js';
// Ambient ocean cascade (lagoon-only): the host's typography/palette + the --x-* token contract, so
// light islands inherit the ocean look offline exactly as they would embedded. Stand-in for the real
// ocean stylesheet; refine from the live app. Injected early so island styles still win.
import './ocean.css';

// Build/dev default for the transport, injected by vite.config from the MOTU_TRANSPORT env var.
// Empty string means "unset" → mock. Agents run without the var and get backend-free data.
declare const __MOTU_TRANSPORT__: string;
// Present in the lagoon by default (the sandbox); MOTU_DEBUG=0 strips it.
declare const __MOTU_DEBUG__: boolean;
// Project-wide default isolation, injected from motu.config.json by vite (see setDefaultIsolation).
declare const __MOTU_ISOLATION__: 'shadow' | 'light';

// Set BEFORE defineMotuApp so the lagoon previews the project's real isolation posture.
setDefaultIsolation(__MOTU_ISOLATION__);

// Standalone composition root. It can back the SAME components with either MockTransport (autonomous
// design iteration, no WildFly/login) or HttpTransport (the real backend, using the human's session
// cookie via the dev proxy). The mode resolution + the browser toggle are generic (@motu/react); the
// wiring of each mode below is the only project-specific part.
const TRANSPORT_MODE = resolveTransportMode(
  typeof __MOTU_TRANSPORT__ === 'string' ? __MOTU_TRANSPORT__ : '',
);

function configureTransport(mode: TransportMode): void {
  if (mode === 'http') {
    // Real backend through the dev proxy, authenticated by the human's own session + XSRF cookie.
    configure(
      new HttpTransport('/api/rest/motu', {
        xsrfCookieName: 'M-XSRF-TOKEN',
        xsrfHeaderName: 'X-M-XSRF-TOKEN',
      }),
    );
    return;
  }
  // Each island owns its own mock in its fixtures.mock.ts; ALL_FIXTURES/ALL_ROLES aggregate them so
  // the standalone lagoon and the single-target verify lagoon share one source of truth (no inline dupes).
  configure(new MockTransport(ALL_FIXTURES, ALL_ROLES));
}

configureTransport(TRANSPORT_MODE);

// Give AngularJS islands (e.g. the extracted member-search) a host so they render offline.
setupLagoonAngularHost();

const host: HostBridge = {
  navigate: (path) => {
    console.log('[host] navigate', path);
    window.location.hash = path.startsWith('/') ? '#' + path : '#/' + path;
  },
  action: (name, detail) => {
    console.log('[host] action', name, detail);
  },
};

// Every archipelago the project ships, so the lagoon can switch between them (below). Only the members
// region has a search island reading `searchConfig`, so only it gets that channel + criteria seed;
// wiring it to the others would surface as orphan channels in the debug overlay.
const ARCHIPELAGOS: (MotuArchipelago & { label: string })[] = [
  {
    // No hero badge: the tide line's water surface is the "you are in the lagoon" signal now, so the
    // archipelago's own header stays exactly what the ocean will render.
    config: membersArchipelago(),
    label: 'Members',
    options: {
      host,
      seed: { criteria: {} },
      // Mirror the host's field schema into the store so the search island receives its
      // `config` prop. The lagoon host seeds a stub (no widgetBuilder) -> island uses its own config.
      channels: [angularHostScopeChannel({ key: 'hostSearchConfig', into: 'searchConfig' })],
    },
  },
  { config: adminArchipelago, label: 'Org Lookup', options: { host } },
  { config: usersArchipelago, label: 'Users', options: { host, seed: { criteria: {} } } },
];

defineMotuApp({
  elements: ELEMENT_REGISTRY,
  css,
  defaultTheme: 'motu',
  archipelagos: ARCHIPELAGOS.map(({ config, options }) => ({ config, options })),
});

// Switcher: swap the mounted <motu-archipelago> when a human picks a different one. The selection
// persists across reloads so the lagoon reopens on the archipelago you were last working on. The
// controls themselves live on the TIDE LINE (./tideline.ts) — a water surface at the top edge that
// only rises when you reach for it, so the archipelago, not the tooling, owns the first screenful.
const STORAGE_KEY = 'motu:lagoon:archipelago';
const VIEW_KEY = 'motu:lagoon:view';
const root = document.getElementById('lagoon-root')!;
const ids = ARCHIPELAGOS.map(({ config }) => config.id);
let current = localStorage.getItem(STORAGE_KEY) ?? '';
if (!ids.includes(current)) current = ids[0];
let currentView: TideView = localStorage.getItem(VIEW_KEY) === 'mountpoints' ? 'mountpoints' : 'region';

// Authored per-mountpoint frames (lagoon-only): the stand-in geometry for each slot's distinct ocean
// callsite, keyed by [data-motu-arch][data-motu-slot]. Authored files AND `motu archipelago
// record-frame` output both live in src/frames/*.css and are injected here; the bridge never ships
// them (in the ocean the real callsite provides the container).
const frameSheets = import.meta.glob('./frames/*.css', { query: '?inline', import: 'default', eager: true }) as Record<
  string,
  string
>;
const frameStyle = document.createElement('style');
frameStyle.textContent = Object.values(frameSheets).join('\n');
document.head.appendChild(frameStyle);

function mountArchipelago(id: string): void {
  current = id;
  localStorage.setItem(STORAGE_KEY, id);
  root.replaceChildren();
  const el = document.createElement('motu-archipelago');
  el.setAttribute('name', id);
  // Mountpoints view frames each slot separately (distributed placement); region renders the layout.
  if (currentView === 'mountpoints') el.setAttribute('view', 'mountpoints');
  root.appendChild(el);
  tide.setActive(current, currentView);
}

// Dev-only seam lens. In the lagoon it shows what is NOT connected (render-from-defaults made visible).
// No toolbar chip: the tide line owns the trigger (the buoy in its corner bay), so the page-wide lens
// is not summoned from inside a popup that closes behind it. Mounted BEFORE the chrome below, which
// reads its restored state to draw the buoy — the lens remembers being on across a reload.
if (__MOTU_DEBUG__) mountDebugOverlay({ chip: false });

// One chrome surface for the whole lagoon: archipelago + view + the shared toolbar chips
// (transport/fit/debug are adopted into the bar) + a Cmd/Ctrl+K palette over all of them.
const tide = mountTideLine({
  stations: ARCHIPELAGOS.map(({ config, label }) => ({ id: config.id, label })),
  transport: TRANSPORT_MODE,
  about:
    'Transport is switchable at runtime from the chip on this bar (or <code>?transport=http|mock</code>). ' +
    'MOCK renders offline sample data with no login; HTTP hits the real backend through the dev-proxy ' +
    'using your own session cookie. The default is set by the <code>MOTU_TRANSPORT</code> env var ' +
    '(unset = mock, so agents get offline data by default).',
  // The seam lens, handed to the chrome rather than imported by it: @motu/react must not depend on
  // the dev-only overlay package. __MOTU_DEBUG__ strips both the overlay and this wiring together.
  lens: __MOTU_DEBUG__
    ? { toggle: toggleDebugOverlay, isOpen: isDebugOverlayOpen, subscribe: subscribeDebugOverlay }
    : undefined,
  onStation: (id) => mountArchipelago(id),
  onView: (view) => {
    currentView = view;
    localStorage.setItem(VIEW_KEY, view);
    mountArchipelago(current);
  },
});

mountArchipelago(current);

// A generic floating switch (from @motu/react) so a human can flip transports in the browser without
// editing code. Mock needs no login; Http uses the current cookie.
mountTransportToggle(TRANSPORT_MODE);

// Soft-migration preview: flip the whole region between the native end-design and the legacy fit that
// islands wear while dropped into the still-legacy page.
mountFitToggle();

