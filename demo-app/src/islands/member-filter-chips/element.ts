import type { ElementSpec } from '@motujs/react';
import { MemberFilterChips, type MemberFilterChipsProps } from '../../ui/member-filter-chips/MemberFilterChips.js';

export const memberFilterChipsElement: ElementSpec = {
  // STANDALONE since the members redesign: the page shows one search box and three plan tabs instead
  // of chips, so no region places this island today. It still renders any `criteria` it is handed.
  standalone: true,
  tag: 'x-member-filter-chips',
  component: MemberFilterChips,
  options: {
    contract: {
      input: ['criteria'] as (keyof MemberFilterChipsProps & string)[],
      output: { onCriteriaChanged: 'criteria-changed' },
    },
    legacy: 'inline',
  },
};
