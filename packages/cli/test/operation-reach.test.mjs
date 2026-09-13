// Resolving an ask to a backend operation, pinned on the cases where a string compare is wrong.
//
// The whole check rests on this: an ask the runtime recorded is matched against a list of operation
// names the backend declares. Every case below is one where getting it wrong reports a real,
// declared, successfully-answered ask as naming an operation nobody declares — which is an ERROR,
// so a false one costs a red run and the reviewer's trust in the check.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readOperationNames, indexOperations, resolveOperation, askKind } from '../src/lib/operations.mjs';

const index = (names) => indexOperations(names);

// Peps' own shapes, which is where these were found.
const PEPS = [
  'app/api/teams/session-horizon/route.ts',
  'app/api/admin/email-previews/[id]/route.ts',
  'app/api/admin/email-previews/[id]/raw/route.ts',
  'app/api/member/profile/route.ts',
  'complete-mission',
  'daily-scoring-trigger',
];

test('a plain route resolves to its handler file', () => {
  assert.equal(
    resolveOperation('route:POST /api/teams/session-horizon', index(PEPS)),
    'app/api/teams/session-horizon/route.ts',
  );
});

test('the METHOD does not select between operations — a route file answers every verb it exports', () => {
  const i = index(PEPS);
  for (const m of ['GET', 'POST', 'PATCH', 'DELETE']) {
    assert.equal(resolveOperation(`route:${m} /api/member/profile`, i), 'app/api/member/profile/route.ts');
  }
  // and the method-less canonical form, which `{ route: '/api/x' }` produces
  assert.equal(resolveOperation('route:/api/member/profile', i), 'app/api/member/profile/route.ts');
});

test('a DYNAMIC segment matches a real id — the case a string compare gets wrong', () => {
  const i = index(PEPS);
  assert.equal(
    resolveOperation('route:GET /api/admin/email-previews/9f3c-aa21', i),
    'app/api/admin/email-previews/[id]/route.ts',
  );
  assert.equal(
    resolveOperation('route:GET /api/admin/email-previews/9f3c-aa21/raw', i),
    'app/api/admin/email-previews/[id]/raw/route.ts',
  );
});

test('a deeper path does not fall back to a shorter route that happens to prefix it', () => {
  // `/api/member/profile/avatar` is NOT `app/api/member/profile/route.ts`.
  assert.equal(resolveOperation('route:GET /api/member/profile/avatar', index(PEPS)), null);
});

test('an unknown route resolves to nothing — this is the finding the check exists for', () => {
  assert.equal(resolveOperation('route:POST /api/teams/session-horizonn', index(PEPS)), null);
});

test('an edge function resolves by bare name', () => {
  assert.equal(resolveOperation('fn:complete-mission', index(PEPS)), 'complete-mission');
  assert.equal(resolveOperation('fn:no-such-function', index(PEPS)), null);
});

test('route GROUPS are not part of the URL', () => {
  const i = index(['app/(dashboard)/api/x/route.ts', 'src/app/(marketing)/api/y/route.ts']);
  assert.equal(resolveOperation('route:GET /api/x', i), 'app/(dashboard)/api/x/route.ts');
  assert.equal(resolveOperation('route:GET /api/y', i), 'src/app/(marketing)/api/y/route.ts');
});

test('a catch-all takes the rest of the path', () => {
  const i = index(['app/api/motu/[...call]/route.ts', 'app/api/opt/[[...rest]]/route.ts']);
  assert.equal(resolveOperation('route:POST /api/motu/MemberService/search', i), 'app/api/motu/[...call]/route.ts');
  // a required catch-all needs at least one segment
  assert.equal(resolveOperation('route:POST /api/motu', i), null);
  // an optional one does not
  assert.equal(resolveOperation('route:GET /api/opt', i), 'app/api/opt/[[...rest]]/route.ts');
});

test('a query string is not part of the identity', () => {
  assert.equal(
    resolveOperation('route:GET /api/member/profile?select=*', index(PEPS)),
    'app/api/member/profile/route.ts',
  );
});

