import type { ElementSpec } from '@motu/react';
import { AppNav, type AppNavProps } from '../../ui/app-nav/AppNav.js';

export const appNavElement: ElementSpec = {
  tag: 'x-app-nav',
  component: AppNav,
  options: {
    // READS `section` AND `dataSource`, OWNS NEITHER. Both are the app's own facts — the URL it is on
    // and the backend it was built against — fed by the shell. Its only output is a navigation intent.
    contract: {
      input: ['section', 'dataSource'] as (keyof AppNavProps & string)[],
    },
    // THE DECISION IN THIS FILE: `onNavigate` is `app-navigate` in the region's vocabulary. Derived
    // from the callback it would be `navigate`, which reads as the host's own verb — and every other
    // island's back or open control is also a navigation, so the shell's says whose it is.
    events: { onNavigate: 'app-navigate' },
    legacy: 'fill',
  },
};
