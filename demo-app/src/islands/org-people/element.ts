import type { ElementSpec } from '@motu/react';
import { OrgPeople } from '../../ui/org-people/OrgPeople.js';

export const orgPeopleElement: ElementSpec = {
  tag: 'x-org-people',
  component: OrgPeople,
  options: {
    contract: {
      input: ['department', 'personId'],
      output: { onPersonSelected: 'person-selected' },
    },
    legacy: 'fill',
  },
};
