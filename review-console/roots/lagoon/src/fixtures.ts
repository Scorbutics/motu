// Every island's lagoon fixtures, gathered by glob so adding an island is not also an edit here.
// A `fixtures.mock.ts` that exports `fixtures` / `roles` is picked up automatically.
import type { Fixture } from '@motu/runtime/mock';

type FixtureModule = { fixtures?: Fixture[]; roles?: string[] };

const modules = import.meta.glob<FixtureModule>(['../../../src/islands/*.evidence.ts', '../../../src/islands/*/fixtures.mock.ts'], { eager: true });

export const ALL_FIXTURES: Fixture[] = Object.values(modules).flatMap((m) => m.fixtures ?? []);

export const ALL_ROLES: string[] = [...new Set(Object.values(modules).flatMap((m) => m.roles ?? []))];
