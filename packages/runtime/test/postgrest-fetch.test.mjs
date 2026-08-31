import { createPostgrestFetch, readUnscopedRequests, readFakeFetchRequestCount, readDataReach } from '../dist/postgrest-fetch.js';
let pass = 0, fail = 0;
const t = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' -> ' + detail : ''}`); };

const BASE = 'https://lagoon.invalid';
const get = (fetchFn, path, headers = {}) => fetchFn(`${BASE}${path}`, { method: 'GET', headers });

// --- table reads: filter, order, select, pagination -----------------------------------------------
{
  readUnscopedRequests(); // drain anything left over from a previous fake instance in this process
  const fetchFn = createPostgrestFetch({
    baseUrl: BASE,
    tables: {
      member_challenge_prefs: {
        rows: [
          { member_id: 'm-1', entry_state: 'engaged', remind_at: null },
          { member_id: 'm-2', entry_state: 'undecided', remind_at: null },
        ],
      },
    },
  });

  const all = await (await get(fetchFn, '/rest/v1/member_challenge_prefs?select=*')).json();
  t('reads the whole declared table', all.length === 2, JSON.stringify(all));

  const filtered = await (await get(fetchFn, '/rest/v1/member_challenge_prefs?select=*&member_id=eq.m-1')).json();
  t('eq filter narrows to one row', filtered.length === 1 && filtered[0].member_id === 'm-1', JSON.stringify(filtered));

  const projected = await (await get(fetchFn, '/rest/v1/member_challenge_prefs?select=member_id&member_id=eq.m-1')).json();
  t('select projects only named columns', Object.keys(projected[0]).length === 1 && 'member_id' in projected[0], JSON.stringify(projected));

  const single = await get(fetchFn, '/rest/v1/member_challenge_prefs?select=*&member_id=eq.m-1', {
    Accept: 'application/vnd.pgrst.object+json',
  });
  const singleBody = await single.json();
  t('Accept: vnd.pgrst.object+json returns a single object, not an array', !Array.isArray(singleBody) && singleBody.member_id === 'm-1', JSON.stringify(singleBody));

  const emptySingle = await get(fetchFn, '/rest/v1/member_challenge_prefs?select=*&member_id=eq.nobody', {
    Accept: 'application/vnd.pgrst.object+json',
  });
  const emptyBody = await emptySingle.json();
  t('maybeSingle on zero rows answers null, not 404', emptySingle.status === 200 && emptyBody === null);

  const counted = await get(fetchFn, '/rest/v1/member_challenge_prefs?select=*', { Prefer: 'count=exact' });
  t('count=exact sets Content-Range', counted.headers.get('content-range') === '0-1/2', counted.headers.get('content-range'));
}

// --- lazy table `rows` — a remount re-runs a GET, not the module, so a table that must react to a
// scenario's seed (`services-club-feed.ts`'s exact problem) needs its content computed PER REQUEST.
{
  let callCount = 0;
  const fetchFn = createPostgrestFetch({
    baseUrl: BASE,
    tables: {
      counters: {
        rows: () => {
          callCount++;
          return [{ n: callCount }];
        },
      },
    },
  });
  const first = await (await get(fetchFn, '/rest/v1/counters?select=*')).json();
  const second = await (await get(fetchFn, '/rest/v1/counters?select=*')).json();
  t('a function `rows` is invoked fresh on every GET, not cached from construction', first[0].n === 1 && second[0].n === 2, `${first[0].n},${second[0].n}`);
}

// --- ordering and limit/offset pagination (what `withAutoPagination` actually re-issues) -----------
{
  const rows = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, n: 5 - i }));
  const fetchFn = createPostgrestFetch({ baseUrl: BASE, tables: { items: { rows } } });

  const ordered = await (await get(fetchFn, '/rest/v1/items?select=*&order=n.asc')).json();
  t('order=n.asc sorts ascending', ordered.map((r) => r.n).join(',') === '1,2,3,4,5', ordered.map((r) => r.n).join(','));

  const page = await (await get(fetchFn, '/rest/v1/items?select=*&order=id.asc&limit=2&offset=2')).json();
  t('limit/offset returns the right slice', page.map((r) => r.id).join(',') === '3,4', page.map((r) => r.id).join(','));
}

// --- rpc: the original motivating case, end to end through the fetch boundary ----------------------
{
  const fetchFn = createPostgrestFetch({
    baseUrl: BASE,
    fixtures: [
      { service: 'set_challenge_entry_state', method: 'rpc', response: { status: 'ok' } },
      { service: 'set_challenge_entry_state', method: 'rpc', status: 500, after: 2, message: 'transient' },
    ],
  });
  const rpc = (body) =>
    fetchFn(`${BASE}/rest/v1/rpc/set_challenge_entry_state`, { method: 'POST', body: JSON.stringify(body) });

  const first = await rpc({ p_state: 'snoozed' });
  const firstBody = await first.json();
  t('rpc call #1 succeeds', first.status === 200 && firstBody.status === 'ok', JSON.stringify(firstBody));

  const second = await rpc({ p_state: 'snoozed' });
  const secondBody = await second.json();
  t('rpc call #2 fails via `after` — the exact success-then-failure sequence a seed cannot express', second.status === 500 && secondBody.message === 'transient', JSON.stringify(secondBody));
}

// --- writes: insert / update / delete on a table, not via rpc --------------------------------------
{
  const fetchFn = createPostgrestFetch({
    baseUrl: BASE,
    fixtures: [
      { service: 'favorites', method: 'insert', response: [{ id: 'f-1' }] },
      { service: 'favorites', method: 'delete', response: [] },
    ],
  });
  const inserted = await fetchFn(`${BASE}/rest/v1/favorites`, { method: 'POST', body: JSON.stringify({ member_id: 'm-1' }) });
  t('insert resolves against an insert fixture', inserted.status === 201, String(inserted.status));

  const deleted = await fetchFn(`${BASE}/rest/v1/favorites?id=eq.f-1`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  t('return=minimal answers 204 with no body', deleted.status === 204);
}

// --- unscoped requests: the whole point of this design ----------------------------------------------
{
  readUnscopedRequests();
  const fetchFn = createPostgrestFetch({ baseUrl: BASE, tables: { known: { rows: [] } } });

  await get(fetchFn, '/rest/v1/never_declared?select=*');
  await get(fetchFn, '/rest/v1/known?select=*&weird_col=fuzzy.oops'); // unrecognized operator
  await fetchFn(`${BASE}/rest/v1/rpc/never_declared_fn`, { method: 'POST', body: '{}' });

  const unscoped = readUnscopedRequests();
  t('an undeclared table is recorded as unscoped', unscoped.some((u) => u.target === 'table:never_declared'), JSON.stringify(unscoped));
  t('an unrecognized filter operator is recorded as unscoped', unscoped.some((u) => u.target === 'table:known' && u.reason.includes('weird_col')), JSON.stringify(unscoped));
  t('an undeclared rpc is recorded as unscoped', unscoped.some((u) => u.target === 'rpc:never_declared_fn'), JSON.stringify(unscoped));
  t('exactly the 3 unscoped calls made, no more no less', unscoped.length === 3, String(unscoped.length));

  const drained = readUnscopedRequests();
  t('reading again after a clear starts empty', drained.length === 0);
}

// --- request-seen count: what makes "0 unscoped" a genuine pass rather than a check that ran nothing
{
  readFakeFetchRequestCount(); // drain leftovers from earlier fake instances in this process
  const fetchFn = createPostgrestFetch({ baseUrl: BASE, tables: { known: { rows: [{ id: 1 }] } } });
  t('a fresh count starts at 0 — nothing has run yet', readFakeFetchRequestCount(false) === 0);

  await get(fetchFn, '/rest/v1/known?select=*');
  await get(fetchFn, '/rest/v1/known?select=*&id=eq.1');
  const seen = readFakeFetchRequestCount(false);
  t('every request counts, scoped or not', seen === 2, String(seen));

  const afterClear = readFakeFetchRequestCount();
  t('clearing resets the count', afterClear === 2 && readFakeFetchRequestCount(false) === 0, String(afterClear));
}

// --- data reach: what the island needs from the backend, at assay's own granularity ---------------
{
  readDataReach();
  const fetchFn = createPostgrestFetch({
    baseUrl: BASE,
    tables: { prefs: { rows: [{ id: 1 }] } },
    fixtures: [
      { service: 'prefs', method: 'update', response: [{ id: 1 }] },
      { service: 'do_thing', method: 'rpc', response: { status: 'ok' } },
    ],
  });
  await get(fetchFn, '/rest/v1/prefs?select=*');
  await fetchFn(`${BASE}/rest/v1/prefs?id=eq.1`, { method: 'PATCH', body: '{}' });
  await fetchFn(`${BASE}/rest/v1/rpc/do_thing`, { method: 'POST', body: '{}' });
  // Reached but undeclared: still a dependency, so it must be recorded even though nothing answered.
  await get(fetchFn, '/rest/v1/never_declared?select=*');

  const reach = readDataReach(false);
  t('records a read as `select`', reach.tables.prefs?.includes('select') === true, JSON.stringify(reach));
  t('records a write by its SEMANTIC verb, not the HTTP method', reach.tables.prefs?.includes('update') === true, JSON.stringify(reach.tables.prefs));
  t('records rpc calls by name', reach.rpcs.includes('do_thing'), JSON.stringify(reach.rpcs));
  t('records a table nothing answered — reaching for it IS the dependency', 'never_declared' in reach.tables, JSON.stringify(Object.keys(reach.tables)));

  const cleared = readDataReach();
  t('reading with clear drains it', cleared.rpcs.length === 1 && readDataReach(false).rpcs.length === 0);
}

// --- edge functions + same-origin app routes ------------------------------------------------------
{
  readDataReach();
  readUnscopedRequests();
  const fetchFn = createPostgrestFetch({
    baseUrl: BASE,
    appRoutes: ['/api/'],
    fixtures: [
      { service: 'generate-member-missions', method: 'invoke', response: { generated: 3 } },
      { service: '/api/admin/announcement', method: 'GET', response: { announcements: [{ id: 'a-1' }] } },
    ],
  });

  const fn = await fetchFn(`${BASE}/functions/v1/generate-member-missions`, { method: 'POST', body: '{}' });
  t('an edge function invoke resolves against an `invoke` fixture', (await fn.json()).generated === 3);

  // Relative, same-origin: never reaches the database origin, so the baseUrl guard must not eat it.
  const route = await fetchFn('/api/admin/announcement', { method: 'GET' });
  const routeBody = await route.json();
  t('a same-origin app route is answered, not rejected as off-origin', routeBody.announcements?.[0]?.id === 'a-1', JSON.stringify(routeBody));

  const reach = readDataReach(false);
  t('an edge function lands in its OWN reach bucket, not rpcs', reach.functions.includes('generate-member-missions') && !reach.rpcs.length, JSON.stringify(reach));
  t('an app route is recorded with its verb', reach.routes.includes('GET /api/admin/announcement'), JSON.stringify(reach.routes));

  // The gap this closes: an unanswered same-origin route used to 404 invisibly (loopback, so not an
  // escape). Now it is an unscoped request like any other.
  await fetchFn('/api/not/declared', { method: 'GET' });
  t('an undeclared app route is unscoped, not silently 404', readUnscopedRequests().some((u) => u.target === 'route:/api/not/declared'));
}

// --- auth ---------------------------------------------------------------------------------------
{
  const fetchFn = createPostgrestFetch({ baseUrl: BASE, auth: { user: { id: 'u-1' }, session: null } });
  const user = await (await get(fetchFn, '/auth/v1/user')).json();
  t('declared auth.user answers /auth/v1/user', user.id === 'u-1', JSON.stringify(user));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
