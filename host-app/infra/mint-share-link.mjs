#!/usr/bin/env node
// `mint-share-link` — hand somebody one record without handing them the repo.
//
// THE HASHES ARE NOT HAND-WRITABLE, which is the only reason this script exists — the same reason
// `motu-host access` exists on the host side. `share_links` stores a sha256 digest, so a backup of
// this database is not a set of working links, and asking somebody to produce one with an openssl
// incantation is asking them to skip the feature.
//
// THE TOKEN IS PRINTED ONCE and never stored. The row keeps only its digest, so there is nothing here
// to read it back from. That is the point, and it is worth saying at the moment somebody decides
// whether to copy it.
//
//   node infra/mint-share-link.mjs --repo acme/web --sha abc123 --slug cart --expires 7d
//   node infra/mint-share-link.mjs --repo acme/web --never          # the whole project, forever
//   node infra/mint-share-link.mjs --revoke <token>
import { randomBytes, createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));

/** `.env.local` first, then `.env.example`, so this works on a fresh checkout. */
function env(name) {
  if (process.env[name]) return process.env[name];
  for (const file of ['.env.local', '.env.example']) {
    const path = resolve(here, '..', file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && m[1] === name) return m[2];
    }
  }
  return undefined;
}

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const next = argv[i + 1];
  return next === undefined || next.startsWith('--') ? true : next;
};

/** `7d`, `12h`, `30m` — a duration, or nothing. Bare numbers are refused: a unit is a decision. */
function parseDuration(raw) {
  const m = /^(\d+)([mhd])$/.exec(String(raw));
  if (!m) return null;
  const n = Number(m[1]);
  return n * ({ m: 60_000, h: 3_600_000, d: 86_400_000 })[m[2]];
}

const repo = flag('repo');
const revoke = flag('revoke');
const expires = flag('expires');
const never = flag('never') === true;

if (!repo && !revoke) {
  console.error(
    'usage:\n' +
      '  --repo <owner/name> [--sha <ref>] [--slug <slug>] (--expires 7d | --never)\n' +
      '  --revoke <token>\n',
  );
  process.exit(1);
}

const connectionString = env('DATABASE_URL');
if (!connectionString) {
  console.error('✗ DATABASE_URL is not set — copy .env.example to .env.local');
  process.exit(1);
}
const client = new pg.Client({ connectionString });
await client.connect();

const hashOf = (token) => createHash('sha256').update(String(token), 'utf8').digest('hex');

try {
  if (revoke) {
    // REVOKING TAKES THE TOKEN, not the id, because the token is what whoever asks you to revoke it
    // will have. It is idempotent and it does not delete the row: a revoked link that is still on
    // record is the difference between "this was turned off" and "this never existed".
    const { rowCount } = await client.query(
      'update share_links set revoked_at = now() where token_hash = $1 and revoked_at is null',
      [hashOf(revoke)],
    );
    console.log(rowCount ? '✓ revoked' : '· nothing to revoke (unknown token, or already revoked)');
    process.exit(0);
  }

  if (!never && !expires) {
    // A PERMANENT BEARER CREDENTIAL IS A DECISION. The column is nullable and the code treats null as
    // "no expiry", so the only thing standing between a careless invocation and a link that works
    // forever is having to say so.
    console.error('✗ pass --expires <7d|12h|30m> or --never. A link with no expiry is a decision.');
    process.exit(1);
  }
  const ms = never ? null : parseDuration(expires);
  if (!never && ms === null) {
    console.error(`✗ --expires wants a duration like 7d, 12h or 30m, got "${expires}"`);
    process.exit(1);
  }

  const project = await client.query('select id from projects where repo = $1', [repo]);
  if (!project.rowCount) {
    // A link to a project the app has never heard of would be answered by `abstain` — the host's own
    // gate, which knows nothing about share links. Refusing here says so before somebody sends it.
    console.error(`✗ no project row for "${repo}". Add it first, or this link resolves to nothing.`);
    process.exit(1);
  }

  const sha = typeof flag('sha') === 'string' ? flag('sha') : null;
  const slug = typeof flag('slug') === 'string' ? flag('slug') : null;
  const token = randomBytes(24).toString('base64url');

  await client.query(
    `insert into share_links (project_id, sha, slug, token_hash, expires_at)
     values ($1, $2, $3, $4, $5)`,
    [project.rows[0].id, sha, slug, hashOf(token), ms === null ? null : new Date(Date.now() + ms)],
  );

  const scope = sha || slug ? `${sha ?? '<any ref>'}/${slug ?? '<any slug>'}` : 'the WHOLE project';
  const base = (env('MOTU_HOST_PUBLIC_URL') || 'http://127.0.0.1:8817').replace(/\/+$/, '');
  console.log(`✓ minted a share link for ${repo} — ${scope}`);
  console.log(`  expires: ${ms === null ? 'never' : new Date(Date.now() + ms).toISOString()}`);
  console.log(`\n  ${base}/${repo}/${sha ?? 'latest'}/${slug ?? 'all'}?k=${token}\n`);
  console.log('  printed once — the database keeps only its digest.');
  if (!sha && !slug) console.log('  NOTE: whole-project links should be rare. This one opens every record.');
} finally {
  await client.end();
}
