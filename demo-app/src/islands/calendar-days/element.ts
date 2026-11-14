import { islandElement } from '@motujs/react';
import { CalendarDays } from '../../ui/calendar-days/CalendarDays.js';

export const element = islandElement({
  tag: 'x-calendar-days',
  component: CalendarDays,
  options: {
    // READS the calendar and the current choice; OWNS the choice (`day-selected` → `selectedDay`,
    // declared in the archipelago).
    contract: {
      input: ['calendar', 'selectedDay', 'loading'],
      output: { onDaySelected: 'day-selected' },
    },
    legacy: 'fill',
  },
});
