// Mount point for ViewerBadge: it wraps the application's OWN component rather than a copy, so the
// island cannot drift from what the app already ships.
import { islandElement } from '@motu/react';
import { ViewerBadge } from '@/components/lagoon/viewer-badge';

export const element = islandElement({
  tag: 'x-viewer-badge',
  component: ViewerBadge,
  options: {
    contract: {
      // WHAT IT IS TOLD, and the only thing it may be: a handle and a letter. The server reduces the
      // session to those two in `src/auth/viewer.ts` — the email, the provider id and the avatar URL
      // never reach a browser bundle, so they cannot be rendered by accident here.
      input: ['viewer'],
      // NOTHING OUT. Signing out is a form POST, because the consequence is a navigation and a
      // region has no key for one — the same call `github-sign-in` records from the other direction.
      output: {},
      ambient: [],
    },
  },
});
