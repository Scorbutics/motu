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
//
// Neither is produced by an island. The bar's one output, `app-navigate`, is an EFFECT: the region
// turns a section into a URL and hands it to the host. A handler that wrote a key instead would be
// ownership expressed in a callback body — undrawable before it fires.
import type { ArchipelagoConfig } from '@motu/core';
import { SHELL_LAYOUT } from './shell.layout.js';

/** Where each section lives. The bar names sections; only the region knows they are URLs. */
const SECTION_PATHS: Record<string, string> = { directory: '/', add: '/add' };

export const shellArchipelago: ArchipelagoConfig = {
  id: 'shell',
  layout: SHELL_LAYOUT,
  islands: [
    {
      slot: 'app-nav',
      element: 'x-app-nav',
      bind: ['section', 'dataSource'],
      on: {
        'app-navigate': (section, { host }) => host.navigate(SECTION_PATHS[String(section)] ?? '/'),
      },
    },
  ],
};
