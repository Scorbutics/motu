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
      // A SECOND private repo with its OWN read token — the case one private repo cannot test:
      // whether a scoped token stays inside its scope.
      'acme/other': { visibility: 'private', readHash: digest('READ-OTHER').toString('hex') },
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

// THE WAY THE SERVICE ACTUALLY RUNS. The systemd unit passes the directory as MOTU_HOST_DIR, not
// --dir, so `dir` reaches createLagoonHost as undefined and the policy loader was handed it raw —
// `resolve(undefined, …)` throws, and EVERY request answered 500 "internal error". Every test here
// passed a dir explicitly, so none of them could see it. This one boots the way the service does.
{
  const prev = process.env.MOTU_HOST_DIR;
  process.env.MOTU_HOST_DIR = dir;
  const bare = createLagoonHost({ token: 'ADMIN' });
  await new Promise((r) => bare.server.listen(0, '127.0.0.1', r));
  const port = bare.server.address().port;
  const health = await fetch(`http://127.0.0.1:${port}/api/health`);
  console.log('\nhost access — booted the way the service boots\n');
  t('a host given its directory by MOTU_HOST_DIR serves requests', health.status === 200, String(health.status));
  t('...including the index', (await fetch(`http://127.0.0.1:${port}/`)).status === 200);
  // AND THE COVERAGE ROUTES, which the index does not exercise. The first version of this block only
  // checked /api/health and /, so it caught the access loader taking the raw `dir` and missed the
  // store doing the same thing three lines later — coverage 500'd while every page worked.
  // ITS OWN REGION, so this does not perturb the fold arithmetic another case asserts on. Writing
  // into `actions` made a count of 6 become 9 and failed a test that was correct — shared state
  // between cases is a way to fail for a reason that has nothing to do with the thing being tested.
  const bootRegion = 'bootcheck';
  await fetch(`http://127.0.0.1:${port}/api/coverage?repo=acme/open&region=${bootRegion}`, {
    method: 'POST',
    headers: { authorization: 'Bearer ADMIN', 'content-type': 'application/json' },
    body: CORPUS,
  });
  t('...and can ingest a corpus', (await fetch(`http://127.0.0.1:${port}/api/coverage?repo=acme/open&region=${bootRegion}`)).status === 200);
  t('...and can read the accepted set',
    (await fetch(`http://127.0.0.1:${port}/api/coverage/known?repo=acme/open&region=${bootRegion}&h=7f46c60a`)).status === 200);
  bare.server.close();
  if (prev === undefined) delete process.env.MOTU_HOST_DIR;
  else process.env.MOTU_HOST_DIR = prev;
}

console.log('\nhost access — a stranger\n');
t('a public lagoon is served', (await get('/acme/open/latest/all')).status === 200);
t('a private lagoon is 404, not 403', (await get('/acme/secret/latest/all')).status === 404);
t('a private repo index is 404', (await get('/acme/secret')).status === 404);
t('the root index does not name it', !(await (await get('/')).text()).includes('acme/secret'));
t('/api/repos does not name it', !(await (await get('/api/repos')).text()).includes('secret'));
t('/api/baselines refuses it', (await get('/api/baselines?repo=acme/secret')).status === 404);

// THE RAIL COMPOSES EVERY PROJECT, which is the same risk the group gallery carried and the reason
// these assertions outlived it. `/<repo>/<ref>/<slug>` now serves a shell whose rail lists every
// lagoon the viewer may see — so an unfiltered rail would name a private repo on a public page, which
// is exactly the leak the group's own filter existed to stop.
console.log('\nhost access — the rail, which lists every project\n');
t('a public lagoon shell does not name a private repo', !(await (await get('/acme/open/latest/all')).text()).includes('secret'));
t('the frame serves the page itself', (await (await get('/acme/open/latest/all/__motu_frame')).text()).includes('OPEN PAGE'));
t('a private lagoon frame is 404, not 403', (await get('/acme/secret/latest/all/__motu_frame')).status === 404);

console.log('\nhost access — a reader who has the secret\n');
const unlock = await get('/acme/secret/latest/all?k=READSECRET');
t('?k= redirects rather than serving', unlock.status === 302);
t('...and sets an HttpOnly cookie', /HttpOnly/i.test(unlock.headers.get('set-cookie') ?? ''));
t('...and strips the secret from the url', !(unlock.headers.get('location') ?? '').includes('READSECRET'));
t('the private lagoon opens', (await (await get('/acme/secret/latest/all/__motu_frame', COOKIE)).text()).includes('SECRET PAGE'));
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

