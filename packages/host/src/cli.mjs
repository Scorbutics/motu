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

  ${color.dim('$MOTU_LIVE_ALLOW     hosts a live lagoon may be announced from, beyond loopback')}
  ${color.dim('  comma-separated; a leading dot is a suffix. Unset = loopback only.')}
  ${color.dim('  MOTU_LIVE_ALLOW=.my-tailnet.ts.net,192.168.1.20')}
  ${color.dim('  This host FETCHES what it is told, so every name here is one it can be aimed at.')}
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
// `motu-host access` — mint a credential, or make a repo private.
//
// THE HASHES ARE NOT HAND-WRITABLE, which is the only reason this subcommand exists. access.json
// stores sha256 digests so a backup of a preview server is not a credential leak, and asking somebody
// to produce one with an openssl incantation is asking them to skip the feature.
//
// The secret is printed ONCE and never stored — the file keeps only its digest, so there is nothing
// here to read it back from. That is the point, and it is worth saying out loud at the moment
// somebody is deciding whether to copy it.
if (argv._[0] === 'access') {
  const { digest, loadAccess } = await import('./access.mjs');
  const { randomBytes } = await import('node:crypto');
  const { writeFileSync, mkdirSync, existsSync } = await import('node:fs');
  const { homedir } = await import('node:os');
  const { resolve } = await import('node:path');
  const { storeDir } = await import('./store.mjs');
  const dir = storeDir(typeof argv.dir === 'string' ? argv.dir : undefined);

  // IS THIS THE DIRECTORY THE RUNNING HOST READS? Almost the only way to get this wrong, and it fails
  // silently: the policy is written, the command says ✓, and nothing changes.
  //
  // It happened. The service sets MOTU_HOST_DIR in its unit file, which is not in a shell's
  // environment — so `motu-host access --repo X --private` resolved the DEFAULT `~/.motu/host`,
  // created it, wrote a correct policy into it, and reported success while the live host at
  // ~/.local/share/motu-host went on serving the repo to everyone. Sharing `storeDir()` between the
  // two was not enough, because what differs is the ENVIRONMENT, not the expression.
  //
  // `index.json` is the store's own file, so its absence means this directory is not a store — either
  // the wrong one, or a host that has never run. Refused rather than warned: a warning above a ✓ is
  // read as a ✓, and the whole failure mode here is a command that looks like it worked.
  if (!existsSync(resolve(dir, 'index.json'))) {
    const guesses = [
      process.env.MOTU_HOST_DIR,
      resolve(homedir(), '.local/share/motu-host'),
      resolve(homedir(), '.motu/host'),
    ].filter((d, i, all) => d && all.indexOf(d) === i && existsSync(resolve(d, 'index.json')));
    console.error(color.red(`✗ no lagoon host store in ${dir}`));
    console.error(color.dim('  There is no index.json there, so this is not the directory a host is using — and'));
    console.error(color.dim('  writing a policy into it would report success and change nothing.'));
    if (guesses.length) {
      console.error('');
      console.error(color.dim('  A store does exist here:'));
      for (const g of guesses) console.error(`      --dir ${g}`);
      console.error('');
      console.error(color.dim('  The service sets MOTU_HOST_DIR in its unit file, which your shell does not inherit.'));
    } else {
      console.error(color.dim('  Pass --dir <path>, or set MOTU_HOST_DIR to the directory the host runs with.'));
    }
    process.exit(1);
  }

  const file = resolve(dir, 'access.json');
  const access = loadAccess(dir);
  if (access.malformed) {
    console.error(color.red(`✗ ${file} is not valid JSON — refusing to overwrite it`));
    process.exit(1);
  }
  // CARRY WHAT WE ARE NOT CHANGING. This object REPLACES the file, so a key omitted here is a key
  // deleted — and the one that matters is `defaultVisibility`: minting a read token would have
  // silently reopened every repo on the host.
  const out = { readHash: access.readHash, defaultVisibility: access.defaultVisibility, repos: { ...access.repos } };
  const repo = typeof argv.repo === 'string' ? argv.repo : null;
  const minted = [];

  if (argv.read) {
    const secret = randomBytes(32).toString('hex');
    if (repo) {
      // `--read --repo X` is the NARROW one: it opens that repo and nothing else. This is what an
      // application holds so it can read back its own accepted set, and what you hand somebody who
      // should see one project rather than all of them.
      out.repos[repo] = { ...(out.repos[repo] ?? {}), readHash: digest(secret).toString('hex') };
      minted.push([`read token for ${repo} (that repo only)`, secret]);
    } else {
      out.readHash = digest(secret).toString('hex');
      minted.push(['read secret (opens EVERY private lagoon — for your browser, not an app)', secret]);
    }
  }
  if (argv.ingest) {
    if (!repo) {
      console.error(color.red('✗ --ingest needs --repo <owner/name>: an ingest token grants exactly one repo'));
      process.exit(1);
    }
    const secret = randomBytes(32).toString('hex');
    out.repos[repo] = { ...(out.repos[repo] ?? {}), ingestHash: digest(secret).toString('hex') };
    minted.push([`ingest token for ${repo}`, secret]);
  }
  if (argv.private || argv.public) {
    if (!repo) {
      console.error(color.red('✗ --private/--public needs --repo <owner/name>'));
      process.exit(1);
    }
    out.repos[repo] = { ...(out.repos[repo] ?? {}), visibility: argv.private ? 'private' : 'public' };
  }
  // WHICH WAY A REPO NOBODY HAS DECIDED ABOUT LEANS. Its own switch rather than a spelling of
  // --private, because it is a different act: --private closes ONE repo that already exists, this
  // decides what happens to every repo that does NOT exist yet — including the ones an agent is
  // about to create by publishing to them.
  let defaultChanged = false;
  if (argv.default !== undefined) {
    const want = String(argv.default);
    if (want !== 'private' && want !== 'public') {
      console.error(color.red(`✗ --default takes private or public, got "${want}"`));
      process.exit(1);
    }
    defaultChanged = out.defaultVisibility !== want;
    out.defaultVisibility = want;
  }
  if (!minted.length && !argv.private && !argv.public && argv.default === undefined) {
    console.log('');
    console.log('  motu-host access --read                      mint the secret that opens EVERY private lagoon');
    console.log('  motu-host access --repo <r> --read           mint one that opens only that repo');
    console.log('  motu-host access --repo <r> --ingest         mint a write-only coverage token for one repo');
    console.log('  motu-host access --repo <r> --private        stop serving that repo to strangers');
    console.log('  motu-host access --repo <r> --public         serve it again');
    console.log('  motu-host access --default private           close every repo nobody decided about');
    console.log('');
    const names = Object.keys(access.repos);
    console.log(color.dim(`  ${file}`));
    console.log(color.dim(`  ${names.length} repo(s) with a policy${names.length ? `: ${names.join(', ')}` : ''}`));
    // SAID OUT LOUD, because "no policy" reads as public and is the one thing here nobody can infer
    // from the repo list — a host leaning private lists nothing and serves nothing to strangers.
    console.log(
      access.defaultVisibility === 'private'
        ? color.dim('  default for a repo with no policy: PRIVATE — including ones not published yet')
        : color.dim('  default for a repo with no policy: public  (motu-host access --default private)'),
    );
    console.log(color.dim(`  read secret ${access.readHash ? 'set' : 'NOT set — every private lagoon is closed to everyone but the admin token'}`));
    process.exit(0);
  }

  mkdirSync(dir, { recursive: true });
  writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
  console.log('');
  for (const [what, secret] of minted) {
    console.log(`  ${color.green('✓')} ${what}`);
    console.log(`    ${secret}`);
  }
  if (argv.private) console.log(`  ${color.green('✓')} ${repo} is private — strangers get 404, not 403`);
  if (argv.public) console.log(`  ${color.green('✓')} ${repo} is public`);
  if (argv.default !== undefined) {
    const now = out.defaultVisibility;
    console.log(
      `  ${color.green('✓')} repos with no policy of their own are ${now.toUpperCase()}${defaultChanged ? '' : ' (unchanged)'}`,
    );
    if (now === 'private')
      console.log(color.dim('    a publish now creates a CLOSED repo — mint a reader with --read, then visit /?k=<secret> once'));
  }
  if (minted.length) {
    console.log('');
    console.log(color.dim('  Shown once. Only the digest is stored, so this cannot be read back — mint a new one if it is lost.'));
    if (argv.read) console.log(color.dim('  A reader opens a private link by visiting it with ?k=<secret> once.'));
  }
  console.log(color.dim(`  ${file}`));
  console.log('');
  process.exit(0);
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
  // SAID EVERY START, because this one is easy to leave on. It only ever answers an unproxied
  // loopback request, so it cannot be reached through a tunnel — but an operator who forgot it is set
  // should be reminded by the thing they look at when they start the host.
  if (process.env.MOTU_HOST_OPEN_LOCAL === '1')
    console.log(
      color.yellow('  MOTU_HOST_OPEN_LOCAL=1 — private repos are READABLE by unproxied requests from this machine.'),
    );
  console.log('');
  console.log(color.dim('  Publish into it:  motu lagoon publish --remote http://localhost:' + port));
  console.log(color.dim('  Ctrl-C to stop.'));
});
