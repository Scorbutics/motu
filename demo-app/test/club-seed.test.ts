// The committed SQL seeds are GENERATED from the TypeScript the sandbox and the lagoon answer from.
// This fails when someone edits one side and not the other — the live app and the sandbox would
// then show two different calendars, and no screen would say which was right.
import { strictEqual } from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { chaptersSql, eventsSql } from '../src/shared/club-seed-sql.js';
import { SEED_MEMBERS } from '../src/shared/seed-members.generated.js';

const committed = (name: string) => readFileSync(new URL(`../supabase/seeds/${name}`, import.meta.url), 'utf8');

describe('supabase/seeds', () => {
  it('chapters.sql is what chapter-types.ts generates', () => {
    strictEqual(committed('chapters.sql'), chaptersSql(), 'run `pnpm --filter @demo-app/app seed:club`');
  });
  it('events.sql is what events-seed.ts generates', () => {
    strictEqual(committed('events.sql'), eventsSql(SEED_MEMBERS), 'run `pnpm --filter @demo-app/app seed:club`');
  });
});