console.log('\nhost access — reading the corpus back\n');
// The private repo needs a corpus before "its reader can read it" means anything — the ingest
// section above deliberately FAILED to write this one, which is the point of that section.
await post('/api/coverage?repo=acme/secret&region=actions', CORPUS, { authorization: 'Bearer ADMIN', 'content-type': 'application/json' });
t('a public repo serves its corpus', (await get('/api/coverage?repo=acme/open&region=actions')).status === 200);
t('a private repo does not', (await get('/api/coverage?repo=acme/secret&region=actions')).status === 404);
t('...but its reader does', (await get('/api/coverage?repo=acme/secret&region=actions', COOKIE)).status === 200);
// ONE ANSWER FOR EVERY KIND OF NOTHING. 404 for private and 200 for unknown would be a name oracle:
// guess a repo, and the status says whether it exists and is being hidden — giving away exactly what
// the page route's 404 was chosen to hide.
t('a repo that does not exist looks the same', (await get('/api/coverage?repo=no/such&region=actions')).status === 404);
t('a region with no corpus looks the same', (await get('/api/coverage?repo=acme/open&region=ghost')).status === 404);
t('the served page is stamped with its repo', (await (await get('/acme/open/latest/all/__motu_frame')).text()).includes('name="motu-repo" content="acme/open"'));
// The stamp must be in the OUTER head. Inside the body, the page's own React render replaces it and
// the lens finds nothing — which is how this first shipped, correct in curl and useless in a browser.
t('...in the head, before the body starts', (await (await get('/acme/open/latest/all/__motu_frame')).text()).indexOf('motu-repo') < (await (await get('/acme/open/latest/all/__motu_frame')).text()).indexOf('<body'));

console.log('\nhost access — a server reading back, which cannot send a cookie\n');
t('the read secret works as a bearer too', (await get('/api/coverage?repo=acme/secret&region=actions', { authorization: 'Bearer READSECRET' })).status === 200);
// The ingest token must NOT open this door. It lives in somebody else's production environment, so
// write-only is the whole reason it is a separate credential.
t('the ingest token still cannot read a corpus', (await get('/api/coverage?repo=acme/secret&region=actions', { authorization: 'Bearer ING-SECRET' })).status === 404);

console.log('\nhost access — the accepted set, and who may add to it\n');
const known = (h = {}) => get('/api/coverage/known?repo=acme/open&region=actions&h=7f46c60a', h);
const accept = (tok, ids) =>
  post('/api/coverage/accept?repo=acme/open&region=actions&h=7f46c60a', JSON.stringify(ids), {
    authorization: `Bearer ${tok}`, 'content-type': 'application/json' });

t('an empty set is served before anyone accepts', JSON.parse(await (await known()).text()).length === 0);
t('...and it is cacheable', /max-age=300/.test((await known()).headers.get('cache-control') ?? ''));
// NOTHING PROMOTES A STATE TO KNOWN EXCEPT A FLOW OR A PERSON. An ingest credential that could also
// accept would let the reporting path mark its own findings resolved — and a system that can do that
// reports nothing, which is indistinguishable from having nothing to report.
t('the ingest token CANNOT accept', (await accept('ING-OPEN', ['busy:true'])).status === 401);
t('the admin token can', (await accept('ADMIN', ['busy:true', 'busy:false'])).status === 200);
t('...and known serves it back', JSON.parse(await (await known()).text()).length === 2);
t('accepting again is idempotent', JSON.parse(await (await (await accept('ADMIN', ['busy:true']), known())).text()).length === 2);
t('another declaration has its own set',
  JSON.parse(await (await get('/api/coverage/known?repo=acme/open&region=actions&h=deadbeef')).text()).length === 0);
// An empty set is the safe answer to every kind of no: at worst one extra beacon, never a wrong
// silence. Refusing loudly would turn a reporting tool's outage into a broken page.
t('a private repo answers [] rather than refusing',
  (await get('/api/coverage/known?repo=acme/secret&region=actions&h=7f46c60a')).status === 200);
t('...and the set is empty for a stranger',
  JSON.parse(await (await get('/api/coverage/known?repo=acme/secret&region=actions&h=7f46c60a')).text()).length === 0);

