import type { ElementSpec } from '@motu/react';
import { HighScores, type HighScoresProps } from '../../ui/high-scores/HighScores.js';

export const highScoresElement: ElementSpec = {
  tag: 'x-high-scores',
  component: HighScores,
  options: {
    // READS `overview`; a picked podium place is `member-open`, the event the table already speaks, so
    // the region opens a profile the same way whichever island asked.
    contract: {
      input: ['overview'] as (keyof HighScoresProps & string)[],
    },
    events: { onOpen: 'member-open' },
    legacy: 'fill',
  },
};
