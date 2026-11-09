// The app shell: what every page shares, in a region of its own at the app root.
//
// ONE ISLAND, NO ISLAND-TO-ISLAND KEY — and that is the honest shape, not a thin one. The bar is not
// coupled to anything; it is a region because it outlives every page. Each page's region mounts and
// unmounts with its route, so a bar placed inside one would remount on every click, and a bar placed
// in all of them would be three declarations of one thing. Here it is declared once, and the page
// regions render inside this one's provider without reading it.
//
// THE STATE MODEL:
//
//   section      HOST-FED. The app derives it from the URL — a profile is part of the directory —
//                so the shell, not the bar, decides what "where am I" means.
//   dataSource   HOST-FED. Which backend this build talks to, from the app's own `IN_BROWSER_DATA`.
//   me           HOST-FED. Who the app is acting as — the app's SESSION (`lib/session.ts`). The bar
//                shows it and offers to change it, and changing it is an intent, never a write: who
//                is signed in is not something a sidebar owns, any more than it owns the URL.
//
// Neither is produced by an island. The bar's one output, `app-navigate`, is an EFFECT: the region
// turns a section into a URL and hands it to the host. A handler that wrote a key instead would be
// ownership expressed in a callback body — undrawable before it fires.
import type { ArchipelagoConfig } from '@motu/core';
import { SHELL_LAYOUT } from './shell.layout.js';

/** Where each section lives. The bar names sections; only the region knows they are URLs. */
const SECTION_PATHS: Record<string, string> = { home: '/me', directory: '/', chapters: '/chapters', events: '/events', add: '/add' };

export const shellArchipelago: ArchipelagoConfig = {
  id: 'shell',
  layout: SHELL_LAYOUT,
  islands: [
    {
      slot: 'app-nav',
      element: 'x-app-nav',
      bind: ['section', 'dataSource', 'me'],
      on: {
        'app-navigate': (section, { host }) => host.navigate(SECTION_PATHS[String(section)] ?? '/'),
        // THE SESSION IS THE APP'S. The bar asks to act as someone else; the host changes its session
        // and feeds the answer back as `me`. In the lagoon the host only logs it — the bar's states
        // are reached by seeding `me`, which is what a session change looks like from inside.
        'member-switch': (memberId, { host }) => host.action('switch-member', memberId ?? null),
      },
    },
  ],
};
