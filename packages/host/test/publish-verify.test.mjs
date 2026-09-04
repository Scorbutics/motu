// A PUBLISH THAT REPORTS SUCCESS HAS TO BE CHECKABLE.
//
// `POST /api/publish` answered `{ok, deduped, bytes, urls}` — none of which says WHICH bytes were
// stored. `bytes` is a length and `deduped` says "these were already here"; a host that stored the
// wrong blob, or an older host behind a proxy that ate the body, reports success in a shape nothing
// can contradict. The CLI then printed those URLs as fact without ever fetching one.
//
// The cost of that was a whole session spent diagnosing a host bug that did not exist: a publish
// looked wrong, and there was no way to tell "the host mis-stored it" from "you are looking at the
// wrong URL". Both halves are fixed here — the host names what it stored, and it says when a live
// dev server is shadowing `latest`, which is the specific way a correct publish looks broken.
import { mkdtempSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLagoonHost } from '../src/server.mjs';

const dir = mkdtempSync(join(tmpdir(), 'motu-publish-verify-'));
const host = createLagoonHost({ dir, token: 'T' });
await new Promise((r) => host.server.listen(0, '127.0.0.1', r));
const port = host.server.address().port;
const base = `http://127.0.0.1:${port}`;

const pub = (repo, slug, body, extra = '') =>
  fetch(`${base}/api/publish?repo=${repo}&slug=${slug}&title=t${extra}`, {
    method: 'POST',
    headers: { authorization: 'Bearer T' },
    body,
  }).then((r) => r.json());

const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

let pass = 0, fail = 0;
const t = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? ' -> ' + d : ''}`); };

// ── the host names what it stored ───────────────────────────────────────────
const page = '<h1>THE REAL PAGE</h1>';
const one = await pub('acme/one', 'all', page);
t('publish returns the content hash', typeof one.hash === 'string' && one.hash.length === 64, String(one.hash).slice(0, 12));
t('the hash is of the bytes that were sent', one.hash === sha256(page));

// The check has to be able to FAIL, or it is asserting a constant: a different page must produce a
// hash the publisher's own bytes cannot match.
const other = await pub('acme/one', 'all', '<h1>SOMEONE ELSE’S BUILD</h1>');
t('a different body yields a different hash', other.hash !== one.hash);
t('the publisher can detect a mismatch', other.hash !== sha256(page));

// Dedupe must not weaken the claim — a republish of identical bytes still names them, or "unchanged"
// becomes a way to report success about content nobody verified.
const again = await pub('acme/one', 'all', page);
t('a deduped republish still returns the hash', again.deduped === true && again.hash === sha256(page));

// ── the host says when `latest` is shadowed ─────────────────────────────────
t('no live server registered means live:false', one.live === false);

// The endpoint takes the URL in the BODY, not the query — a dev server on loopback, which is the
// only thing this host will fetch by default.
const registered = await fetch(`${base}/api/live?repo=acme/one&slug=all`, {
  method: 'POST',
  headers: { authorization: 'Bearer T', 'content-type': 'application/json' },
  body: JSON.stringify({ url: 'http://127.0.0.1:1/' }),
});
t('a live member can be registered', registered.ok, `HTTP ${registered.status}`);

const shadowed = await pub('acme/one', 'all', '<h1>PUBLISHED WHILE LIVE</h1>');
t('a publish made while a dev server is live says so', shadowed.live === true);
t('…and still names the bytes it stored', shadowed.hash === sha256('<h1>PUBLISHED WHILE LIVE</h1>'));

await fetch(`${base}/api/live/off?repo=acme/one&slug=all`, { method: 'POST', headers: { authorization: 'Bearer T' } });
const after = await pub('acme/one', 'all', '<h1>AFTER THE DEV SERVER STOPPED</h1>');
t('live:false again once the dev server deregisters', after.live === false);

host.server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
