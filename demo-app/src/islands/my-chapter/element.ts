import { islandElement } from '@motu/react';
import { MyChapter } from '../../ui/my-chapter/MyChapter.js';

export const element = islandElement({
  tag: 'x-my-chapter',
  component: MyChapter,
  options: {
    // READS who you are, the chapters, the calendar and the Cup; OWNS NOTHING.
    contract: {
      input: ['me', 'chapters', 'events', 'overview'],
      output: { onOpenChapter: 'chapter-open' },
    },
    legacy: 'fill',
  },
});
