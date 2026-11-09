// Writes supabase/seeds/chapters.sql and supabase/seeds/events.sql from the TypeScript that also
// feeds the sandbox and the lagoon (`demo-app/src/shared/{chapter-types,events-seed}.ts`).
// Run with tsx: `pnpm --filter @demo-app/app seed:club`.
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chaptersSql, eventsSql } from '../../../src/shared/club-seed-sql.ts';
import { SEED_MEMBERS } from '../../../src/shared/seed-members.generated.ts';

const seeds = resolve(dirname(fileURLToPath(import.meta.url)), '../../../supabase/seeds');
writeFileSync(resolve(seeds, 'chapters.sql'), chaptersSql());
writeFileSync(resolve(seeds, 'events.sql'), eventsSql(SEED_MEMBERS));
console.log(`club seed: chapters.sql, events.sql -> ${seeds}`);
