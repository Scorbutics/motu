// Mount point for LagoonGroups: it wraps the application's OWN component rather than a copy, so the
// island cannot drift from what the app already ships. The component stays where it is and keeps
// being used directly elsewhere; this file only declares how it is mounted as an island.
import { islandElement } from '@motu/react';
import { LagoonGroups } from '@/components/lagoon/lagoon-groups';

// RENDERS NOTHING FROM ITS DEFAULTS, ON PURPOSE — `lagoon-render` warns about this and the warning is
// accepted rather than unnoticed. With no galleries the component returns null instead of an empty
// "Composed" heading, matching `views.mjs`, which emits '' for the same case. A heading over nothing
// tells a visitor this host has a feature it is not using, which is noise on the one page that should
// be a list of what exists. The `no galleries, so no card` scenario is that state, addressable.
export const element = islandElement({
  tag: 'x-lagoon-groups',
  component: LagoonGroups,
  options: {
    // The island's boundary in one place — input (props), output (events), ambient (host reach).
    contract: {
      input: [
        'groups',
        // WHAT THE FILTER DECIDED. Read, never written: this island narrows itself and emits nothing.
        'query',
        'show',
      ],
    },
  },
});
