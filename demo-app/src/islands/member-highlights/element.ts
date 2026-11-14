import type { ElementSpec } from '@motujs/react';
import { MemberHighlights, type MemberHighlightsProps } from '../../ui/member-highlights/MemberHighlights.js';

export const memberHighlightsElement: ElementSpec = {
  tag: 'x-member-highlights',
  component: MemberHighlights,
  options: {
    // READS `overview`, OWNS NOTHING: four numbers about the club, each the club's own.
    contract: {
      input: ['overview'] as (keyof MemberHighlightsProps & string)[],
    },
    legacy: 'fill',
  },
};
