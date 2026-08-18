import type { ElementSpec } from '@motu/react';
import { MemberFilterChips, type MemberFilterChipsProps } from '../../ui/member-filter-chips/MemberFilterChips.js';

export const memberFilterChipsElement: ElementSpec = {
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
