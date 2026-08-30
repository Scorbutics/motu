import type { ElementSpec } from '@motu/react';
import { OrgPerson } from '../../ui/org-person/OrgPerson.js';

export const orgPersonElement: ElementSpec = {
  tag: 'x-org-person',
  component: OrgPerson,
  options: {
    // TWO INPUTS, NO OUTPUT: the card is the region's reader, and the pair is the point — it is wrong
    // if `selectedPerson` and `selectedDepartment` ever disagree.
    contract: { input: ['person', 'department'] },
    legacy: 'fill',
  },
};
