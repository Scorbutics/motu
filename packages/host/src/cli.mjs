#!/usr/bin/env node
// `motu-host` — run the lagoon host.
//
// Its own binary, not `motu lagoon host`, and that is a boundary rather than a convenience: every
// `motu` subcommand resolves ONE project's motu.config.json at import time, and this process serves
// many repositories and belongs to none of them.
//
//   motu-host --token $(openssl rand -hex 24)     accept uploads, serve on 127.0.0.1:8818
//   motu-host --host --max-records 1000           bind the LAN too, keep 1000 records per repo
//
// Reads are open; uploads need the token. Without one the host still serves what it already holds
// and refuses every write, which is the right shape for putting a read-only mirror somewhere.
import { networkInterfaces } from 'node:os';
import { createLagoonHost } from './server.mjs';
import { DEFAULT_MAX_RECORDS, DEFAULT_MAX_BYTES } from './store.mjs';

const color = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

function parse(args) {
  const out = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--no-')) out[a.slice(5)] = false;
    else if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        out[key] = next;
        i++;
      } else out[key] = true;
    } else out._.push(a);
  }
  return out;
}

const argv = parse(process.argv.slice(2));

if (argv.help || argv.h) {
  console.log(`${color.bold('motu-host')} — serve published lagoons

  --port <n>            default 8818
  --host                also bind 0.0.0.0 (LAN), not just loopback
  --dir <path>          store location (default $MOTU_HOST_DIR or ~/.motu/host)
  --max-records <n>     publish records kept per repo (default ${DEFAULT_MAX_RECORDS})
  --max-bytes <n>       bytes kept per repo (default ${(DEFAULT_MAX_BYTES / 1073741824).toFixed(0)} GB) — whichever cap binds first wins
  --token <secret>      required for uploads (or $MOTU_HOST_TOKEN)
`);
  process.exit(0);
}

const port = Number.parseInt(String(argv.port ?? 8818), 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(color.red(`✗ --port must be 1-65535, got "${argv.port}"`));
  process.exit(1);
}
const maxRecords = Number.parseInt(String(argv['max-records'] ?? process.env.MOTU_HOST_MAX_RECORDS ?? DEFAULT_MAX_RECORDS), 10);
if (!Number.isInteger(maxRecords) || maxRecords < 1) {
  console.error(color.red(`✗ --max-records must be a positive integer, got "${argv['max-records']}"`));
  process.exit(1);
}
const maxBytes = Number.parseInt(String(argv['max-bytes'] ?? process.env.MOTU_HOST_MAX_BYTES ?? DEFAULT_MAX_BYTES), 10);
if (!Number.isInteger(maxBytes) || maxBytes < 1) {
  console.error(color.red(`✗ --max-bytes must be a positive integer, got "${argv['max-bytes']}"`));
  process.exit(1);
}
const token = typeof argv.token === 'string' ? argv.token : process.env.MOTU_HOST_TOKEN || null;
const lan = argv.host === true || argv.host === '0.0.0.0';
const bind = lan ? '0.0.0.0' : '127.0.0.1';

const { server, store } = createLagoonHost({ dir: typeof argv.dir === 'string' ? argv.dir : undefined, maxRecords, maxBytes, token });

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') console.error(color.red(`✗ port ${port} is already in use — pass --port <n>`));
  else if (err.code === 'EACCES') console.error(color.red(`✗ not allowed to bind port ${port} — pick one above 1024`));
  else console.error(color.red(`✗ ${err.message}`));
  process.exit(1);
});

function lanAddress() {
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    if (/^(docker|br-|veth|virbr|tun|tap)/.test(name)) continue;
    for (const a of addrs ?? []) if (a.family === 'IPv4' && !a.internal) return a.address;
  }
  return null;
}

server.listen(port, bind, () => {
  const s = store.stats();
  console.log('');
  console.log(`${color.green('✓')} ${color.bold('motu lagoon host')} — ${s.repos} repo(s), ${s.blobs} object(s), ${(s.bytes / 1048576).toFixed(1)} MB`);
  console.log(`  http://localhost:${port}`);
  const ip = lan ? lanAddress() : null;
  if (ip) console.log(`  http://${ip}:${port}   ${color.dim('(LAN)')}`);
  console.log(color.dim(`  store ${s.root} · cap ${maxRecords} records or ${(maxBytes / 1073741824).toFixed(0)} GB per repo`));
  if (!token) console.log(color.yellow('  no token — uploads are refused. Pass --token or set MOTU_HOST_TOKEN.'));
  console.log('');
  console.log(color.dim('  Publish into it:  motu lagoon publish --remote http://localhost:' + port));
  console.log(color.dim('  Ctrl-C to stop.'));
});
