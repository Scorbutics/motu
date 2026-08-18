import type { ElementSpec } from '@motu/react';
import { UserSearch, type UserSearchProps } from '../../ui/user-search/UserSearch.js';

export const userSearchElement: ElementSpec = {
  tag: 'x-user-search',
  component: UserSearch,
  options: {
    contract: {
      input: ['criteria', 'companies'] as (keyof UserSearchProps & string)[],
      output: { onCriteriaChanged: 'criteria-changed', onReset: 'reset' },
    },
    legacy: 'fill',
  },
};
