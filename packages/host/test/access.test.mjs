// WHAT A STRANGER CAN SEE, and what one leaked ingest token can do.
//
// Every case here is a way the gate was actually got round while it was being built, not a
// hypothetical. The one that matters most is the group summary: the gallery ITSELF was filtered
// correctly on the first try, and the front page still printed "2 lagoons · acme/secret + acme/open"
// underneath it — the sentence ABOUT the thing, which is the easier one to forget than the thing.
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createLagoonHost } from '../src/server.mjs';
import { digest } from '../src/access.mjs';

const dir = mkdtempSync(resolve(tmpdir(), 'motu-access-'));
writeFileSync(
  resolve(dir, 'access.json'),
  JSON.stringify({
    readHash: digest('READSECRET').toString('hex'),
    repos: {
      'acme/secret': { visibility: 'private', ingestHash: digest('ING-SECRET').toString('hex') },
      'acme/open': { ingestHash: digest('ING-OPEN').toString('hex') },
    },
  }),
);

const { server } = createLagoonHost({ dir, token: 'ADMIN' });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const B = `http://127.0.0.1:${server.address().port}`;

let pass = 0;
let fail = 0;
const t = (name, ok, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` -> ${detail}` : ''}`);
};
const get = (p, headers = {}) => fetch(`${B}${p}`, { headers, redirect: 'manual' });
const post = (p, body, headers = {}) => fetch(`${B}${p}`, { method: 'POST', body, headers });

const COOKIE = { cookie: 'motu_read=READSECRET' };
const CORPUS = JSON.stringify({
  v: 1, keysHash: '7f46c60a', regionId: 'actions', keys: ['busy'],
  entries: [{ fingerprint: { busy: 'true' }, count: 3, firstAt: 1, lastAt: 2 }],
});

await post('/api/publish?repo=acme/secret&slug=all&title=S', '<h1>SECRET PAGE</h1>', { authorization: 'Bearer ADMIN' });
await post('/api/publish?repo=acme/open&slug=all&title=O', '<h1>OPEN PAGE</h1>', { authorization: 'Bearer ADMIN' });
await post('/api/group?name=all', JSON.stringify({ all: true }), { authorization: 'Bearer ADMIN', 'content-type': 'application/json' });

console.log('\nhost access — a stranger\n');
t('a public lagoon is served', (await get('/acme/open/latest/all')).status === 200);
t('a private lagoon is 404, not 403', (await get('/acme/secret/latest/all')).status === 404);
t('a private repo index is 404', (await get('/acme/secret')).status === 404);
t('the root index does not name it', !(await (await get('/')).text()).includes('acme/secret'));
t('/api/repos does not name it', !(await (await get('/api/repos')).text()).includes('secret'));
t('/api/groups does not name it', !(await (await get('/api/groups')).text()).includes('secret'));
t('/api/baselines refuses it', (await get('/api/baselines?repo=acme/secret')).status === 404);

console.log('\nhost access — the gallery, which composes every project\n');
t('the group page does not name it', !(await (await get('/g/all')).text()).includes('secret'));
t('frame 0 is the readable member', (await (await get('/g/all/f/0')).text()).includes('OPEN PAGE'));
t('there is no frame past the readable ones', (await get('/g/all/f/1')).status === 404);

console.log('\nhost access — a reader who has the secret\n');
const unlock = await get('/acme/secret/latest/all?k=READSECRET');
t('?k= redirects rather than serving', unlock.status === 302);
t('...and sets an HttpOnly cookie', /HttpOnly/i.test(unlock.headers.get('set-cookie') ?? ''));
t('...and strips the secret from the url', !(unlock.headers.get('location') ?? '').includes('READSECRET'));
t('the private lagoon opens', (await (await get('/acme/secret/latest/all', COOKIE)).text()).includes('SECRET PAGE'));
t('a wrong cookie does not', (await get('/acme/secret/latest/all', { cookie: 'motu_read=nope' })).status === 404);
t('the admin token opens it too', (await get('/acme/secret/latest/all', { authorization: 'Bearer ADMIN' })).status === 200);
t('the root index names it again', (await (await get('/', COOKIE)).text()).includes('acme/secret'));

console.log('\nhost access — one leaked ingest token\n');
const ing = (repo, tok) => post(`/api/coverage?repo=${repo}&region=actions`, CORPUS, { authorization: `Bearer ${tok}`, 'content-type': 'application/json' });
t('writes its own repo', (await ing('acme/open', 'ING-OPEN')).status === 200);
t('CANNOT write another repo', (await ing('acme/secret', 'ING-OPEN')).status === 401);
t('CANNOT publish a lagoon', (await post('/api/publish?repo=acme/open&slug=all', 'x', { authorization: 'Bearer ING-OPEN' })).status === 401);
t('CANNOT register a live frame', (await post('/api/live?repo=acme/open&slug=all', '{"url":"http://127.0.0.1:1"}', { authorization: 'Bearer ING-OPEN', 'content-type': 'application/json' })).status === 401);
t('CANNOT read anything', (await get('/acme/secret/latest/all', { authorization: 'Bearer ING-OPEN' })).status === 404);
t('no token at all is refused', (await post('/api/coverage?repo=acme/open&region=actions', CORPUS, { 'content-type': 'application/json' })).status === 401);

console.log('\nhost access — the corpus is folded, not appended\n');
await ing('acme/open', 'ING-OPEN');
const stored = JSON.parse(await (await import('node:fs')).promises.readFile(resolve(dir, 'coverage/acme/open/actions/7f46c60a.json'), 'utf8'));
t('the same state stays one row', stored.entries.length === 1, `${stored.entries.length} row(s)`);
// TWO posts of count 3, so 6 — one from the ingest section above and one just now. Appending would
// give two rows; a store that overwrote would give 3.
t('...with the counts added', stored.entries[0].count === 6, `count ${stored.entries[0].count}`);

server.close();
rmSync(dir, { recursive: true, force: true });
console.log(`\n${fail === 0 ? 'PASS' : `FAIL — ${fail} assertion(s)`}  (${pass} passed)`);
process.exit(fail ? 1 : 0);