// A HOST THAT LEANS CLOSED — the deployment this was added for: a personal preview host on a public
// domain, published to by agents that create a repo simply by publishing to it. Visibility is per
// repo and nothing in the wire protocol sets it, so with a public default there is a window between
// the first publish landing and somebody marking it private. The default is the only place that
// window can be closed.
//
// The half that matters most here is the LAST two: an agent must keep full access to the lagoon it
// just published, or closing the door locks out the only party that has to walk through it.
console.log('\nhost access — a host whose default is private\n');
{
  const shut = mkdtempSync(resolve(tmpdir(), 'motu-access-shut-'));
  writeFileSync(
    resolve(shut, 'access.json'),
    JSON.stringify({
      defaultVisibility: 'private',
      readHash: digest('READSECRET').toString('hex'),
      // ONE repo says otherwise, because a default is only a default: an explicit policy has to win
      // in BOTH directions or "public by exception" is unreachable on a closed host.
      repos: { 'acme/announced': { visibility: 'public' } },
    }),
  );
  const shutHost = createLagoonHost({ dir: shut, token: 'ADMIN' });
  await new Promise((r) => shutHost.server.listen(0, '127.0.0.1', r));
  const S = `http://127.0.0.1:${shutHost.server.address().port}`;
  const sget = (path, headers = {}) => fetch(`${S}${path}`, { headers, redirect: 'manual' });
  const admin = { authorization: 'Bearer ADMIN' };

  await fetch(`${S}/api/publish?repo=acme/fresh&slug=all&title=F`, { method: 'POST', body: '<h1>FRESH</h1>', headers: admin });
  await fetch(`${S}/api/publish?repo=acme/announced&slug=all&title=A`, { method: 'POST', body: '<h1>ANNOUNCED</h1>', headers: admin });

  t('a repo nobody wrote a policy for is CLOSED', (await sget('/acme/fresh/latest/all')).status === 404);
  t('...and is not named on the index either', !(await (await sget('/')).text()).includes('acme/fresh'));
  t('an explicit `public` still overrides the default', (await sget('/acme/announced/latest/all')).status === 200);
  t('the read secret opens the closed one', (await sget('/acme/fresh/latest/all', { cookie: 'motu_read=READSECRET' })).status === 200);

  // THE PUBLISHER KEEPS ITS OWN LAGOON. The upload token is the admin token, and `canRead` takes it
  // as `adminOk` — so an agent can read back what it just published without holding a read secret,
  // which is what keeps the read secret out of CI environments and PR bodies entirely.
  t('the AGENT reads its own lagoon with the upload token', (await sget('/acme/fresh/latest/all', admin)).status === 200);
  // And the one that broke: `snapshot --remote` asks this to explain a region diff, and the caller
  // swallowed the failure — so an unauthenticated 404 became "no member island changed", which reads
  // as "the arrangement moved". A wrong conclusion, not an error.
  t('...and its baselines, which a region diff needs', (await sget('/api/baselines?repo=acme/fresh', admin)).status === 200);
  t('...while a stranger asking the same gets 404', (await sget('/api/baselines?repo=acme/fresh')).status === 404);

  shutHost.server.close();
  rmSync(shut, { recursive: true, force: true });
}

console.log('\nhost access — a read token scoped to one repo\n');
await post('/api/publish?repo=acme/other&slug=all&title=O2', '<h1>OTHER PAGE</h1>', { authorization: 'Bearer ADMIN' });
const OTHER = { authorization: 'Bearer READ-OTHER' };
t('it opens its own repo', (await (await get('/acme/other/latest/all/__motu_frame', OTHER)).text()).includes('OTHER PAGE'));
// THE WHOLE POINT. This token lives in an application's production environment; if it also opened the
// neighbouring private repo it would undo the reason ingest tokens are scoped at all.
t('it does NOT open another private repo', (await get('/acme/secret/latest/all', OTHER)).status === 404);
t('...nor that repo\'s corpus', (await get('/api/coverage?repo=acme/secret&region=actions', OTHER)).status === 404);
t('...nor list it on the index', !(await (await get('/', OTHER)).text()).includes('acme/secret'));
t('but its own repo IS listed', (await (await get('/', OTHER)).text()).includes('acme/other'));
t('the host-wide secret still opens both',
  (await get('/acme/other/latest/all', COOKIE)).status === 200 && (await get('/acme/secret/latest/all', COOKIE)).status === 200);
t('a repo token works as a cookie too', (await get('/acme/other/latest/all', { cookie: 'motu_read=READ-OTHER' })).status === 200);
t('its own accepted set is readable with it',
  (await get('/api/coverage/known?repo=acme/other&region=actions&h=7f46c60a', OTHER)).status === 200);

// THE ACCEPTED SET IS NOT A CORPUS, and they live in the same directory. `<keysHash>.accepted.json`
// also ends in `.json`, so a bare suffix test read it back as a corpus and served an array of
// fingerprint ids where the caller expected `{ keys, entries }` — a wrong shape that fails nothing.
console.log('\nhost access — accepted files are not corpora\n');
{
  const r = await get('/api/coverage?repo=acme/other&region=actions');
  // acme/other has an accepted set (written above) and has never been ingested into.
  t('a region with only an accepted set has no corpus', r.status === 404, String(r.status));
  await post('/api/coverage?repo=acme/other&region=actions', CORPUS, {
    authorization: 'Bearer ADMIN', 'content-type': 'application/json' });
  const c = await (await get('/api/coverage?repo=acme/other&region=actions', OTHER)).json();
  t('...and once ingested, the corpus is the corpus', Array.isArray(c.corpus?.entries), JSON.stringify(c.corpus).slice(0, 40));
  t('...counted once, not twice', c.declarations === 1, String(c.declarations));
}


