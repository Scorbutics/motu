// Production coverage, end to end: a real lagoon host, an application route built from the real
// forwarder, and `motu coverage init | doctor | pull` run as the CLI an agent runs.
//
// Each case is a way coverage was silently not working on the first project that switched it on —
// the host had never stored a corpus — or one of the two shapes that fix it: ONE secret in forward
// mode (the repo read from the token), and NO secret in log mode (a server with no outbound network).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createLagoonHost } from '../../host/src/server.mjs';
import { handleCoverage } from '../../coverage/dist/server/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(here, '../src/cli.mjs');
const REPO_ROOT = resolve(here, '../../..'); // the demo's motu.config.json lives here
const ADMIN = 'ADMIN-TOKEN';
const tmp = mkdtempSync(resolve(tmpdir(), 'motu-coverage-'));
const state = resolve(tmp, 'pulled.json');

let host, hostUrl, app, appUrl;
/** What the application route does — swapped per case, exactly as a deployment's config would be. */
let routeOpts = {};
const logged = [];

const listen = (server) => new Promise((r) => server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${server.address().port}`)));

before(async () => {
  host = createLagoonHost({ dir: resolve(tmp, 'host'), token: ADMIN }).server;
  hostUrl = await listen(host);
  // A stand-in for any application server: Node here, a JBoss or a PHP server elsewhere. Only the
  // route matters, and it is the real one.
  app = createServer(async (req, res) => {
    if (req.url !== '/api/motu/coverage') return void res.writeHead(404).end();
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const request = new Request(`http://app${req.url}`, { method: req.method, headers: req.headers, body: req.method === 'POST' ? Buffer.concat(chunks) : undefined });
    const out = await handleCoverage(request, { ...routeOpts, log: (l) => logged.push(l) });
    res.writeHead(out.status, Object.fromEntries(out.headers));
    res.end(Buffer.from(await out.arrayBuffer()));
  });
  appUrl = await listen(app);
});

after(() => {
  host.close();
  app.close();
  rmSync(tmp, { recursive: true, force: true });
});

// ASYNC, not spawnSync: the host and the application route live in THIS process, and a synchronous
// child would block the very event loop that has to answer it.
const motu = (args) =>
  new Promise((done) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      cwd: REPO_ROOT,
      env: { ...process.env, MOTU_HOST_URL: hostUrl, MOTU_HOST_TOKEN: ADMIN, MOTU_COVERAGE_PULL_STATE: state, MOTU_CONFIG_HOME: tmp, NO_COLOR: '1' },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => {
      let json = null;
      try {
        json = JSON.parse(stdout);
      } catch {
        /* not every case prints JSON */
      }
      done({ code, json, out: stdout + stderr });
    });
  });
const doctor = async (...extra) => motu(['coverage', 'doctor', '--url', appUrl, '--endpoint', '/api/motu/coverage', '--region', 'members', '--json', ...extra]);

let token;
test('init mints the one secret over the admin API', async () => {
  const r = await motu(['coverage', 'init', '--json']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.json.token ?? '', /^[0-9a-f]{64}$/);
  assert.equal(r.json.repo, 'Scorbutics/motu-demo-app');
  token = r.json.token;
});

test('forward mode with ONE secret: the host reads the repo from the token', async () => {
  routeOpts = { host: hostUrl, token }; // no repo
  const r = await doctor();
  assert.equal(r.code, 0, r.out);
  assert.equal(r.json.hop, 'forwarded');
});

test('the dry run stores nothing', async () => {
  const res = await fetch(`${hostUrl}/api/coverage?repo=Scorbutics/motu-demo-app&region=members`);
  assert.equal(res.status, 404);
});

test('a missing token names itself (503)', async () => {
  routeOpts = { host: hostUrl, token: '' };
  const r = await doctor();
  assert.equal(r.code, 1);
  assert.equal(r.json.hop, 'route not configured');
  assert.match(r.json.detail, /MOTU_COVERAGE_TOKEN/);
});

