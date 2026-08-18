// Registry of the project's archipelagos by id, so a composition root (or the lagoon / CLI) can
// resolve one by name without importing each factory. Adding an archipelago = adding a row here.

import type { ArchipelagoConfig } from '@motu/core';
import { adminArchipelago } from './admin/admin.archipelago.js';
import { membersArchipelago } from './members/members.archipelago.js';
import { usersArchipelago } from './users/users.archipelago.js';

export const ARCHIPELAGOS: Record<string, ArchipelagoConfig> = {
  [adminArchipelago.id]: adminArchipelago,
  members: membersArchipelago(),
  [usersArchipelago.id]: usersArchipelago,
};

/** Resolve an archipelago config by id (undefined if unknown). */
export function getArchipelago(id: string): ArchipelagoConfig | undefined {
  return ARCHIPELAGOS[id];
}
