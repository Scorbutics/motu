// `motu fixtures record <island>` — capture real (or mock) backend responses into request-keyed
// fixtures. It boots the focused lagoon, drives the island's declared `scenarios` through the
// archipelago boundary, and records each contract call's request + response at the `call()` seam.
// With `--transport http` it records the REAL backend (the point of it); default records the mock
// (a self-consistency check of the pipeline). This closes the "fixtures are hand-written / can't
// capture semantic fidelity" gap — the recorder replays real truth, keyed by request, without
// reimplementing any backend logic.
import { existsSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { paths, names, color } from '../lib/util.mjs';
import { recordLagoon } from '../playwright-lagoon.mjs';

const HARNESS = resolve(dirname(fileURLToPath(import.meta.url)), '../runtime-harness.mjs');
const CLI_PKG = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Read the island's declared `scenarios` via the harness (loads only the fixtures file). */
function readScenarios(fixturesPath) {
  if (!fixturesPath || !existsSync(fixturesPath)) return [];
  const args = ['--import', 'tsx', HARNESS, '', fixturesPath, 'native', 'scenarios'];
  const res = spawnSync(process.execPath, args, { encoding: 'utf8', cwd: CLI_PKG });
  if (res.status !== 0) return [];
  const line = (res.stdout || '').trim().split('\n').filter(Boolean).pop();
  try {
    return JSON.parse(line).scenarios ?? [];
  } catch {
    return [];
  }
}

/** Stable JSON (sorted object keys) for dedup keys. */
function stable(v) {
  return JSON.stringify(v, (_k, val) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(Object.keys(val).sort().map((k) => [k, val[k]]))
      : val,
  );
}

export async function fixturesRecordCommand(argv) {
  const name = argv._[0];
  if (!name) {
    console.error('usage: motu fixtures record <island> [--transport http|mock] [--out <path>]');
    process.exit(2);
  }
  const { kebab, tag } = names(name);
  const fixturesPath = paths.fixturesFile(kebab);
  const scenarios = readScenarios(fixturesPath);
  if (scenarios.length === 0) {
    console.error(color.red(`✗ ${kebab} declares no \`scenarios\` in fixtures.mock.ts — add at least one { seed } to record against.`));
    process.exit(1);
  }

  const transport = argv.transport === 'http' ? 'http' : undefined; // default: mock
  console.log(color.dim(`recording ${tag} against the ${transport ?? 'mock'} transport over ${scenarios.length} scenario(s)…`));
  const port = 5400 + Math.floor(Math.random() * 300);

  let result;
  try {
    result = await recordLagoon({ tag, port, scenarios, transport });
  } catch (err) {
    const msg = String(err?.message || err).split('\n')[0];
    if (/Executable doesn't exist|playwright install/i.test(msg)) {
      console.error(color.red('✗ Chromium not installed — run `npx playwright install chromium` (in packages/cli)'));
    } else {
      console.error(color.red(`✗ recording failed: ${msg}`));
    }
    process.exit(1);
  }
  if (!result.mounted) {
    console.error(color.red('✗ island did not mount — nothing recorded'));
    process.exit(1);
  }

  // Dedupe captured calls by (service, method, args).
  const seen = new Set();
  const unique = [];
  for (const c of result.calls) {
    const key = `${c.service}.${c.method}(${stable(c.args)})`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(c);
  }

  // Reduce host-fed store writes (channels + provide) to a last-wins seed, MINUS the keys the
  // scenarios themselves drove (those are inputs, not host config).
  const scenarioKeys = new Set(scenarios.flatMap((s) => Object.keys(s.seed ?? {})));
  const seed = {};
  for (const w of result.seedWrites ?? []) {
    if (scenarioKeys.has(w.key)) continue;
    seed[w.key] = w.value;
  }
  const seedKeys = Object.keys(seed);

  if (unique.length === 0 && seedKeys.length === 0) {
    console.error(color.red('✗ nothing captured — no contract calls and no host-fed store writes'));
    process.exit(1);
  }

  const outPath = argv.out ? resolve(process.cwd(), argv.out) : resolve(paths.islandDir(kebab), 'fixtures.recorded.ts');
  writeFileSync(outPath, renderFixtures(kebab, unique, seed, transport));
  console.log(color.green(`✓ wrote ${unique.length} fixture(s)${seedKeys.length ? ` + ${seedKeys.length} seed key(s)` : ''}`) + color.dim(` -> ${outPath}`));
  for (const c of unique) {
    console.log('  ' + color.dim(`${c.service}.${c.method}  match=${stable(c.args)}${c.status ? `  (status ${c.status})` : ''}`));
  }
  for (const k of seedKeys) console.log('  ' + color.dim(`seed.${k} = ${preview(seed[k])}`));
  console.log(color.dim('\nReview, then merge into fixtures.mock.ts (fixtures) and the lagoon seed (seed) to replay this session offline.'));
}

/** A short one-line preview of a captured value. */
function preview(v) {
  try {
    const s = JSON.stringify(v);
    return s && s.length > 60 ? s.slice(0, 57) + '…' : String(s);
  } catch {
    return String(v);
  }
}

function renderFixtures(kebab, calls, seed, transport) {
  const rows = calls.map((c) => {
    const match = JSON.stringify(c.args);
    // A CAPTURED FAILURE IS A FIXTURE NOW. This emitted the status as a commented line with
    // `response: null`, because `Fixture` could not express a failing call — so recording a real 500
    // through `--transport http` produced something nobody could run. `FixtureFailure` is the form it
    // was reaching for.
    if (c.status) {
      return `  { service: ${JSON.stringify(c.service)}, method: ${JSON.stringify(c.method)}, match: ${match}, status: ${c.status} },`;
    }
    const response = indent(JSON.stringify(c.response, null, 2), 4);
    return `  { service: ${JSON.stringify(c.service)}, method: ${JSON.stringify(c.method)}, match: ${match}, response: ${response} },`;
  });
  const seedBlock =
    Object.keys(seed).length > 0
      ? `\n// Host-fed store values (channels + provide) captured this session — pass as the lagoon seed so\n// the island receives REAL host config offline, not a hand-written stub.\nexport const seed: Record<string, unknown> = ${indent(JSON.stringify(seed, null, 2), 0)};\n`
      : '';
  return `// RECORDED fixtures for x-${kebab} — captured from the ${transport ?? 'mock'} transport by \`motu fixtures record\`.
// Request-keyed (\`match\` = the exact call args). Merge the ones you want into fixtures.mock.ts.
import type { Fixture } from '@motu/runtime/mock';

export const fixtures: Fixture[] = [
${rows.join('\n')}
];
${seedBlock}`;
}

/** Re-indent a multi-line JSON blob so nested lines align under the fixture row. */
function indent(json, spaces) {
  if (json == null) return 'null';
  const pad = ' '.repeat(spaces);
  return json.split('\n').map((l, i) => (i === 0 ? l : pad + l)).join('\n');
}
