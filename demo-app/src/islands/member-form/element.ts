import type { ElementSpec } from '@motu/react';
import { MemberForm, type MemberFormProps } from '../../ui/member-form/MemberForm.js';

export const memberFormElement: ElementSpec = {
  tag: 'x-member-form',
  component: MemberForm,
  options: {
    contract: { input: ['draft', 'organisations'] as (keyof MemberFormProps & string)[] },
    // THE RENAME IS THE DECISION, and `events` is where a decision goes. `contract.output` is READ
    // FROM THE COMPONENT by `motu island sync` — it derives `onDraftChanged` -> `draft-changed` — so
    // writing a different name there is overwritten on the next sync, silently, and the archipelago
    // then declares a write on an event nothing dispatches. Which is exactly what happened: the card
    // stayed empty and every flow failed on an assertion about the OTHER island, saying nothing about
    // the cause.
    events: { onDraftChanged: 'member-draft', onReset: 'member-reset' },
    legacy: 'fill',
  },
};
