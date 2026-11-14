import { islandElement } from '@motu/react';
import { BookingSummary } from '../../ui/booking-summary/BookingSummary.js';

export const element = islandElement({
  tag: 'x-booking-summary',
  component: BookingSummary,
  options: {
    // READS who, which day and which time; OWNS NOTHING. `member` is host-fed, `selectedDay` and
    // `selectedSlot` belong to the calendar islands — this one only says the choice back.
    contract: {
      input: ['member', 'selectedDay', 'selectedSlot'],
    },
    legacy: 'fill',
  },
});
