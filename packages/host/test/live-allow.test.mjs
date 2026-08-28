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
