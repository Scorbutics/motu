import type { ElementSpec } from '@motu/react';
import { ChapterCup, type ChapterCupProps } from '../../ui/chapter-cup/ChapterCup.js';

export const chapterCupElement: ElementSpec = {
  tag: 'x-chapter-cup',
  component: ChapterCup,
  options: {
    // READS `overview` for the cup, OWNS NOTHING.
    contract: {
      input: ['overview'] as (keyof ChapterCupProps & string)[],
    },
    legacy: 'fill',
  },
};
