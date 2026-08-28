// Mount point for LagoonRepos: it wraps the application's OWN component rather than a copy, so the
// island cannot drift from what the app already ships. The component stays where it is and keeps
// being used directly elsewhere; this file only declares how it is mounted as an island.
import { islandElement } from '@motu/react';
import { LagoonRepos } from '@/components/lagoon/lagoon-repos';

export const element = islandElement({
  tag: 'x-lagoon-repos',
  component: LagoonRepos,
  options: {
    // The island's boundary in one place — input (props), output (events), ambient (host reach).
    contract: {
      input: [
        'repos',
        'cap',
        // WHAT THE FILTER DECIDED. Read, never written: this island narrows itself and emits nothing.
        'query',
      ],
    },
  },
});
