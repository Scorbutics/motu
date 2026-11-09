// My club's region, as a type. Everything the events source touches, plus who you are in the club.
import type { Chapter } from '../../shared/chapter-types.js';
import type { EventsSourceRegion } from '../../shared/events-source.js';
import type { ClubOverview } from '../../shared/gamification.js';

export interface HomeRegion extends EventsSourceRegion {
  /** The day levels and streaks are computed for. HOST-FED. */
  asOf: string | null;
  /** The club's game state. HOST-FED, from the app's `clubSource` — the same one the directory uses. */
  overview: ClubOverview | null;
  /** The chapters, as the club describes them. HOST-FED. */
  chapters: Chapter[];
}

/** No island on this page writes a key: everything here is the session's, the club's or the source's. */
export type ProducedHomeKeys = never;
