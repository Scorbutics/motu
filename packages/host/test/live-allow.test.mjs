// The registry's URL rule, which decides what this host will FETCH.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TOKEN = 'test-token';
function startHost(env) {
  const dir = mkdtempSync(join(tmpdir(), 'motu-live-'));
  const child = spawn(process.execPath, [new URL('../src/cli.mjs', import.meta.url).pathname, '--port', '8931'], {
    env: { ...process.env, MOTU_HOST_DIR: dir, MOTU_HOST_TOKEN: TOKEN, PORT: '8931', ...env },
    stdio: 'ignore',
  });
  return child;
}
const post = async (path, init = {}) => {
  const res = await fetch(`http://127.0.0.1:8931${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, ...(init.headers ?? {}) },
    body: init.body,
  });
  return res;
};
const announce = async (url) => {
  const res = await fetch('http://127.0.0.1:8931/api/live?repo=a/b&slug=all', {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  return res.status;
};

test('the allowlist widens the rule without opening it', async (t) => {
  const child = startHost({ MOTU_LIVE_ALLOW: '.tailnet.ts.net,laptop.lan' });
  t.after(() => child.kill());
  await new Promise((r) => setTimeout(r, 900));

  assert.equal(await announce('http://127.0.0.1:8901'), 200, 'loopback is always allowed');
  assert.equal(await announce('https://box.tailnet.ts.net:8901'), 200, 'a suffix on the list');
  assert.equal(await announce('http://laptop.lan:8901'), 200, 'an exact name on the list');

  assert.equal(await announce('http://192.168.20.8:8901'), 400, 'a LAN address nobody named');
  assert.equal(await announce('http://evil.example.com/'), 400, 'anything not on the list');
  assert.equal(await announce('http://tailnet.ts.net.evil.com/'), 400, 'a suffix must END the name');
  // THE ONE THAT MATTERS. A broad suffix must not be able to open cloud metadata.
  assert.equal(await announce('http://169.254.169.254/latest/meta-data/'), 400, 'metadata, never');
  assert.equal(await announce('http://0.0.0.0:8901'), 400, '"this machine", spelled differently');
  assert.equal(await announce('file:///etc/passwd'), 400, 'not even a fetchable scheme');
});

test('with no allowlist the rule is exactly what it was', async (t) => {
  const child = startHost({});
  t.after(() => child.kill());
  await new Promise((r) => setTimeout(r, 900));
  assert.equal(await announce('http://127.0.0.1:8901'), 200);
  assert.equal(await announce('https://box.tailnet.ts.net:8901'), 400, 'unset means loopback only');
});

test('a pushed draft is held, served and cleared', async (t) => {
  const child = startHost({});
  t.after(() => child.kill());
  await new Promise((r) => setTimeout(r, 900));

  const qs = 'repo=a/b&slug=all';
  // A DRAFT NEEDS BYTES. An empty push is a mistake, not an erasure — `/api/live/off` is erasure.
  assert.equal((await post(`/api/live/draft?${qs}`, { body: '' })).status, 400);

  const page = '<!doctype html><html><body>draft one</body></html>';
  const first = await post(`/api/live/draft?${qs}`, {
    headers: { 'content-type': 'text/html' },
    body: page,
  });
  assert.equal(first.status, 200);
  assert.equal((await first.json()).bytes, page.length);

  // IT IS LISTED AS A DRAFT, with no url — a viewer cannot tell push from pull and neither can the
  // listing's consumer, except by that one field.
  const listed = await (await fetch('http://127.0.0.1:8931/api/live')).json();
  assert.equal(listed.live.length, 1);
  assert.equal(listed.live[0].draft, true);
  assert.equal(listed.live[0].url, undefined);

  // A TOUCH KEEPS IT ALIVE WITHOUT RE-SENDING IT. Half a megabyte every thirty seconds to say
  // "still here" is the thing this exists to avoid.
  assert.equal((await post(`/api/live/draft?${qs}&touch=1`)).status, 200);
  // ...and a touch for a draft that was never sent is a 404, not a silent success: it would otherwise
  // report a live lagoon that has no bytes behind it.
  assert.equal((await post('/api/live/draft?repo=c/d&slug=all&touch=1')).status, 404);

  // ONE STOP CLEARS BOTH KINDS, because to a viewer they were the same thing.
  assert.equal((await post(`/api/live/off?${qs}`)).status, 200);
  assert.deepEqual((await (await fetch('http://127.0.0.1:8931/api/live')).json()).live, []);
});

test('a touch tells a live server its draft is gone, so it can send it again', async (t) => {
  const child = startHost({});
  t.after(() => child.kill());
  await new Promise((r) => setTimeout(r, 900));

  const qs = 'repo=a/b&slug=all';
  await post(`/api/live/draft?${qs}`, { headers: { 'content-type': 'text/html' }, body: '<html>one</html>' });
  assert.equal((await post(`/api/live/draft?${qs}&touch=1`)).status, 200, 'held: a touch keeps it');

  // WHAT A HOST RESTART LOOKS LIKE from the CLI's side. Drafts live in memory, so a restart — or the
  // 32-draft cap evicting the least recently refreshed — forgets one while the dev server it belongs
  // to is still running. The 404 is the only signal that happens, and the CLI re-pushes on it.
  // Without that the lagoon goes dark until somebody saves a file, and nothing says why.
  await post(`/api/live/off?${qs}`);
  assert.equal((await post(`/api/live/draft?${qs}&touch=1`)).status, 404, 'gone: a touch must SAY so');

  // ...and sending it again restores it, which is what the CLI does with that 404.
  assert.equal(
    (await post(`/api/live/draft?${qs}`, { headers: { 'content-type': 'text/html' }, body: '<html>two</html>' })).status,
    200,
  );
  assert.equal((await post(`/api/live/draft?${qs}&touch=1`)).status, 200, 'held again');
});
