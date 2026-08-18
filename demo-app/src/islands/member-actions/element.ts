import type { ElementSpec } from '@motu/react';
import { MemberActions, type MemberActionsProps } from '../../ui/member-actions/MemberActions.js';

export const memberActionsElement: ElementSpec = {
  tag: 'x-member-actions',
  component: MemberActions,
  // Reshapes: an inline toolbar natively, a titled rail panel in legacy fit.
  options: {
    contract: {
      input: [] as (keyof MemberActionsProps & string)[],
      output: { onNew: 'member-new', onImport: 'member-import', onPaste: 'member-paste', onExport: 'member-export' },
    },
    legacy: 'inline',
  },
};
