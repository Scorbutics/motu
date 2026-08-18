// Lagoon fixtures for x-user-search.
//
// Intentionally empty: the Users "Search" box is a pure form island — it emits `criteria-changed` /
// `reset` and never calls @motu/contract (the Users *results* list is a separate island that
// self-fetches by criteria). Company lookup options are passed to the island as a `companies` prop by
// the archipelago/host, not replayed here.
import type { Fixture } from '@motu/runtime/mock';

export const fixtures: Fixture[] = [];

export const roles: string[] = [];
