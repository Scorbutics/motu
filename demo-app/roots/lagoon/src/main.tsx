import { configure, HttpTransport } from '@motu/runtime';
import { MockTransport } from '@motu/runtime/mock';
import { setDefaultIsolation, type HostBridge } from '@motu/core';
import { defineMotuApp, resolveTransportMode, mountTransportToggle, mountFitToggle, type TransportMode, type MotuArchipelago } from '@motu/react';
import { angularHostScopeChannel } from '@motu/adapter-angularjs';
import { mountDebugOverlay } from '@motu/debug-overlay';
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
    config: membersArchipelago({ badge: 'motu archipelago · standalone preview' }),
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
// persists across reloads so the lagoon reopens on the archipelago you were last working on.
const STORAGE_KEY = 'motu:lagoon:archipelago';
const VIEW_KEY = 'motu:lagoon:view';
const nav = document.getElementById('lagoon-switcher')!;
const root = document.getElementById('lagoon-root')!;
const ids = ARCHIPELAGOS.map(({ config }) => config.id);
let current = localStorage.getItem(STORAGE_KEY) ?? '';
if (!ids.includes(current)) current = ids[0];
let currentView: 'region' | 'mountpoints' = localStorage.getItem(VIEW_KEY) === 'mountpoints' ? 'mountpoints' : 'region';

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
  for (const btn of nav.querySelectorAll('button[data-id]')) {
    btn.setAttribute('aria-current', String((btn as HTMLElement).dataset.id === id));
  }
  for (const btn of nav.querySelectorAll('button[data-view]')) {
    btn.setAttribute('aria-current', String((btn as HTMLElement).dataset.view === currentView));
  }
}

const label = document.createElement('span');
label.className = 'label';
label.textContent = 'Archipelago';
nav.appendChild(label);
for (const { config, label: text } of ARCHIPELAGOS) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.dataset.id = config.id;
  btn.textContent = text;
  btn.addEventListener('click', () => mountArchipelago(config.id));
  nav.appendChild(btn);
}

// View toggle: same store-sharing archipelago, two spatial presentations — the consolidated region,
// or each mountpoint framed on its own (distributed placement across separate ocean callsites).
const viewLabel = document.createElement('span');
viewLabel.className = 'label';
viewLabel.textContent = 'View';
nav.appendChild(viewLabel);
for (const v of ['region', 'mountpoints'] as const) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.dataset.view = v;
  btn.textContent = v === 'region' ? 'Region' : 'Mountpoints';
  btn.addEventListener('click', () => {
    currentView = v;
    localStorage.setItem(VIEW_KEY, v);
    mountArchipelago(current);
  });
  nav.appendChild(btn);
}

mountArchipelago(current);

// A generic floating switch (from @motu/react) so a human can flip transports in the browser without
// editing code. Mock needs no login; Http uses the current cookie.
mountTransportToggle(TRANSPORT_MODE);

// Soft-migration preview: flip the whole region between the native end-design and the legacy fit that
// islands wear while dropped into the still-legacy page.
mountFitToggle();

// Dev-only seam lens. In the lagoon it shows what is NOT connected (render-from-defaults made visible).
if (__MOTU_DEBUG__) mountDebugOverlay();
