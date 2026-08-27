#!/usr/bin/env node
// Move the corpora on disk into `coverage_states`.
//
// WHY IT IS A SEPARATE STEP AND NOT A MIGRATION. Every other file in `migrations/` is SQL and knows
// only about the database. This one reads the lagoon host's store directory, which is not the
// database's business and is not the same thing on two machines.
//
// ORDER MATTERS. `/api/coverage` takes over per project — a repo with a `projects` row is served from
// rows, one without falls through to the host's files. So a project gains its row and its history in
// whichever order you like, but until this has run for it, its worklist reads as empty rather than
// wrong. Run it when you add the row.
//
// IT DOES NOT DELETE ANYTHING, and that is deliberate rather than timid. `--delete-after-import` is
// there and it is opt-in, because a corpus is the one thing in this system no rebuild recreates: it
// is a record of what production actually did. Verify the rows first, then delete on purpose.
//
//   node infra/import-coverage.mjs                     # every repo that has a projects row
//   node infra/import-coverage.mjs --repo acme/web
//   node infra/import-coverage.mjs --delete-after-import
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { fingerprintId } from '@motu/coverage';

const here = dirname(fileURLToPath(import.meta.url));

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
const flag = (n) => {
  const i = argv.indexOf(`--${n}`);
  if (i < 0) return undefined;
  const next = argv[i + 1];
  return next === undefined || next.startsWith('--') ? true : next;
};

const storeDir = env('MOTU_HOST_DIR') || resolve(homedir(), '.motu/host');
const coverageRoot = resolve(storeDir, 'coverage');
const onlyRepo = typeof flag('repo') === 'string' ? flag('repo') : null;
const deleteAfter = flag('delete-after-import') === true;

const connectionString = env('DATABASE_URL');
if (!connectionString) {
  console.error('✗ DATABASE_URL is not set — copy .env.example to .env.local');
  process.exit(1);
}
if (!existsSync(coverageRoot)) {
  console.log(`· nothing to import — ${coverageRoot} does not exist`);
  process.exit(0);
}

const client = new pg.Client({ connectionString });
await client.connect();

/** `coverage/<repo…>/<region>/<keysHash>.json`, where repo may be one or two segments. */
function* corpusFiles(dir, trail = []) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, name.name);
    if (name.isDirectory()) {
      yield* corpusFiles(path, [...trail, name.name]);
      continue;
    }
    // `.accepted.json` is the SECOND file, and the suffix hazard the code carries a comment about: a
    // bare `.json` test matches both. Checked first, and explicitly.
    if (name.name.endsWith('.accepted.json')) {
      yield { kind: 'accepted', path, trail, keysHash: name.name.slice(0, -'.accepted.json'.length) };
    } else if (name.name.endsWith('.json')) {
      yield { kind: 'corpus', path, trail, keysHash: name.name.slice(0, -'.json'.length) };
    }
  }
}

let imported = 0;
let skipped = 0;
let acceptedRows = 0;
const touched = new Set();

// TWO PASSES, CORPORA FIRST, and the reason is an ordering `readdirSync` hands you by accident:
// `abc123.accepted.json` sorts BEFORE `abc123.json`, so a single pass applies the accepted set to
// states that do not exist yet, matches nothing, and imports a worklist where everything somebody had
// already closed is open again. It reported "0 state(s) marked accepted" and looked like it worked.
const files = [...corpusFiles(coverageRoot)];
const ordered = [...files.filter((f) => f.kind === 'corpus'), ...files.filter((f) => f.kind === 'accepted')];

