// WHAT `publish --remote` CLAIMS, AND WHAT IT CHECKED.
//
// The command printed the host's URLs verbatim and never fetched one, so "published" meant "the host
// answered 200". That is not the same claim, and the gap is invisible in the good case: every field
// the host returned — ok, bytes, deduped, urls — is consistent with it having stored the wrong blob.
//
// Verification is by CONTENT HASH rather than by reading the page back, because both sides already
// hold the bytes: the host names what it stored, the CLI names what it sent, and a mismatch is an
// error instead of a URL. The three cases below are the ones that matter — a truthful host, a host
// whose answer does not match the upload, and a host too old to answer at all (unverified, and SAID
// to be, never silently green).
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createLagoonHost } from '../../host/src/server.mjs';
import { uploadLagoon } from '../src/lib/remote.mjs';

let pass = 0, fail = 0;
const t = (n, ok, d='') => { ok ? pass++ : fail++; console.log(`  ${ok?'ok  ':'FAIL'} ${n}${d?' -> '+d:''}`); };

const dir = mkdtempSync(join(tmpdir(), 'motu-cli-verify-'));
const host = createLagoonHost({ dir, token: 'T' });
await new Promise((r) => host.server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${host.server.address().port}`;
const page = '<h1>REAL BUILD</h1>';

const ok = await uploadLagoon({ url, token: 'T', repo: 'acme/one', slug: 'all', title: 'x', body: page });
t('a real host verifies', ok.verified === true, `verified=${ok.verified}`);
t('and reports no shadowing', ok.live === false);
host.server.close();

// A host that returns 200 + urls but stored something else: exactly the failure the old code could
// not see, since it printed whatever came back.
const liar = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: true, hash: 'f'.repeat(64), bytes: 3, deduped: false,
    urls: { latest: '/acme/one/latest/all', immutable: '/acme/one/deadbeef/all' } }));
});
await new Promise((r) => liar.listen(0, '127.0.0.1', r));
try {
  await uploadLagoon({ url: `http://127.0.0.1:${liar.address().port}`, token: 'T', repo: 'acme/one', slug: 'all', title: 'x', body: page });
  t('a lying host is refused', false, 'no error thrown');
} catch (e) {
  t('a lying host is refused', /stored different bytes/.test(e.message), e.message.slice(0, 80));
}
liar.close();

// An OLD host with no hash field must be reported as unverified, never silently passed.
const old = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: true, bytes: 3, deduped: false,
    urls: { latest: '/acme/one/latest/all', immutable: '/acme/one/deadbeef/all' } }));
});
await new Promise((r) => old.listen(0, '127.0.0.1', r));
const legacy = await uploadLagoon({ url: `http://127.0.0.1:${old.address().port}`, token: 'T', repo: 'acme/one', slug: 'all', title: 'x', body: page });
t('an old host is unverified, not passed', legacy.verified === null, `verified=${legacy.verified}`);
old.close();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
