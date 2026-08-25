// The forwarder, against a REAL motu host — not a mock, because the two things worth proving are
// exactly what a mock would be written to agree with: that a scoped ingest token is accepted, and
// that an upstream failure reaches the client as a failure rather than a cheerful 200.
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createLagoonHost } from '../../host/src/server.mjs';
import { digest } from '../../host/src/access.mjs';
import { handleCoverage } from '../dist/server/index.js';

const dir = mkdtempSync(resolve(tmpdir(), 'motu-fwd-'));
writeFileSync(resolve(dir, 'access.json'), JSON.stringify({ repos: { 'acme/app': { ingestHash: digest('ING').toString('hex') } } }));
const { server } = createLagoonHost({ dir, token: 'ADMIN' });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const HOST = `http://127.0.0.1:${server.address().port}`;

let pass = 0, fail = 0;
const t = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? ` -> ${d}` : ''}`); };

const CORPUS = { v: 1, keysHash: '7f46c60a', regionId: 'actions', keys: ['busy'], entries: [{ fingerprint: { busy: 'true' }, count: 2, firstAt: 1, lastAt: 2 }] };
const OPTS = { host: HOST, token: 'ING', repo: 'acme/app' };
const post = (body, opts = OPTS) =>
  handleCoverage(new Request('https://app.example/api/motu/coverage', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }), opts);

console.log('\ncoverage forwarder\n');
let r = await post(CORPUS);
t('forwards a corpus with a scoped token', r.status === 200, String(r.status));
t('...and reports what landed', (await r.clone().json()).states === 1);
t('an allowed region passes', (await post(CORPUS, { ...OPTS, regions: ['actions'] })).status === 200);
t('a region not on the list is refused', (await post(CORPUS, { ...OPTS, regions: ['other'] })).status === 400);

console.log('\ncoverage forwarder — refusing nonsense\n');
t('GET is refused', (await handleCoverage(new Request('https://a/x', { method: 'GET' }), OPTS)).status === 405);
t('non-JSON is refused', (await post('not json')).status === 400);
t('no regionId is refused', (await post({ keys: [], entries: [] })).status === 400);
t('no entries is refused', (await post({ regionId: 'actions', keys: [] })).status === 400);
t('an oversized corpus is refused', (await post({ ...CORPUS, pad: 'x'.repeat(300_000) })).status === 413);

console.log('\ncoverage forwarder — the failure modes the client depends on\n');
t('a bad ingest token is 502, not 200', (await post(CORPUS, { ...OPTS, token: 'WRONG' })).status === 502);
t('a repo it cannot write is 502', (await post(CORPUS, { ...OPTS, repo: 'someone/else' })).status === 502);
t('an unreachable host is 502, not a throw', (await post(CORPUS, { ...OPTS, host: 'http://127.0.0.1:1' })).status === 502);
const miscfg = await post(CORPUS, { host: '', token: '', repo: '' });
t('missing configuration is 503, not 500', miscfg.status === 503, String(miscfg.status));
t('...and names the variables to set', (await miscfg.json()).error.includes('MOTU_HOST_URL'));

console.log('\ncoverage forwarder — the fold reached the host\n');
await post(CORPUS);
const read = await fetch(`${HOST}/api/coverage?repo=acme/app&region=actions`).then((x) => x.json());
// THREE successful posts of count 2: the first, the allowed-region one, and the one just above.
// Everything between them was refused before it reached the host, which is what this number proves —
// a refused post that still forwarded would show up here and nowhere else.
t('one state, counts added across reports', read.corpus.entries.length === 1, `${read.corpus?.entries?.length} row(s)`);
t('...and only the accepted ones counted', read.corpus.entries[0].count === 6, `count ${read.corpus?.entries?.[0]?.count}`);

server.close();
rmSync(dir, { recursive: true, force: true });
console.log(`\n${fail === 0 ? 'PASS' : `FAIL — ${fail} assertion(s)`}  (${pass} passed)`);
process.exit(fail ? 1 : 0);
