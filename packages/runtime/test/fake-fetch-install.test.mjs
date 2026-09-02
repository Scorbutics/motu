// `installFakeFetch` — the claim it reads, and the many-fakes case the old boolean guard swallowed.
import { createPostgrestFetch, installFakeFetch, fakeFetchClaims, installedFakeFetches, resetFakeFetches, readUnansweredRequests } from '../dist/postgrest-fetch.js';

let pass = 0, fail = 0;
const t = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' -> ' + detail : ''}`); };

// The "real" fetch the patch must delegate to — a dev server that 404s everything it does not know.
const delegated = [];
globalThis.fetch = async (input) => {
  delegated.push(String(input instanceof Request ? input.url : input));
  return new Response('not found', { status: 404, headers: { 'content-type': 'text/plain' } });
};

// 1. The fake carries its own claim, so the installer never has to be told it twice.
{
  const fake = createPostgrestFetch({ appRoutes: ['/api/repos'], baseUrl: 'https://db.example' });
  const claims = fakeFetchClaims(fake);
  t('createPostgrestFetch stamps its appRoutes and baseUrl on the fake',
    claims?.appRoutes?.[0] === '/api/repos' && claims?.baseUrl === 'https://db.example');
}

// 2. Installed with NO options, the fake's own claim is what gets registered.
{
  resetFakeFetches();
  const fake = createPostgrestFetch({
    appRoutes: ['/api/repos'],
    fixtures: [{ service: '/api/repos', method: 'GET', response: { repos: ['a'] } }],
  });
  installFakeFetch(fake);
  const [claim] = installedFakeFetches();
  t('installFakeFetch(fake) reads the route list off the fake', claim?.appRoutes?.[0] === '/api/repos');

  const res = await globalThis.fetch('http://localhost/api/repos');
  const body = await res.json();
  t('a claimed route is answered by the fake, not the dev server', body?.repos?.[0] === 'a', JSON.stringify(body));
}

// 3. THE BUG THIS EXISTS FOR: a second region's wire used to be a silent no-op.
{
  resetFakeFetches();
  const first = createPostgrestFetch({
    appRoutes: ['/api/repos'],
    fixtures: [{ service: '/api/repos', method: 'GET', response: { repos: ['from-first'] } }],
  });
  const second = createPostgrestFetch({
    appRoutes: ['/api/members'],
    fixtures: [{ service: '/api/members', method: 'GET', response: { members: ['from-second'] } }],
  });
  installFakeFetch(first);
  installFakeFetch(second);
  t('both fakes are registered', installedFakeFetches().length === 2);

  const a = await (await globalThis.fetch('http://localhost/api/repos')).json();
  const b = await (await globalThis.fetch('http://localhost/api/members')).json();
  t('the first region\'s route still answers', a?.repos?.[0] === 'from-first', JSON.stringify(a));
  t('the SECOND region\'s route answers too', b?.members?.[0] === 'from-second', JSON.stringify(b));
}

// 4. Idempotent per fake — a hot reload re-installing the same one leaves one entry.
{
  resetFakeFetches();
  const fake = createPostgrestFetch({ appRoutes: ['/api/repos'] });
  installFakeFetch(fake);
  installFakeFetch(fake);
  t('installing the same fake twice registers it once', installedFakeFetches().length === 1);
}

// 5. Everything unclaimed still delegates — and a failing delegation is still recorded.
{
  resetFakeFetches();
  installFakeFetch(createPostgrestFetch({ appRoutes: ['/api/repos'] }));
  readUnansweredRequests();
  delegated.length = 0;
  const res = await globalThis.fetch('http://localhost/src/main.tsx');
  t('an unclaimed path goes to the original fetch', delegated.length === 1 && res.status === 404);
  const unanswered = readUnansweredRequests();
  t('a delegated request that failed is recorded', unanswered.length === 1 && unanswered[0].url === '/src/main.tsx',
    JSON.stringify(unanswered));
}

// 6. An explicit options argument still wins, for a caller wrapping someone else's fake.
{
  resetFakeFetches();
  const fake = createPostgrestFetch({ appRoutes: ['/api/repos'] });
  installFakeFetch(fake, { appRoutes: ['/api/other'] });
  t('explicit options override the stamp', installedFakeFetches()[0]?.appRoutes?.[0] === '/api/other');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
