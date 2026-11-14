// Every island's lagoon fixtures merged into one array + role set, so the standalone/lagoon roots can
// mount any island offline (MockTransport) without knowing which folder backs which tag. Adding an
// island with a `fixtures.mock.ts` = adding its two imports here.

import type { Fixture, RegionScenario, Scenario } from '@motu/runtime/mock';
import {
  fixtures as memberResults,
  roles as memberResultsRoles,
  scenarios as memberResultsScenarios,
} from './islands/member-results/fixtures.mock.js';
import { scenarios as memberCardScenarios } from './islands/member-card/fixtures.mock.js';
import { scenarios as memberFormScenarios } from './islands/member-form/fixtures.mock.js';
import { scenarios as usersFlows } from './archipelagos/users/users.evidence.js';
import { scenarios as profileHeroScenarios } from './islands/profile-hero/fixtures.mock.js';
import { scenarios as profileFlows } from './archipelagos/profile/profile.evidence.js';
import { scenarios as appNavScenarios } from './islands/app-nav/fixtures.mock.js';
import { scenarios as memberChipsScenarios } from './islands/member-filter-chips/fixtures.mock.js';
import { scenarios as memberQuickSearchScenarios } from './islands/member-quick-search/fixtures.mock.js';
import { scenarios as memberHeaderScenarios } from './islands/member-header/fixtures.mock.js';
import { scenarios as memberHighlightsScenarios } from './islands/member-highlights/fixtures.mock.js';
import { scenarios as weeklyQuestScenarios } from './islands/weekly-quest/fixtures.mock.js';
import { scenarios as memberPlanTabsScenarios } from './islands/member-plan-tabs/fixtures.mock.js';
import { scenarios as highScoresScenarios } from './islands/high-scores/fixtures.mock.js';
import { scenarios as chapterCupScenarios } from './islands/chapter-cup/fixtures.mock.js';
import { scenarios as freshUnlocksScenarios } from './islands/fresh-unlocks/fixtures.mock.js';
import { scenarios as shellFlows } from './archipelagos/shell/shell.evidence.js';
import { scenarios as membersFlows } from './archipelagos/members/members.evidence.js';
import { scenarios as eventsHeaderScenarios } from './islands/events-header/fixtures.mock.js';
import { scenarios as eventFiltersScenarios } from './islands/event-filters/fixtures.mock.js';
import { scenarios as eventListScenarios } from './islands/event-list/fixtures.mock.js';
import { scenarios as eventDetailScenarios } from './islands/event-detail/fixtures.mock.js';
import { scenarios as myStandingScenarios } from './islands/my-standing/fixtures.mock.js';
import { scenarios as myEventsScenarios } from './islands/my-events/fixtures.mock.js';
import { scenarios as myChapterScenarios } from './islands/my-chapter/fixtures.mock.js';
import { scenarios as eventsFlows } from './archipelagos/events/events.evidence.js';
import { scenarios as homeFlows } from './archipelagos/home/home.evidence.js';
import { scenarios as bookingSummaryScenarios } from './islands/booking-summary/fixtures.mock.js';

export const ALL_FIXTURES: Fixture[] = [...memberResults];

export const ALL_ROLES: string[] = [
  ...new Set([...memberResultsRoles]),
];

/**
 * THE STATES THIS PROJECT HAS WRITTEN DOWN, keyed by element tag — what `?scenario=` addresses.
 *
 * This barrel is hand-written (the scaffolded one globs `*.evidence.ts`, a layout this app predates),
 * and it exported only fixtures and roles. So `member-results`' four scenarios existed for the
 * node-side checks and nowhere a browser could reach: `motu lagoon states` printed their URLs, and
 * opening one on the published lagoon refused with "declares none" — the catalogue was empty because
 * nothing ever handed it over. motu's own demo is the one consumer that must not drift from what the
 * framework claims, so it is listed here explicitly, the same way its fixtures are.
 */
export const ALL_SCENARIOS: Record<string, Scenario[]> = {
  'x-member-results': memberResultsScenarios,
  'x-member-card': memberCardScenarios,
  'x-member-form': memberFormScenarios,
  'x-profile-hero': profileHeroScenarios,
  'x-app-nav': appNavScenarios,
  'x-member-filter-chips': memberChipsScenarios,
  'x-member-header': memberHeaderScenarios,
  'x-member-quick-search': memberQuickSearchScenarios,
  'x-member-highlights': memberHighlightsScenarios,
  'x-weekly-quest': weeklyQuestScenarios,
  'x-member-plan-tabs': memberPlanTabsScenarios,
  'x-high-scores': highScoresScenarios,
  'x-chapter-cup': chapterCupScenarios,
  'x-fresh-unlocks': freshUnlocksScenarios,
  'x-events-header': eventsHeaderScenarios,
  'x-event-filters': eventFiltersScenarios,
  'x-event-list': eventListScenarios,
  'x-event-detail': eventDetailScenarios,
  'x-my-standing': myStandingScenarios,
  'x-my-events': myEventsScenarios,
  'x-my-chapter': myChapterScenarios,
  'x-booking-summary': bookingSummaryScenarios,
};

/**
 * THE REGION FLOWS, keyed by archipelago id — what `?region=<id>&flow=<name>` addresses.
 *
 * This was `{}` with a comment saying no region declared any, and it stayed `{}` after one did. Same
 * drift the scenario map above already suffered: a hand-written catalogue is only as current as the
 * last person who remembered it, and nothing fails when it is forgotten — the address just refuses,
 * which reads as "the flow is broken" rather than "the list is stale".
 */
export const ALL_FLOWS: Record<string, RegionScenario[]> = {
  // THE MEMBERS REGION WAS MISSING HERE from the day its flows were written — the drift the comment
  // above describes, a second time: `lagoon states` printed eight members addresses and every one of
  // them refused in the gallery.
  members: membersFlows,
  users: usersFlows,
  profile: profileFlows,
  shell: shellFlows,
  events: eventsFlows,
  home: homeFlows,
};
