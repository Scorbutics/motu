// Public surface of the demo project: the element registry, the archipelago configs + resolver,
// and the aggregated lagoon fixtures. Composition roots import everything they need from here.

export { ELEMENT_REGISTRY } from './islands/registry.js';

export { adminArchipelago } from './archipelagos/admin/admin.archipelago.js';
export { membersArchipelago } from './archipelagos/members/members.archipelago.js';
export type { MembersArchipelagoOptions } from './archipelagos/members/members.archipelago.js';
export { usersArchipelago } from './archipelagos/users/users.archipelago.js';
export { ARCHIPELAGOS, getArchipelago } from './archipelagos/registry.js';

export { ALL_FIXTURES, ALL_ROLES } from './fixtures.js';

export type { MemberRow, MemberCriteria } from './shared/member-types.js';
export type { MotuTheme, MotuFit, LegacyStrategy } from '@motu/core';