// LIVE ON THE CANONICAL URL. `latest` already meant "always current"; it meant current as of the
// last publish, and liveness reached only a gallery frame — so the URL a person actually bookmarks
// was the one place it did not work.
console.log('\nhost access — a lagoon served live\n');
{
  const dev = (await import('node:http')).createServer((q, s) => {
    if (q.url.endsWith('/__motu_reload')) { s.writeHead(200, { 'content-type': 'text/event-stream' }); s.write('retry: 1500\n\n'); return; }
    const b = '<!doctype html><html><head><title>x</title></head><body>LIVE DEV SERVER</body></html>';
    s.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': b.length }); s.end(b);
  });
  await new Promise((r) => dev.listen(0, '127.0.0.1', r));
  await post(`/api/live?repo=acme/open&slug=all`, JSON.stringify({ url: `http://127.0.0.1:${dev.address().port}` }),
    { authorization: 'Bearer ADMIN', 'content-type': 'application/json' });

  t('the canonical URL serves the dev server', (await (await get('/acme/open/latest/all')).text()).includes('LIVE DEV SERVER'));
  // Without this the live page cannot ask the host for its own coverage — the one section that makes
  // going live worth doing, missing for a reason nothing shows.
  t('...stamped with its repo, like a stored one', (await (await get('/acme/open/latest/all')).text()).includes('name="motu-repo"'));
  const reload = await get('/acme/open/latest/all/__motu_reload');
  t('...and the reload stream reaches it', (reload.headers.get('content-type') ?? '').includes('text/event-stream'));
  await reload.body?.cancel();

  // AN IMMUTABLE URL MUST NEVER BE LIVE: "this exact page, forever" is the whole reason it exists.
  const listing = await (await get('/acme/open')).text();
  const immutable = /\/acme\/open\/[a-f0-9]{6,}\/all/.exec(listing)?.[0];
  t('an immutable URL still serves its own bytes', immutable
    ? !(await (await get(immutable)).text()).includes('LIVE DEV SERVER') : false, immutable ?? 'no immutable url found');

  dev.close();
  await new Promise((r) => setTimeout(r, 50));
  t('a dead dev server falls back to the last publish', !(await (await get('/acme/open/latest/all')).text()).includes('LIVE DEV SERVER'));
}


// FORGETTING IS NOT ACCEPTING. Accepting says "we looked and chose not to preview this"; forgetting
// says "this was never true" — the case being a mistake in the INSTRUMENT rather than the application.
console.log('\nhost access — forgetting a state the instrument recorded wrongly\n');
{
  const two = JSON.stringify({
    v: 1, keysHash: 'ffff0000', regionId: 'forgetme', keys: ['a', 'b'],
    entries: [
      { fingerprint: { a: 'true', b: 'true' }, count: 3, firstAt: 1, lastAt: 2 },
      { fingerprint: { a: 'true', b: 'false' }, count: 7, firstAt: 1, lastAt: 2 },
    ],
  });
  const forget = (tok, body) => post('/api/coverage/forget?repo=acme/open&region=forgetme&h=ffff0000', body,
    { authorization: `Bearer ${tok}`, 'content-type': 'application/json' });
  // ITS OWN REGION. `actions` already holds another declaration from the ingest cases above, so
  // "the whole declaration is gone" would still find that one and the assertion would fail for a
  // reason unrelated to forgetting — which is exactly what it did.
  const states = async () =>
    ((await (await get('/api/coverage?repo=acme/open&region=forgetme')).json()).corpus?.entries ?? []).length;

  await post('/api/coverage?repo=acme/open&region=forgetme', two, { authorization: 'Bearer ADMIN', 'content-type': 'application/json' });
  // An ingest credential that could also delete could quietly rewrite what a region is known to have
  // done — so it is admin-only, like accepting.
  t('the ingest token CANNOT forget', (await forget('ING-OPEN', '["a:true b:true"]')).status === 401);
  const before = await states();
  const one = await forget('ADMIN', '["a:true b:true"]');
  t('the admin token can', one.status === 200);
  t('...and removes exactly that state', (await states()) === before - 1, `${before} -> ${await states()}`);
  t('...leaving the other', (await states()) >= 1);
  const all = await forget('ADMIN', '[]');
  t('an empty list drops the whole declaration', all.status === 200 && (await get('/api/coverage?repo=acme/open&region=forgetme')).status === 404);
  t('...and forgetting nothing twice is harmless', (await forget('ADMIN', '[]')).status === 200);
}


server.close();
rmSync(dir, { recursive: true, force: true });
console.log(`\n${fail === 0 ? 'PASS' : `FAIL — ${fail} assertion(s)`}  (${pass} passed)`);
process.exit(fail ? 1 : 0);
