// The events page's region, as a type: every key, and which of them an island produces.
//
// Lives beside the archipelago and imports only types, so the page, the lagoon and the archipelago
// all name the same shape — and a renamed key is a build error in all three at once.
import type { EventFilter } from '../../shared/event-types.js';
import type { EventsSourceRegion } from '../../shared/events-source.js';

export interface EventsRegion extends EventsSourceRegion {
  /** Which events the list shows. PRODUCED by `event-filters`. */
  filter: EventFilter;
}

/** The keys an island writes. The page may `seed` them and may never `provide` them. */
export type ProducedEventsKeys = 'filter' | 'selectedEventId';
