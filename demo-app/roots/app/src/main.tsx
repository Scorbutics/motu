// The composition root: where the app decides what answers its islands.
//
// THIS IS THE ONLY FILE THAT KNOWS ABOUT POSTGRES. The page composes a region; the region's results
// island calls `MemberService.search` through the contract; and the line below is where that call
// gets a Supabase client instead of a fixture. Swap it and nothing else in the app changes — which
// is the same swap the lagoon makes, from the other side.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { configure } from '@motu/runtime';
import { registerElements } from '@motu/react';
import { ELEMENT_REGISTRY } from 'demo-app';
import { setupAngularHost } from './lib/angular-host.js';
import { membersClient, supabaseCompaniesPort, supabaseMembersPort } from './lib/supabase-port.js';
import { membersTransport } from './lib/members-transport.js';
import { App } from './App.js';
import 'demo-app/styles.css';
import './app.css';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
if (!url || !anonKey) {
  // A blank page with a console warning is how a demo dies on camera. Say what is missing and where
  // the answer comes from.
  throw new Error(
    'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required.\n' +
      'Run `pnpm db:start` in this directory and copy the printed values into roots/app/.env.local ' +
      '(there is a .env.example beside it).',
  );
}

const client = membersClient(url, anonKey);
configure(membersTransport({ members: supabaseMembersPort(client), companies: supabaseCompaniesPort(client) }));

// One island in this region is AngularJS. It needs a host to render into, exactly as it does in the
// lagoon — a mixed-framework region is a supported shape, not a special case.
//
// ORDER MATTERS, and only in one direction: the host must exist BEFORE the element is defined,
// because an AngularJS element bootstraps against it the moment it upgrades.
setupAngularHost();

// DEFINE THE CUSTOM ELEMENTS. `createRegion` renders React islands as components and never needs
// them, so nothing else in this app would call this — and the one island that is NOT React would
// then be placed as a tag the browser has never heard of, which renders as silence.
// `defaultTheme` is not cosmetic: without it every element registers as `legacy`, which is the skin
// for the old host this project was extracted from. The app is the NEW design, so it says so — and
// the lagoon says the same thing in its layout (`theme="motu"`), which is what keeps the preview and
// the page showing one skin rather than two.
registerElements(ELEMENT_REGISTRY, { defaultTheme: 'motu' });



createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
