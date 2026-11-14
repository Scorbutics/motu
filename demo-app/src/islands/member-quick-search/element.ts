import type { ElementSpec } from '@motujs/react';
import { MemberQuickSearch, type MemberQuickSearchProps } from '../../ui/member-quick-search/MemberQuickSearch.js';

export const memberQuickSearchElement: ElementSpec = {
  tag: 'x-member-quick-search',
  component: MemberQuickSearch,
  options: {
    // READS `criteria` and emits `criteria-changed` with its `q` set — the same event the plan tabs
    // emit, so the region handles a search and a plan pick alike.
    contract: {
      input: ['criteria'] as (keyof MemberQuickSearchProps & string)[],
    },
    events: { onCriteriaChanged: 'criteria-changed' },
    legacy: 'fill',
  },
};
