import type { ElementSpec } from '@motu/react';
import { OrgHeadcount } from '../../ui/org-headcount/OrgHeadcount.js';

export const orgHeadcountElement: ElementSpec = {
  tag: 'x-org-headcount',
  component: OrgHeadcount,
  options: {
    contract: { input: [{ name: 'chart', default: [] }, 'department', 'companyLabel'] },
    legacy: 'fill',
  },
};
