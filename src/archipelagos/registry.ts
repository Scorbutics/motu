// Registry of the project's archipelagos by id, so a composition root (or the lagoon / CLI) can
// resolve one by name. `motu archipelago create` adds one import + one row here.
import type { ArchipelagoConfig } from '@motu/core';
import { reviewArchipelago } from './review/review.archipelago.js';

export const ARCHIPELAGOS: Record<string, ArchipelagoConfig> = {
  [reviewArchipelago.id]: reviewArchipelago,
};

/** Resolve an archipelago config by id (undefined if unknown). */
export function getArchipelago(id: string): ArchipelagoConfig | undefined {
  return ARCHIPELAGOS[id];
}
