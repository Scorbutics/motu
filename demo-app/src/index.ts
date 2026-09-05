// Public surface of the demo project: the element registry, the archipelago configs + resolver,
// and the aggregated lagoon fixtures. Composition roots import everything they need from here.

export { ELEMENT_REGISTRY } from './islands/registry.js';

export { adminArchipelago } from './archipelagos/admin/admin.archipelago.js';
export { membersArchipelago } from './archipelagos/members/members.archipelago.js';
export type { MembersArchipelagoOptions } from './archipelagos/members/members.archipelago.js';
export { usersArchipelago } from './archipelagos/users/users.archipelago.js';
export { profileArchipelago } from './archipelagos/profile/profile.archipelago.js';
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
export { companiesSource, LOOKUP_LIMIT } from './shared/companies-source.js';
export { availabilitySource, calendarFrom, utcDate, HORIZON_DAYS } from './shared/availability-source.js';
export type { AvailabilityPort, AvailabilitySource, TimeslotRow } from './shared/availability-source.js';
export { SLOT_KIND_LABELS, emptyCalendar } from './shared/availability-types.js';
export type { Calendar, DayAvailability, SlotKind, Timeslot } from './shared/availability-types.js';
export type { CompaniesPort, CompaniesQueryResult } from './shared/companies-source.js';
export { ATLAS_CHART, HELIOS_CHART, ATLAS_COMPANY, HELIOS_COMPANY, orgChartFor, companyName } from './shared/org-types.js';
export type { OrgChart, OrgDepartment, OrgPerson } from './shared/org-types.js';
export type { MotuTheme, MotuFit, LegacyStrategy } from '@motu/core';
