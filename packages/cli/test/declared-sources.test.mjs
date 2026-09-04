// `sources`, read by a parser instead of by two regexes that disagreed.
//
// THE BUG THIS CLOSES. `verify` handled both declaration forms; `integrate check` matched only
// `(\w+):\s*\{…\}`, so a region declaring `teams: teamsSource` — the form the type system checks —
// skipped the check that says the page installs it. Not "reported differently": absent, silently.
// The stronger declaration got less checking than the weaker one.
//
// Each case below is a shape one of those regexes got wrong, or a property of the language that a
// regex cannot have.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { declaredSourcesOf } from '../src/lib/declared-sources.mjs';

const dir = mkdtempSync(join(tmpdir(), 'motu-declared-sources-'));
let n = 0;
const parse = (body) => {
  const file = join(dir, `a${n++}.archipelago.ts`);
  writeFileSync(file, body);
  return declaredSourcesOf(file);
};

test('reads a source declared BY REFERENCE, and its module from the import', () => {
  const out = parse(`
    import { weekSource } from '@/app/dashboard/actions/actions-week-source';
    export const a = archipelago<R, E, P>()({
      id: 'actions',
      sources: { week: weekSource },
    } as const, { ownership: true });
  `);
  assert.deepEqual(out.week, {
    module: '@/app/dashboard/actions/actions-week-source',
    produces: [],
    byReference: true,
    reachesText: null,
  });
});

test('reads a source declared by MODULE NAME, with its produced keys', () => {
  const out = parse(`
    export const a = archipelago()({
      sources: {
        revenue: { module: '@/lib/services/revenue-thanks', produces: ['monthEur', 'currency'] },
      },
    } as const);
  `);
  assert.equal(out.revenue.module, '@/lib/services/revenue-thanks');
  assert.deepEqual(out.revenue.produces, ['monthEur', 'currency']);
  assert.equal(out.revenue.byReference, false);
});

test('reads BOTH forms in one region — the mixed case neither regex covered alone', () => {
  const out = parse(`
    import { weekSource } from './week-source';
    export const a = archipelago()({
      sources: {
        week: weekSource,
        revenue: { module: '@/lib/services/revenue', produces: ['monthEur'] },
      },
    } as const);
  `);
  assert.deepEqual(Object.keys(out).sort(), ['revenue', 'week']);
  assert.equal(out.week.byReference, true);
  assert.equal(out.revenue.byReference, false);
});

test('an apostrophe in a comment does not become a key', () => {
  // THE SCAR. `verify` blanks every comment before matching precisely because prose like "the week's
  // missions" opens a string as far as a regex is concerned, and the block then yielded a key named
  // ` missions, so it comes...`. A parser has no such failure mode, and needs no pre-pass.
  const out = parse(`
    export const a = archipelago()({
      sources: {
        // The week's missions, and everything that follows from them.
        week: { module: '@/lib/services/missions', produces: ['weekMissions'] },
      },
    } as const);
  `);
  assert.deepEqual(Object.keys(out), ['week']);
  assert.deepEqual(out.week.produces, ['weekMissions']);
});

test('indentation is not part of the declaration', () => {
  // The regex terminated the block on `\n  \},` — exactly two spaces. Prettier, a nested config, or a
  // region written inside another block would each have silently yielded nothing.
  const out = parse(`
    export const a = archipelago()({
        sources: {
            revenue: { module: '@/lib/services/revenue', produces: ['monthEur'] },
        },
    } as const);
  `);
  assert.equal(out.revenue?.module, '@/lib/services/revenue');
});

test('a region with no sources says so, and an unparseable file does not throw', () => {
  assert.deepEqual(parse(`export const a = archipelago()({ id: 'x' } as const);`), {});
  assert.deepEqual(parse(`this is (not { valid ] typescript`), {});
});

test('carries `reaches` through for the caller that reads it', () => {
  const out = parse(`
    export const a = archipelago()({
      sources: {
        revenue: {
          module: '@/lib/services/revenue',
          produces: ['monthEur'],
          reaches: ['@/lib/supabase/client', { table: 'payments(select)' }],
        },
      },
    } as const);
  `);
  assert.match(out.revenue.reachesText, /@\/lib\/supabase\/client/);
  assert.match(out.revenue.reachesText, /payments\(select\)/);
});