try {
  for (const file of ordered) {
    // The trail is <repo…>/<region>: the region is the last segment, the repo is everything before,
    // which is one or two segments. Parsed from the right, like every other repo path in this system.
    if (file.trail.length < 2) continue;
    const region = file.trail[file.trail.length - 1];
    const repo = file.trail.slice(0, -1).join('/');
    if (onlyRepo && repo !== onlyRepo) continue;

    const project = await client.query('select id from projects where repo = $1', [repo]);
    if (!project.rowCount) {
      // No row means `/api/coverage` still falls through to the host for this repo, so importing its
      // corpus would put history in a table nothing reads. Named rather than silent.
      if (!touched.has(repo)) console.log(`· ${repo} — no projects row, left on disk`);
      touched.add(repo);
      skipped++;
      continue;
    }
    const projectId = project.rows[0].id;

    let parsed;
    try {
      parsed = JSON.parse(readFileSync(file.path, 'utf8'));
    } catch {
      console.error(`✗ ${file.path} — unreadable, left alone`);
      continue;
    }

    if (file.kind === 'accepted') {
      const ids = Array.isArray(parsed) ? parsed.filter((i) => typeof i === 'string') : [];
      if (!ids.length) continue;
      // The accepted set becomes a column on the state it is about — which is only possible for a
      // state that exists. An id with no row is an acceptance of something the corpus no longer has,
      // and is dropped rather than resurrected as a stateless row.
      const { rowCount } = await client.query(
        `update coverage_states set accepted_at = now()
          where project_id = $1 and region = $2 and keys_hash = $3
            and state_id = any($4::text[]) and accepted_at is null`,
        [projectId, region, file.keysHash, ids],
      );
      acceptedRows += rowCount ?? 0;
      if (rowCount !== ids.length) {
        console.log(`  · ${repo}/${region}/${file.keysHash}: ${ids.length - (rowCount ?? 0)} accepted id(s) had no state`);
      }
      // The accepted FILE goes too, or `--delete-after-import` leaves it orphaned beside a corpus that
      // is no longer there — which reads, to whoever finds it, as a corpus that failed to import.
      if (deleteAfter) rmSync(file.path, { force: true });
      continue;
    }

    const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
    if (!entries.length) continue;
    // THE SAME UPSERT the route uses. Importing with a different statement would be a third copy of
    // the fold, in the one script whose whole job is that the numbers survive the move.
    await client.query(
      `insert into coverage_states
         (project_id, region, keys_hash, state_id, fingerprint, count, first_at, last_at)
       select $1, $2, $3, t.state_id, t.fingerprint::jsonb, t.count, t.first_at, t.last_at
         from unnest($4::text[], $5::jsonb[], $6::bigint[], $7::bigint[], $8::bigint[])
              as t(state_id, fingerprint, count, first_at, last_at)
       on conflict (project_id, region, keys_hash, state_id)
       do update set
         count    = coverage_states.count + excluded.count,
         first_at = least(coverage_states.first_at, excluded.first_at),
         last_at  = greatest(coverage_states.last_at, excluded.last_at)`,
      [
        projectId,
        region,
        file.keysHash,
        entries.map((e) => fingerprintId(e.fingerprint)),
        entries.map((e) => JSON.stringify(e.fingerprint)),
        entries.map((e) => e.count),
        entries.map((e) => e.firstAt),
        entries.map((e) => e.lastAt),
      ],
    );
    imported++;
    console.log(`✓ ${repo}/${region}/${file.keysHash} — ${entries.length} state(s)`);
    // NOT IDEMPOTENT, and it cannot be: the upsert SUMS. Running this twice doubles the counts, which
    // is exactly right for two different corpora and exactly wrong for the same one twice. Deleting
    // the file is what makes a second run a no-op, which is the honest argument for the flag below —
    // it is not tidiness, it is the only thing that makes this script safe to re-run.
    if (deleteAfter) rmSync(file.path, { force: true });
  }

  console.log(
    `\n${imported} corpus file(s) imported, ${acceptedRows} state(s) marked accepted, ${skipped} left on disk.`,
  );
  if (imported && !deleteAfter) {
    console.log('\n  The files are still there. This script SUMS, so running it again doubles those');
    console.log('  counts — verify the rows, then re-run with --delete-after-import.');
  }
} finally {
  await client.end();
}
