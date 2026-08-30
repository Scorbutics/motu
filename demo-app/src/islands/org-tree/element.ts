import type { ElementSpec } from '@motu/react';
import { OrgTree, type OrgTreeProps } from '../../ui/org-tree/OrgTree.js';

export const orgTreeElement: ElementSpec = {
  tag: 'x-org-tree',
  component: OrgTree,
  options: {
    contract: {
      input: [{ name: 'chart', default: [] }, 'departmentId'] as (keyof OrgTreeProps & string)[] | never,
      output: { onDepartmentSelected: 'department-selected' },
    },
    legacy: 'fill',
  },
};
