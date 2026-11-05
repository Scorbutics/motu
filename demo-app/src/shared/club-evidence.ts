// The club's game state the lagoon's evidence speaks, in ONE module the islands' scenarios and the
// region's flows both import (relative specifiers only — plain node reads these files).
//
// NOTHING HERE IS WRITTEN BY HAND. Each state is the app's own rules (`clubOverview`) run over the
// app's own rows (the seed) on a pinned day. The day is fixed rather than "today" for the same reason
// the profile's calendars are: evidence stands still, so a baseline and an assertion mean the same
// thing next month.
import { clubOverview, type ClubOverview } from './gamification.js';
import { SEED_MEMBERS } from './seed-members.generated.js';

/** The day the members page's evidence is pinned to — the same Monday as the profile's calendars. */
export const EVIDENCE_DAY = '2026-09-07';

/** The club on that day: 240 members, level 7. */
export const CLUB: ClubOverview = clubOverview(SEED_MEMBERS, EVIDENCE_DAY);

/** The club as it stood at the end of its first year — the same rows, a different day. */
export const FIRST_YEAR: ClubOverview = clubOverview(SEED_MEMBERS, '2019-12-31');

/** A different week of the same club, so the quest and the feed have something to differ by. */
export const NEXT_WEEK: ClubOverview = clubOverview(SEED_MEMBERS, '2026-09-14');