test('only the two doors that carry an identifier are resolvable', () => {
  assert.equal(askKind('route:GET /api/x'), 'route');
  assert.equal(askKind('fn:notify'), 'fn');
  // a table or an rpc is a PostgREST identifier, not a backend operation
  assert.equal(askKind('table:members(select)'), null);
  assert.equal(askKind('rpc:accept_shots'), null);
  // and a contract call or a traced host module carries no identifier at all
  assert.equal(askKind('MemberService.search'), null);
  assert.equal(askKind('@/lib/services/teams'), null);
});

// ── reading the universe ──────────────────────────────────────────────────────

test("assay's shape is read for its KEYS, and its values are ignored", () => {
  const { names, error } = readOperationNames(JSON.stringify({
    version: 1,
    operations: { 'app/api/x/route.ts': { writes: ['members'], rlsBypassed: true }, 'churn-sweep': {} },
  }));
  assert.equal(error, undefined);
  assert.deepEqual(names, ['app/api/x/route.ts', 'churn-sweep']);
});

test('a plain array of names is accepted, so assay is not the only thing that can fill this slot', () => {
  assert.deepEqual(readOperationNames(JSON.stringify(['app/api/x/route.ts', 'notify'])).names,
    ['app/api/x/route.ts', 'notify']);
});

test('a bare object of names works, and `version` is not an operation', () => {
  assert.deepEqual(readOperationNames(JSON.stringify({ version: 1, 'app/api/x/route.ts': {} })).names,
    ['app/api/x/route.ts']);
});

test('malformed JSON is an ERROR, never an empty universe', () => {
  // An empty universe would make every ask unreachable — a wall of red saying the opposite of
  // what happened, which is the failure mode this whole check is supposed to be the opposite of.
  const { names, error } = readOperationNames('{ not json');
  assert.deepEqual(names, []);
  assert.match(error, /not valid JSON/);
});

// ── the config hatch, tested rather than assumed ─────────────────────────────
//
// `loadMotuConfig` returns a HAND-BUILT object: a key absent from it is silently dropped, whatever
// the project wrote. `hostSources` was added to removal-check with a comment telling users to set
// it, and did nothing at all for a day because it never appeared in that object — the escape hatch
// for a bug, itself broken in the same way the bug was.
//
// So this reproduces the drop on a key that is NOT whitelisted, and then shows `operations` surviving
// the same path. Without the first half the second proves nothing: a test that only asserts the
// happy case cannot tell a working whitelist from no whitelist at all.
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('the config whitelist is real, and `operations` is on it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'motu-operations-config-'));
  mkdirSync(join(dir, '.assay'), { recursive: true });
  writeFileSync(join(dir, '.assay', 'operations.json'), JSON.stringify({ version: 1, operations: {} }));
  writeFileSync(join(dir, 'motu.config.json'), JSON.stringify({
    operations: '.assay/operations.json',
    notWhitelisted: 'this value is written by the project and read by nobody',
  }));

  process.env.MOTU_PROJECT_ROOT = dir;
  // Fresh module instance: loadMotuConfig memoises into a module-level `cached`.
  const { loadMotuConfig } = await import(`../src/lib/config.mjs?hatch=${Date.now()}`);
  const cfg = loadMotuConfig();

  // THE BUG, reproduced: a key the project wrote, absent from the returned object, silently gone.
  assert.equal(cfg.notWhitelisted, undefined);
  // THE FIX, refusing it: the key this check depends on survives.
  assert.equal(cfg.operations, '.assay/operations.json');
  delete process.env.MOTU_PROJECT_ROOT;
});

// ── the check itself, including watching it go red ───────────────────────────
//
// The resolver above is the interesting half, but a resolver nobody wired up proves nothing. These
// drive `operationReachCheck` with the shape `runRegionFlows` actually returns, and the important
// one is `negated`: a check that has never been SEEN to fail has not been shown to work.
import { operationReachCheck } from '../src/commands/verify.mjs';

const recorder = () => {
  const out = { error: [], warn: [], ok: [], skip: [], inconclusive: [] };
  const push = (k) => (check, msg, seen) => out[k].push({ check, msg, seen });
  return { out, error: push('error'), warn: push('warn'), ok: push('ok'), skip: push('skip'), inconclusive: push('inconclusive') };
};

