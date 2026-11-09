// Public surface of the demo project: the element registry, the archipelago configs + resolver,
// and the aggregated lagoon fixtures. Composition roots import everything they need from here.

export { ELEMENT_REGISTRY } from './islands/registry.js';

export { membersArchipelago } from './archipelagos/members/members.archipelago.js';
export type { MembersArchipelagoOptions } from './archipelagos/members/members.archipelago.js';
export { usersArchipelago } from './archipelagos/users/users.archipelago.js';
export { profileArchipelago } from './archipelagos/profile/profile.archipelago.js';
export { shellArchipelago } from './archipelagos/shell/shell.archipelago.js';
export { eventsArchipelago } from './archipelagos/events/events.archipelago.js';
export { homeArchipelago } from './archipelagos/home/home.archipelago.js';
export type { EventsRegion } from './archipelagos/events/events.region.js';
export type { HomeRegion } from './archipelagos/home/home.region.js';
export type { AppSection, DataSource } from './ui/app-nav/AppNav.js';
export { ARCHIPELAGOS, getArchipelago } from './archipelagos/registry.js';

export { ALL_FIXTURES, ALL_ROLES, ALL_SCENARIOS, ALL_FLOWS } from './fixtures.js';

export type { MemberRow, MemberCriteria, MemberPage } from './shared/member-types.js';
export { draftFromMember, ddmmyyyy, initialsOf, completenessOf, MEMBER_TIERS } from './shared/member-draft.js';
export type { MemberDraft, MemberTier } from './shared/member-draft.js';

// The application's own data code, exported because BOTH sides need it: the page composes a
// transport over the source, and anything previewing the region reaches the same module.
export { membersSource, PER_PAGE } from './shared/members-source.js';
export { MEMBER_SEARCH_CONFIG } from './ui/member-search-ng/search.config.js';
export type { MembersPort, MembersQueryResult, MembersSource } from './shared/members-source.js';
export { seedMembersPort, matchSeedMembers, orderMembers } from './shared/seed-members-port.js';
export { clubSource } from './shared/club-source.js';
export type { ClubSource } from './shared/club-source.js';
export { clubOverview, memberStats, rankOf, todayIso } from './shared/gamification.js';
export type { ClubOverview, MemberStats } from './shared/gamification.js';
export { DEFAULT_ORDER } from './shared/member-types.js';
export type { MemberOrder, MemberSortKey } from './shared/member-types.js';
export { SEED_MEMBERS } from './shared/seed-members.generated.js';
export { availabilitySource, calendarFrom, utcDate, HORIZON_DAYS } from './shared/availability-source.js';
export type { AvailabilityPort, AvailabilitySource, TimeslotRow } from './shared/availability-source.js';
export { SLOT_KIND_LABELS, emptyCalendar } from './shared/availability-types.js';
export type { Calendar, DayAvailability, SlotKind, Timeslot } from './shared/availability-types.js';
export type { MotuTheme, MotuFit, LegacyStrategy } from '@motu/core';

// The club's chapters and events — the second half of the app, beside the directory.
export { CHAPTERS, chapterBySlug, chapterByName, memberIdOf } from './shared/chapter-types.js';
export type { Chapter } from './shared/chapter-types.js';
export { EVENT_KIND_LABELS, RSVP_REFUSAL_TEXT, IDLE_RSVP, ALL_EVENTS, filterEvents, spotsLeft } from './shared/event-types.js';
export type { ClubEvent, EventKind, Attendee, RsvpRefusal, RsvpState, EventFilter } from './shared/event-types.js';
export { eventsSource, createEventsSource, refusalOf } from './shared/events-source.js';
export type { EventsPort, EventsPortLike, EventsSource, EventsSourceRegion, EventsKeys } from './shared/events-source.js';
export { seedEventsPort, CHAPTER_NAMES } from './shared/seed-events-port.js';
export type { RsvpStore } from './shared/seed-events-port.js';
export { seedEvents, seedRsvps, EVENT_TEMPLATES } from './shared/events-seed.js';
export { PERSONAS } from './shared/personas.js';
export type { Persona } from './shared/personas.js';
export { memberStats as statsOf, shortChapter } from './shared/gamification.js';
export { chapterColor, grouped, initials, CHAPTER_COLORS } from './ui/club/club-bits.js';
export { AppFrame } from './ui/app-frame/AppFrame.js';
export type { AppFrameProps } from './ui/app-frame/AppFrame.js';
export { seedTimeslots } from './shared/seed-timeslots.js';
