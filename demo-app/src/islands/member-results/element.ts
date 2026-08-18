import type { ElementSpec } from '@motu/react';
import { MemberResults, type MemberResultsProps } from '../../ui/member-results/MemberResults.js';

export const memberResultsElement: ElementSpec = {
  tag: 'x-member-results',
  component: MemberResults,
  options: {
    contract: {
      input: [{ name: 'criteria', default: {} }, 'members'],
      output: { onCount: 'member-count', onPage: 'member-page', onSelected: 'member-selected', onOpen: 'member-open' },
    },
    legacy: 'fill',
    isolation: 'light',
  },
};
