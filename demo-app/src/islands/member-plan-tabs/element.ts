import type { ElementSpec } from '@motu/react';
import { MemberPlanTabs, type MemberPlanTabsProps } from '../../ui/member-plan-tabs/MemberPlanTabs.js';

export const memberPlanTabsElement: ElementSpec = {
  tag: 'x-member-plan-tabs',
  component: MemberPlanTabs,
  options: {
    // READS `criteria` and `overview` (for the counts); its tab change is `criteria-changed`, the same
    // event name the chips and the search already emit, so the region handles the three alike.
    contract: {
      input: ['criteria', 'overview'] as (keyof MemberPlanTabsProps & string)[],
    },
    events: { onCriteriaChanged: 'criteria-changed' },
    legacy: 'fill',
  },
};
