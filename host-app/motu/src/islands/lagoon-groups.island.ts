// Mount point for LagoonGroups: it wraps the application's OWN component rather than a copy, so the
// island cannot drift from what the app already ships. The component stays where it is and keeps
// being used directly elsewhere; this file only declares how it is mounted as an island.
import { islandElement } from '@motu/react';
import { LagoonGroups } from '@/components/lagoon/lagoon-groups';

export const element = islandElement({
  tag: 'x-lagoon-groups',
  component: LagoonGroups,
  options: {
    // The island's boundary in one place — input (props), output (events), ambient (host reach).
    contract: {
      input: [
        'groups',
      ],
    },
  },
});
