import type { ElementSpec } from '@motu/react';
import { WeeklyQuest, type WeeklyQuestProps } from '../../ui/weekly-quest/WeeklyQuest.js';

export const weeklyQuestElement: ElementSpec = {
  tag: 'x-weekly-quest',
  component: WeeklyQuest,
  options: {
    // READS `overview` for its quest, OWNS NOTHING: the meter moves when the club does.
    contract: {
      input: ['overview'] as (keyof WeeklyQuestProps & string)[],
    },
    legacy: 'fill',
  },
};
