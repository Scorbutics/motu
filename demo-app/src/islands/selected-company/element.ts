import type { ElementSpec } from '@motu/react';
import { SelectedCompany, type SelectedCompanyProps } from '../../ui/selected-company/SelectedCompany.js';

export const selectedCompanyElement: ElementSpec = {
  tag: 'x-selected-company',
  component: SelectedCompany,
  options: {
    contract: { input: ['company'] as (keyof SelectedCompanyProps & string)[] },
    legacy: 'fill',
  },
};
