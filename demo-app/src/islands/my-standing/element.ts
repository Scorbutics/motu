import { islandElement } from '@motujs/react';
import { MyStanding } from '../../ui/my-standing/MyStanding.js';

export const element = islandElement({
  tag: 'x-my-standing',
  component: MyStanding,
  options: {
    // READS who you are, the day, the club and your RSVPs; OWNS NOTHING.
    contract: {
      input: ['me', 'asOf', 'overview', 'myRsvps'],
    },
    legacy: 'fill',
  },
});
