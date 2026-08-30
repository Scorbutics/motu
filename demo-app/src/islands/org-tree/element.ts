import type { ElementSpec } from '@motu/react';
import { OrgTree } from '../../ui/org-tree/OrgTree.js';

export const orgTreeElement: ElementSpec = {
  tag: 'x-org-tree',
  component: OrgTree,
  options: {
    contract: {
      input: [{ name: 'chart', default: [] }, 'department', 'companyLabel'],
      output: { onDepartmentSelected: 'department-selected' },
    },
    legacy: 'fill',
  },
};