const universe = { names: PEPS, index: indexOperations(PEPS), rel: '.assay/operations.json' };
const ask = (name, owner = 'source:team') => ({ via: 'wire', name, args: '', owner, at: 1 });

test('an ask that names a declared operation holds', () => {
  const r = recorder();
  operationReachCheck(r, [ask('route:POST /api/teams/session-horizon')], universe, {});
  assert.equal(r.out.error.length, 0);
  assert.equal(r.out.ok.length, 1);
  assert.match(r.out.ok[0].msg, /1\/1 ask\(s\) resolve/);
  assert.deepEqual(r.out.ok[0].seen, { n: 1, of: 'operation ask(s)' });
});

test('NEGATED: the same ask against a universe without that operation goes red', () => {
  // The whole point. Remove the one operation and the previously-green run must fail, naming who
  // asked and what for.
  const without = PEPS.filter((n) => n !== 'app/api/teams/session-horizon/route.ts');
  const r = recorder();
  operationReachCheck(r, [ask('route:POST /api/teams/session-horizon')], 
    { names: without, index: indexOperations(without), rel: '.assay/operations.json' }, {});
  assert.equal(r.out.error.length, 1);
  assert.match(r.out.error[0].msg, /source:team asked for/);
  assert.match(r.out.error[0].msg, /route:POST \/api\/teams\/session-horizon/);
  assert.match(r.out.error[0].msg, /names no operation in \.assay\/operations\.json/);
});

test('asks that carry no operation identifier are COUNTED, not dropped', () => {
  const r = recorder();
  operationReachCheck(r, [
    ask('route:GET /api/member/profile'),
    { via: 'contract', name: 'MemberService.search', args: '1', owner: 'island:x', at: 2 },
    { via: 'host-module', name: 'fetchClubFeed', args: '', owner: 'island:x', at: 3 },
    ask('table:members(select)'),
  ], universe, {});
  assert.equal(r.out.error.length, 0);
  // 1 resolvable; the other three name no operation and must be visible in the pass line
  assert.match(r.out.ok[0].msg, /3 ask\(s\) name no operation/);
});

test('an operation the region DECLARES it reaches but no flow asked for is a warning', () => {
  const r = recorder();
  operationReachCheck(r, [ask('route:GET /api/member/profile')], universe, {
    'source:team': ['route:POST /api/teams/session-horizon', 'route:GET /api/member/profile'],
  });
  assert.equal(r.out.error.length, 0);
  assert.equal(r.out.warn.length, 1);
  assert.match(r.out.warn[0].msg, /app\/api\/teams\/session-horizon\/route\.ts/);
  // the one that WAS asked for is not reported
  assert.doesNotMatch(r.out.warn[0].msg, /member\/profile/);
});

test('the universe is not the narrowing — an undeclared operation is not reported as uncovered', () => {
  // 58 other operations exist; a region that declares it reaches none of them is not failing.
  const r = recorder();
  operationReachCheck(r, [ask('route:GET /api/member/profile')], universe, {});
  assert.equal(r.out.warn.length, 0);
});

test('no `operations` configured is a SKIP that names the key', () => {
  const r = recorder();
  operationReachCheck(r, [ask('route:GET /api/member/profile')], null, {});
  assert.equal(r.out.skip.length, 1);
  assert.match(r.out.skip[0].msg, /no `operations` in motu\.config\.json/);
});

test('a universe that could not be read is INCONCLUSIVE — exit 2, not a finding', () => {
  const r = recorder();
  operationReachCheck(r, [ask('route:GET /api/x')], { error: '.assay/operations.json does not exist' }, {});
  assert.equal(r.out.error.length, 0);
  assert.equal(r.out.inconclusive.length, 1);
  assert.match(r.out.inconclusive[0].msg, /nothing was compared/);
});

test('a region whose flows made no wire ask claims nothing', () => {
  // `seen: 0` turns the pass into a skip inside the report constructor — verified here by the count
  // that gets handed over, since this recorder has no such rule of its own.
  const r = recorder();
  operationReachCheck(r, [], universe, {});
  assert.equal(r.out.ok[0].seen.n, 0);
});
