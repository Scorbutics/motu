// Registry of the project's archipelagos by id, so a composition root (or the lagoon / CLI) can
// resolve one by name without importing each factory. Adding an archipelago = adding a row here.

import type { ArchipelagoConfig } from '@motu/core';
import { membersArchipelago } from './members/members.archipelago.js';
import { profileArchipelago } from './profile/profile.archipelago.js';
import { shellArchipelago } from './shell/shell.archipelago.js';
import { usersArchipelago } from './users/users.archipelago.js';

export const ARCHIPELAGOS: Record<string, ArchipelagoConfig> = {
  members: membersArchipelago(),
  [profileArchipelago.id]: profileArchipelago,
  [shellArchipelago.id]: shellArchipelago,
  [usersArchipelago.id]: usersArchipelago,
};

/** Resolve an archipelago config by id (undefined if unknown). */
export function getArchipelago(id: string): ArchipelagoConfig | undefined {
  return ARCHIPELAGOS[id];
}
