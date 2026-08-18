import type { ElementSpec } from '@motu/react';
import { CompanyLookup, type CompanyLookupProps } from '../../ui/company-lookup/CompanyLookup.js';

export const companyLookupElement: ElementSpec = {
  tag: 'x-company-lookup',
  component: CompanyLookup,
  options: {
    contract: {
      input: ['prefix'] as (keyof CompanyLookupProps & string)[],
      output: { onCompanySelected: 'company-selected' },
    },
    attributes: { prefix: 'string' },
    legacy: 'fill',
  },
};
