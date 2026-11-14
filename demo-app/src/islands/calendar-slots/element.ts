import type { ElementSpec } from '@motu/react';
import { CalendarSlots, type CalendarSlotsProps } from '../../ui/calendar-slots/CalendarSlots.js';

export const calendarSlotsElement: ElementSpec = {
  tag: 'x-calendar-slots',
  component: CalendarSlots,
  options: {
    // READS `calendar` and `selectedDay`, OWNS `selectedSlot` (declared as `writes` in the
    // archipelago). It never writes the day: `calendar-days` is that key's one producer.
    contract: {
      input: ['calendar', 'selectedDay', 'selectedSlot'] as (keyof CalendarSlotsProps & string)[],
    },
    // The region's name for the pick — what the archipelago's `writes` keys on.
    events: { onSlotSelected: 'slot-selected' },
    legacy: 'fill',
  },
};
