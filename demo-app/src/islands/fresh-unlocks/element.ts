import type { ElementSpec } from '@motu/react';
import { FreshUnlocks, type FreshUnlocksProps } from '../../ui/fresh-unlocks/FreshUnlocks.js';

export const freshUnlocksElement: ElementSpec = {
  tag: 'x-fresh-unlocks',
  component: FreshUnlocks,
  options: {
    // READS `overview`; a picked name is `member-open`, like the table's and the podium's.
    contract: {
      input: ['overview'] as (keyof FreshUnlocksProps & string)[],
    },
    events: { onOpen: 'member-open' },
    legacy: 'fill',
  },
};
