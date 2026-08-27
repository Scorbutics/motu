// WHO GETS IN WHEN GITHUB IS NOT ANSWERING — the decision docs/plan-lagoon-host.md asks to be made
// before shipping rather than discovered during an outage.
//
// These are the branches no rendered state can tell apart: a stale grant and a fresh one look
// identical on screen, and the difference between them is the whole design.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decide,
  canReadRepo,
  fetchReadableRepos,
  recordAccessAtSignIn,
  FRESH_FOR_MS,
  type AccessStore,
  type CachedAnswer,
} from '../src/auth/repo-access.ts';

const NOW = new Date('2026-08-27T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);

test('a fresh grant is a yes', () => {
  assert.deepEqual(decide({ canRead: true, checkedAt: ago(60_000) }, NOW), {
    canRead: true,
    because: 'fresh',
  });
});

test('a stale grant is still a yes — an outage must not lock out a team', () => {
  // The plan's "degrade to stale-but-working rather than locked-out", as something that runs.
  const verdict = decide({ canRead: true, checkedAt: ago(FRESH_FOR_MS + 60_000) }, NOW);
  assert.equal(verdict.canRead, true);
  assert.equal(verdict.because, 'stale-but-known', 'and it says the answer is old');
});

test('NO ANSWER IS A NO — the cold-cache case, failing closed', () => {
  // The one the plan says to decide up front. Nothing was ever recorded, so the only honest statement
  // is "we do not know", and that must not open a private lagoon.
  assert.deepEqual(decide(null, NOW), { canRead: false, because: 'no-answer' });
});

test('a stale refusal stays a refusal', () => {
  // The asymmetry, pinned: an old NO costs somebody a re-authentication, an old YES costs a private
  // lagoon. If this ever starts returning true, that trade has been silently reversed.
  const verdict = decide({ canRead: false, checkedAt: ago(FRESH_FOR_MS * 100) }, NOW);
  assert.equal(verdict.canRead, false);
});

test('the boundary is inclusive — an answer exactly at the limit is still fresh', () => {
  assert.equal(decide({ canRead: true, checkedAt: ago(FRESH_FOR_MS) }, NOW).because, 'fresh');
  assert.equal(decide({ canRead: true, checkedAt: ago(FRESH_FOR_MS + 1) }, NOW).because, 'stale-but-known');
});

function storeOf(rows: Record<string, CachedAnswer>): AccessStore {
  const written: Array<{ repo: string; canRead: boolean }> = [];
  return Object.assign(
    {
      async get(_userId: string, repo: string) {
        return rows[repo] ?? null;
      },
      async put(_userId: string, answers: Array<{ repo: string; canRead: boolean }>) {
        written.push(...answers);
      },
    },
    { written },
  );
}

test('canReadRepo asks the store for exactly the pair it was given', async () => {
  const store = storeOf({ 'acme/open': { canRead: true, checkedAt: ago(1000) } });
  assert.equal((await canReadRepo('u1', 'acme/open', store, NOW)).canRead, true);
  // A DIFFERENT repo is not the same question — this is what a lookup keyed on the user alone would
  // get wrong, handing somebody every repo they have ever been granted.
  assert.equal((await canReadRepo('u1', 'acme/secret', store, NOW)).canRead, false);
});

test('the token is spent once and every page is collected', async () => {
  const pages = [
    Array.from({ length: 100 }, (_, i) => ({ full_name: `acme/repo-${i}` })),
    [{ full_name: 'acme/last' }],
  ];
  let calls = 0;
  const stub = (async (url: unknown, init: unknown) => {
    const headers = (init as { headers: Record<string, string> }).headers;
    assert.equal(headers.authorization, 'Bearer TOKEN');
    return new Response(JSON.stringify(pages[calls++] ?? []), { status: 200 });
  }) as unknown as typeof fetch;

  const repos = await fetchReadableRepos('TOKEN', stub);
  assert.equal(repos.length, 101);
  assert.equal(repos.at(-1), 'acme/last');
  assert.equal(calls, 2, 'stopped as soon as a page came back short');
});

test('a refusal from GitHub is not silently an empty list', async () => {
  // An empty list and a 401 both mean "no repos" to a caller that does not check. One of them means
  // the grant carried no scope, and writing zero rows for it would look like a person with no access.
  const stub = (async () => new Response('nope', { status: 401 })) as unknown as typeof fetch;
  await assert.rejects(() => fetchReadableRepos('BAD', stub), /answered 401/);
});

test('sign-in records every repo as readable, and says how many', async () => {
  const store = storeOf({});
  const stub = (async () =>
    new Response(JSON.stringify([{ full_name: 'a/b' }, { full_name: 'c/d' }]), {
      status: 200,
    })) as unknown as typeof fetch;

  const count = await recordAccessAtSignIn('u1', 'TOKEN', store, stub);
  assert.equal(count, 2);
  assert.deepEqual((store as unknown as { written: unknown[] }).written, [
    { repo: 'a/b', canRead: true },
    { repo: 'c/d', canRead: true },
  ]);
});
