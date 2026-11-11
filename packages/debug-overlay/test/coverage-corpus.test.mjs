// Asking the host for a region's production corpus — the two absences, and whose fetch asks.
//
// Both were real. The section VANISHED when the host had no corpus, so "coverage is on and nothing
// ever arrived" read exactly like "coverage is off" on the first project that switched it on. And
// that project's lagoon claims `/api/` for its own mock backend, so the lens's request for the corpus
// was answered by the app's mock with a 404 — the corpus could never have shown, whatever the host held.
import test from 'node:test';
import assert from 'node:assert/strict';

const asked = [];
// A page served by a host stamps its repo; the lens reads it from there.
globalThis.document = { querySelector: () => ({ content: 'acme/web' }) };
// The APPLICATION's fetch claims everything, as Peps' lagoon claims `/api/`.
globalThis.fetch = async (url) => {
  asked.push(['app', String(url)]);
  return new Response('{"error":"no fixture"}', { status: 404 });
};
// The browser's own fetch, kept aside by the fake-fetch installer.
globalThis.__motuNativeFetch = async (url) => {
  asked.push(['native', String(url)]);
  return String(url).includes('region=empty')
    ? new Response('{"error":"no corpus here"}', { status: 404 })
    : String(url).includes('region=down')
      ? Promise.reject(new TypeError('fetch failed'))
      : new Response(JSON.stringify({ corpus: { v: 1, regionId: 'members', keys: ['busy'], entries: [{ fingerprint: { busy: 'true' }, count: 3 }] } }), { status: 200 });
};

const { ensureCorpus, corpusFor, corpusMissing } = await import('../dist/coverage.js');
const settle = () => new Promise((r) => setTimeout(r, 10));

test('the corpus is asked of the host with the browser’s fetch, not the application’s mock', async () => {
  ensureCorpus('members');
  await settle();
  assert.deepEqual(asked.map(([who]) => who), ['native']);
  assert.equal(corpusFor('members')?.entries.length, 1);
  assert.equal(corpusMissing('members'), null);
});

test('a host that answered and holds nothing is "none" — said, not hidden', async () => {
  ensureCorpus('empty');
  await settle();
  assert.equal(corpusFor('empty'), null);
  assert.equal(corpusMissing('empty'), 'none');
});

test('a host that could not be asked is a different absence', async () => {
  ensureCorpus('down');
  await settle();
  assert.equal(corpusMissing('down'), 'unreachable');
});
