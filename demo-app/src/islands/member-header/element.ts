import type { ElementSpec } from '@motu/react';
import { MemberHeader, type MemberHeaderProps } from '../../ui/member-header/MemberHeader.js';

export const memberHeaderElement: ElementSpec = {
  tag: 'x-member-header',
  component: MemberHeader,
  options: {
    contract: { input: ['heading', 'subtitle', 'badge'] as (keyof MemberHeaderProps & string)[] },
    legacy: 'fill',
  },
};
