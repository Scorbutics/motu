#!/usr/bin/env node
// DOES A REAL APPLICATION'S LAGOON STILL BOOT, AND IS IT STILL LIVE?
//
//   node scripts/smoke-live.mjs [--project <dir>] [--keep]
//
// Boots the project's lagoon, waits for it to serve, and asserts the whole live chain: the page, the
// dev server's own module graph, and the HMR WebSocket upgrade through the lagoon host.
//
// WHY A SECOND SMOKE TEST, AND WHY THIS PROJECT. `smoke-scaffold.mjs` covers what `motu init` GENERATES
// — a fresh, minimal, motu-shaped app. It cannot cover what an existing application IS. Measured, an
// hour after it was written: feeding the host's tsconfig `paths` into Vite's aliases mapped `react`
// onto a `.d.ts` (a common and correct type-only mapping) and killed the dev server at startup.
// `motu check` stayed green. The scaffolder smoke test stayed green. All four cold-start bench
// repositories would have stayed green — none of them maps `react` in tsconfig. The bug was found by
// a person opening a URL on their phone and seeing a 404.
//
// So the target is deliberately a REAL, IN-USE project rather than a fixture: a Next host with a
// vendored motu, forty islands, several archipelagos, and a tsconfig full of type-only path mappings.
// Every one of those is a shape no fixture here has, and each has now broken something.
//
// Skips rather than fails when the project or the host is absent — this runs on machines that have
// neither, and a check that cannot look must not claim to have looked.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { resolve } from 'node:path';
import { homedir } from 'node:os';

const args = process.argv.slice(2);
const flag = (n) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? null : (args[i + 1] ?? true);
};
const PROJECT = String(flag('project') ?? resolve(homedir(), 'dev/peps_ta_boite/motu'));
const CLI = resolve(import.meta.dirname, '../packages/cli/src/cli.mjs');

const skip = (why) => {
  console.log(`\x1b[2m– smoke-live skipped: ${why}\x1b[0m`);
  process.exit(0);
};

if (!existsSync(resolve(PROJECT, 'motu.config.json'))) skip(`no motu project at ${PROJECT}`);

let hostCfg;
try {
  hostCfg = JSON.parse(readFileSync(resolve(homedir(), '.config/motu/host.json'), 'utf8'));
} catch {
  skip('no lagoon host configured (~/.config/motu/host.json)');
}
const HOST = String(hostCfg.url ?? '').replace(/\/+$/, '');
try {
  execFileSync('curl', ['-sf', '-o', '/dev/null', '--max-time', '3', `${HOST}/`]);
} catch {
  skip(`lagoon host not reachable at ${HOST}`);
}

/** The member address this project announces itself under — repo from config or git, slug `all`. */
function memberPath() {
  const cfg = JSON.parse(readFileSync(resolve(PROJECT, 'motu.config.json'), 'utf8'));
  if (cfg.publishAs?.repo) return `/${cfg.publishAs.repo}/latest/${cfg.publishAs.slug ?? 'all'}`;
  const url = execFileSync('git', ['-C', PROJECT, 'remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
  const m = url.match(/[:/]([^/:]+)\/([^/]+?)(?:\.git)?$/);
  if (!m) skip('cannot derive the repo id from git');
  return `/${m[1]}/${m[2]}/latest/all`;
}

const member = memberPath();
const base = `${HOST}${member}`;

// POLLING, because this runs on repositories big enough to exhaust the machine's inotify watches —
// which is itself a bug this suite exists downstream of.
const dev = spawn('node', [CLI, 'lagoon', 'dev'], {
  cwd: PROJECT,
  env: { ...process.env, MOTU_WATCH_POLL: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let devOut = '';
dev.stdout.on('data', (d) => (devOut += d));
dev.stderr.on('data', (d) => (devOut += d));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const http = (url) => {
  try {
    return Number(execFileSync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '10', url], { encoding: 'utf8' }));
  } catch {
    return 0;
  }
};

/** A raw upgrade against the host, so a proxy that answers HTTP but not WebSocket is visible. */
function upgrades(path) {
  return new Promise((done) => {
    const u = new URL(HOST);
    const s = connect({ host: u.hostname, port: Number(u.port || 80) }, () => {
      s.write(
        `GET ${path} HTTP/1.1\r\nHost: ${u.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
          'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n' +
          'Sec-WebSocket-Protocol: vite-hmr\r\n\r\n',
      );
    });
    let out = '';
    const finish = (ok) => {
      s.destroy();
      done(ok);
    };
    s.on('data', (d) => {
      out += d.toString('latin1');
      if (out.includes('\r\n')) finish(/ 101 /.test(out.split('\r\n')[0]));
    });
    s.setTimeout(10_000, () => finish(false));
    s.on('error', () => finish(false));
  });
}

const failures = [];
try {
  // The host registers on a heartbeat, so wait for the member rather than a fixed sleep.
  let ready = false;
  for (let i = 0; i < 60 && !ready; i++) {
    await sleep(2000);
    ready = http(`${base}/`) === 200;
  }
  if (!ready) {
    failures.push(`the lagoon never became live at ${base}/\n${devOut.split('\n').slice(-12).join('\n')}`);
  } else {
    console.log(`  \x1b[32m✓\x1b[0m the page is live at ${base}/`);
    // THE MODULE GRAPH, not just the page. A published lagoon is one self-contained file, so a page
    // that loads proves nothing about a DEV server: its assets are separate requests, and they were
    // 404ing through the host while the page was fine.
    for (const asset of ['/@vite/client', '/@react-refresh']) {
      const code = http(`${base}${asset}`);
      const ok = code === 200;
      console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${asset} → ${code}`);
      if (!ok) failures.push(`${asset} answered ${code} through the host`);
    }
    const hot = await upgrades(`${member}/__motu_hmr`);
    console.log(`  ${hot ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} the HMR socket upgrades`);
    if (!hot) failures.push('the HMR WebSocket did not upgrade through the host');
  }
} finally {
  if (!args.includes('--keep')) dev.kill('SIGTERM');
}

console.log('');
if (failures.length) {
  for (const f of failures) console.log(`\x1b[31m${f}\x1b[0m`);
  console.log(`\x1b[31m\x1b[1mFAIL\x1b[0m  the live lagoon is broken for ${PROJECT}`);
  process.exit(1);
}
console.log(`\x1b[32m\x1b[1mPASS\x1b[0m  ${PROJECT} boots, serves its module graph, and is hot`);