test('a wrong token is the host refusing it, not the route', async () => {
  routeOpts = { host: hostUrl, token: 'f'.repeat(64) };
  const r = await doctor();
  assert.equal(r.code, 1);
  assert.equal(r.json.hop, 'host refused the token');
});

test('a host the application cannot reach says so, with the cause', async () => {
  // A port that was open a moment ago and is not now — `fetch` refuses well-known ports like 9 outright.
  const gone = createServer();
  const goneUrl = await listen(gone);
  await new Promise((r) => gone.close(r));
  routeOpts = { host: goneUrl, token };
  const r = await doctor();
  assert.equal(r.code, 1);
  assert.equal(r.json.hop, 'host unreachable from the application');
  assert.match(r.json.detail, /ECONNREFUSED/);
});

test('a route that is not deployed is not the same as one that is misconfigured', async () => {
  const r = await motu(['coverage', 'doctor', '--url', appUrl, '--endpoint', '/nope', '--region', 'members', '--json']);
  assert.equal(r.code, 1);
  assert.equal(r.json.hop, 'route missing');
});

test('an application this machine cannot reach is exit 2 — could not run, do not repair', async () => {
  const r = await motu(['coverage', 'doctor', '--url', 'http://127.0.0.1:9', '--region', 'members', '--json']);
  assert.equal(r.code, 2);
});

test('log mode needs no secret and no network, and the doctor line is not a real report', async () => {
  routeOpts = { mode: 'log' };
  logged.length = 0;
  const r = await doctor();
  assert.equal(r.code, 0, r.out);
  assert.equal(r.json.hop, 'logged');
  assert.match(logged[0], /^motu-coverage-doctor \{/);
});

test('pull folds logged reports and uploads them; pulling the same log twice counts nothing twice', async () => {
  routeOpts = { mode: 'log' };
  logged.length = 0;
  const report = (busy, count) => ({ v: 1, regionId: 'members', keys: ['busy'], entries: [{ fingerprint: { busy }, count, firstAt: 1, lastAt: 2 }] });
  for (const body of [report('true', 3), report('false', 2)]) {
    await fetch(`${appUrl}/api/motu/coverage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  }
  // As a real log reads: timestamps and other lines around the ones that matter.
  const log = resolve(tmp, 'server.log');
  writeFileSync(log, ['12:00:01 INFO started', ...logged.map((l) => `12:00:02 INFO ${l}`), '12:00:03 WARN unrelated'].join('\n'));

  const first = await motu(['coverage', 'pull', '--from', log, '--json']);
  assert.equal(first.code, 0, first.out);
  assert.deepEqual(first.json.regions.map((r) => [r.region, r.states, r.uploaded]), [['members', 2, true]]);

  const stored = await (await fetch(`${hostUrl}/api/coverage?repo=Scorbutics/motu-demo-app&region=members`)).json();
  const counts = Object.fromEntries(stored.corpus.entries.map((e) => [e.fingerprint.busy, e.count]));
  assert.deepEqual(counts, { true: 3, false: 2 });

  const again = await motu(['coverage', 'pull', '--from', log, '--json']);
  assert.equal(again.code, 0, again.out);
  assert.equal(again.json.already, 2);
  const after = await (await fetch(`${hostUrl}/api/coverage?repo=Scorbutics/motu-demo-app&region=members`)).json();
  assert.deepEqual(Object.fromEntries(after.corpus.entries.map((e) => [e.fingerprint.busy, e.count])), { true: 3, false: 2 });
});

test('a log with no coverage lines is a finding, never a quiet success', async () => {
  const log = resolve(tmp, 'empty.log');
  writeFileSync(log, 'nothing here\n');
  const r = await motu(['coverage', 'pull', '--from', log, '--json']);
  assert.equal(r.code, 1);
});
