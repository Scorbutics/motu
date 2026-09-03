import type { ElementSpec } from '@motu/react';
import { MemberCard, type MemberCardProps } from '../../ui/member-card/MemberCard.js';

export const memberCardElement: ElementSpec = {
  tag: 'x-member-card',
  component: MemberCard,
  options: {
    // READS ONLY. It has no output at all, which is the point of it: everything on screen is a
    // function of one region key, so there is no second source of truth to drift.
    contract: { input: ['draft'] as (keyof MemberCardProps & string)[] },
    legacy: 'fill',
  },
};
