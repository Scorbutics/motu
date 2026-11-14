import type { ElementSpec } from '@motujs/react';
import { AppNav, type AppNavProps } from '../../ui/app-nav/AppNav.js';

export const appNavElement: ElementSpec = {
  tag: 'x-app-nav',
  component: AppNav,
  options: {
    // READS `section`, `dataSource` AND `me`, OWNS NONE. All three are the app's own facts — the URL
    // it is on, the backend it was built against, who it is acting as — fed by the shell. Its outputs
    // are two intents: go somewhere, and be someone else.
    contract: {
      input: ['section', 'dataSource', 'me'] as (keyof AppNavProps & string)[],
    },
    // THE DECISION IN THIS FILE: `onNavigate` is `app-navigate` in the region's vocabulary. Derived
    // from the callback it would be `navigate`, which reads as the host's own verb — and every other
    // island's back or open control is also a navigation, so the shell's says whose it is.
    events: { onNavigate: 'app-navigate', onSwitchMember: 'member-switch' },
    legacy: 'fill',
  },
};
