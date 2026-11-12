#!/usr/bin/env node
// DOES MOTU REFUSE FAKE EVIDENCE — the same lie told to motu and to Storybook, one at a time.
//
//   node bench/evidence/run.mjs [--project /path/to/app] [--only E1,E5]
//
// The design, and the expectations pre-registered before the first run, are in README.md here. This
// file is the mechanism and nothing else: what a tool is asked, how its answer becomes comparable, and
// the discipline `bench/coupling` learned the hard way —
//   - a cheat is CAUGHT when a tool's failure SIGNATURE changes, never when it is merely red;
//   - every edit matches exactly once, checked in a preflight before a byte moves;
//   - every restore is verified byte for byte, or the run is void;
//   - the baseline is measured twice, and a tool whose two baselines differ is FLAKY and is not scored.
//
// WHAT IS NOT HERE: which files a cheat edits, and which command runs which tool. Those depend on the
// target and live in `cheats.mjs` and `instruments.mjs`, written after the baseline evidence existed
// and by someone who had not seen this list when the evidence was written.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, rmSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { CHEATS } from './cheats.mjs';
import { instruments } from './instruments.mjs';

const args = process.argv.slice(2);
const flag = (n, d = null) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? d : args[i + 1];
};
const PROJECT = resolve(flag('project', '/home/scorbutics/dev/motu-bench/shlink'));
const ONLY = flag('only') ? new Set(flag('only').split(',')) : null;
const selected = CHEATS.filter((c) => !ONLY || ONLY.has(c.id));

/** Run a command in the target, never throwing: a failing tool is an answer, not a crash. */
export const run = (cmd, cmdArgs, timeoutMs, env = {}) => {
  const started = Date.now();
  try {
    const out = execFileSync(cmd, cmdArgs, {
      cwd: PROJECT,
      encoding: 'utf8',
      timeout: timeoutMs,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', ...env },
      maxBuffer: 64 * 1024 * 1024,
    });
    return { code: 0, out, seconds: (Date.now() - started) / 1000 };
  } catch (err) {
    return {
      code: err.status ?? (err.signal ? 124 : 1),
      out: `${err.stdout ?? ''}${err.stderr ?? ''}`,
      seconds: (Date.now() - started) / 1000,
      timedOut: Boolean(err.signal),
    };
  }
};

const INSTRUMENTS = instruments({ run, PROJECT });

const measure = (ids) =>
  INSTRUMENTS.filter((i) => !ids || ids.includes(i.id)).map((i) => {
    const r = i.go();
    return { id: i.id, sign: r.timedOut ? 'TIMEOUT' : i.sign(r), code: r.code, seconds: Math.round(r.seconds) };
  });

/**
 * A lie is told to each harness SEPARATELY — `motu` edits only motu's evidence, `sb` only the stories,
 * `shared` the app itself. Each variant runs the instruments that can answer for it: its own harness,
 * plus the app's `tsc`, credited to that harness (typed fixtures are part of how a harness is written).
 */
const VARIANTS = {
  motu: { families: ['motu'], extra: ['tsc'] },
  sb: { families: ['storybook-default', 'storybook-strict'], extra: ['tsc'] },
  shared: { families: ['motu', 'storybook-default', 'storybook-strict', 'context'], extra: ['tsc'] },
};
const idsOf = (families) => INSTRUMENTS.filter((i) => families.includes(i.family)).map((i) => i.id);
const runsOf = (c) =>
  Object.keys(VARIANTS)
    .filter((v) => c[v])
    .map((v) => ({ variant: v, edits: c[v], ids: [...VARIANTS[v].extra, ...idsOf(VARIANTS[v].families)] }));

/**
 * Apply edits, and hand back a revert that PROVES it worked. An edit may CREATE a file
 * (`{ file, create }`): the revert deletes it and checks it is gone.
 */
const apply = (id, edits) => {
  const originals = new Map();
  const created = [];
  for (const e of edits) {
    const file = resolve(PROJECT, e.file);
    if (e.create === undefined && !originals.has(file)) originals.set(file, readFileSync(file, 'utf8'));
  }
  const undo = () => {
    for (const [file, text] of originals) writeFileSync(file, text);
    for (const file of created) rmSync(file, { force: true });
  };
  for (const e of edits) {
    const file = resolve(PROJECT, e.file);
    if (e.create !== undefined) {
      if (existsSync(file)) {
        undo();
        throw new Error(`${id}: ${e.file} already exists — a created file must be new`);
      }
      writeFileSync(file, e.create);
      created.push(file);
      continue;
    }
    const now = readFileSync(file, 'utf8');
    const hits = now.split(e.find).length - 1;
    if (hits !== 1) {
      undo();
      throw new Error(`${id}: \`find\` matched ${hits} times in ${e.file} — a cheat must be exact`);
    }
    writeFileSync(file, now.replace(e.find, e.replace));
  }
  return () => {
    undo();
    for (const [file, text] of originals) {
      if (readFileSync(file, 'utf8') !== text) throw new Error(`${id}: ${file} did not restore — the run is void`);
    }
    for (const file of created) if (existsSync(file)) throw new Error(`${id}: ${file} was not removed — the run is void`);
  };
};

// THE TOOL MUST NOT CHANGE UNDER THE RUN. The first run straddled a motu commit and a package rebuild
// (13:04, mid-run): four cheats ran against a CLI with no built packages and were scored as caught. The
// stamp is motu's HEAD plus the mtimes of its built entry points, taken now and again at the end.
const MOTU_REPO = '/mnt/dev/motu';
const stamp = () => {
  let head = '?';
  try {
    head = execFileSync('git', ['-C', MOTU_REPO, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {}
  const dists = ['core', 'react', 'runtime'].map((p) => {
    try {
      return `${p}@${statSync(resolve(MOTU_REPO, `packages/${p}/dist/index.js`)).mtimeMs}`;
    } catch {
      return `${p}@missing`;
    }
  });
  return `${head} ${dists.join(' ')}`;
};
const STAMP = stamp();
console.log(`\nevidence bench — ${PROJECT}\n  motu ${STAMP.split(' ')[0]}\n`);

// PREFLIGHT: every edit fits the tree exactly once, before anything is touched. Edits to one file
// within one variant are applied in order, so they are checked in order too.
{
  const bad = [];
  for (const c of selected) {
    for (const { variant, edits } of runsOf(c)) {
      const texts = new Map();
      for (const e of edits) {
        const file = resolve(PROJECT, e.file);
        if (e.create !== undefined) {
          if (existsSync(file)) bad.push(`${c.id}/${variant}: ${e.file} already exists`);
          continue;
        }
        if (!texts.has(file)) texts.set(file, existsSync(file) ? readFileSync(file, 'utf8') : null);
        const text = texts.get(file);
        const hits = text === null ? -1 : text.split(e.find).length - 1;
        if (hits !== 1) bad.push(`${c.id}/${variant}: matched ${hits}x in ${e.file}`);
        else texts.set(file, text.replace(e.find, e.replace));
      }
    }
  }
  if (bad.length) {
    console.error('✗ the cheat set does not fit this tree:\n  ' + bad.join('\n  '));
    console.error('  Nothing was changed.');
    process.exit(2);
  }
  console.log(`  preflight ok — ${selected.length} cheat(s), ${selected.flatMap(runsOf).length} variant(s), every edit exact\n`);
}
if (args.includes('--dry')) process.exit(0);

// BASELINE, TWICE. A tool whose clean-tree answer moves between two runs cannot be scored.
console.log('BASELINE (two runs of the clean tree)');
const baseline = measure();
const again = measure();
const flaky = new Set();
for (const b of baseline) {
  const b2 = again.find((x) => x.id === b.id);
  if (b2.sign !== b.sign || b2.code !== b.code) flaky.add(b.id);
  console.log(
    `  ${b.id.padEnd(15)} exit=${b.code}  ${b.seconds}s/${b2.seconds}s  ` +
      (flaky.has(b.id) ? `FLAKY — not scored (${b.sign.slice(0, 50)} vs ${b2.sign.slice(0, 50)})` : b.sign ? `baseline: ${b.sign.slice(0, 90)}` : 'clean'),
  );
}

const rows = [];
for (const c of selected) {
  const row = { ...c, caught: {}, detail: {} };
  for (const { variant, edits, ids } of runsOf(c)) {
    console.log(`\n${c.id}/${variant}  ${c.name}`);
    let revert;
    try {
      revert = apply(`${c.id}/${variant}`, edits);
    } catch (err) {
      console.log(`  SKIPPED — ${err.message}`);
      continue;
    }
    try {
      for (const n of measure(ids)) {
        const b = baseline.find((x) => x.id === n.id);
        const inst = INSTRUMENTS.find((i) => i.id === n.id);
        // COULD NOT RUN is not a catch. motu exits 2 when the environment gave out (packages not built,
        // a port that never opened) — the first run scored four of those as refusals.
        const inconclusive = flaky.has(n.id) || (inst.inconclusiveExit !== undefined && n.code === inst.inconclusiveExit);
        const hit = inconclusive
          ? null
          : inst.grade
            ? inst.grade(n, b)
            : n.sign !== b.sign || (n.code !== b.code && n.code !== 0)
              ? 'refused'
              : false;
        row.detail[`${variant}:${n.id}`] = hit;
        const label = hit === null ? 'n/a    ' : hit === 'refused' ? 'REFUSED' : hit === 'flagged' ? 'FLAGGED' : '  miss ';
        const added = hit ? n.sign.split(',').filter((f) => f && !b.sign.split(',').includes(f)).join(',') : '';
        console.log(`  ${n.id.padEnd(15)} ${label} ${n.seconds}s${hit ? `  ${(added || n.sign).slice(0, 110)}` : ''}`);
      }
    } finally {
      revert();
    }
    // A family refuses the lie only through ITS OWN instruments. The app's `tsc` is reported in its own
    // column and credited to neither: a typed fixture is a practice either harness can follow, and the
    // first write-up counted the compiler's catch as a win for both tools (E3).
    if (row.detail[`${variant}:tsc`] !== undefined) {
      const prev = row.caught.types;
      const now = row.detail[`${variant}:tsc`];
      row.caught.types = prev === 'refused' || now === 'refused' ? 'refused' : now ?? prev ?? false;
    }
    for (const fam of VARIANTS[variant].families) {
      const ids2 = idsOf([fam]);
      const vals = ids2.map((id) => row.detail[`${variant}:${id}`]);
      row.caught[fam] = vals.includes('refused') ? 'refused' : vals.includes('flagged') ? 'flagged' : vals.every((v) => v === null) ? null : false;
    }
  }
  rows.push(row);
}

const FAMS = ['motu', 'storybook-default', 'storybook-strict', 'types', 'context'];
const mark = (v) => (v === undefined ? '–' : v === null ? '?' : v === 'refused' ? '✓' : v === 'flagged' ? '!' : '·');
console.log('\n\nMATRIX  (✓ refused — the run fails · ! flagged — a new warning, the run still passes · missed – not applicable ? could not run)\n');
console.log(`        ${FAMS.map((f) => f.padStart(18)).join('')}   lie`);
for (const r of rows) console.log(`  ${r.id.padEnd(4)}  ${FAMS.map((f) => mark(r.caught[f]).padStart(18)).join('')}   ${r.name}`);
console.log('');
for (const fam of FAMS.slice(0, 3)) {
  const scored = rows.filter((r) => !r.unrefusable && !r.postRegistration && !r.authorChosenFor && !r.blind && r.caught[fam] !== undefined);
  const got = scored.filter((r) => r.caught[fam] === 'refused');
  const flagged = scored.filter((r) => r.caught[fam] === 'flagged');
  console.log(
    `  ${fam.padEnd(18)} refused ${got.length}/${scored.length} pre-registered, refusable lies (${got.map((r) => r.id).join(', ') || 'none'})` +
      (flagged.length ? `; flagged ${flagged.length} more (${flagged.map((r) => r.id).join(', ')})` : ''),
  );
}
for (const [label, pick] of [
  ['BLIND (chosen by an agent that knew neither tool)', (r) => r.blind],
  ['COUNTER (author-chosen to favour Storybook)', (r) => r.authorChosenFor],
]) {
  const set = rows.filter(pick);
  if (!set.length) continue;
  console.log(`\n  ${label}:`);
  for (const fam of FAMS.slice(0, 4)) {
    const got = set.filter((r) => r.caught[fam] === 'refused');
    const flagged = set.filter((r) => r.caught[fam] === 'flagged');
    console.log(`    ${fam.padEnd(18)} refused ${got.length}/${set.length} (${got.map((r) => r.id).join(', ') || 'none'})${flagged.length ? `; flagged ${flagged.map((r) => r.id).join(', ')}` : ''}`);
  }
  const nobody = set.filter((r) => !FAMS.some((f) => r.caught[f] === 'refused' || r.caught[f] === 'flagged'));
  if (nobody.length) console.log(`    caught by NOTHING: ${nobody.map((r) => r.id).join(', ')}`);
}
const surprises = rows.filter(
  (r) => r.expect && Object.entries(r.expect).some(([fam, exp]) => r.caught[fam] !== undefined && r.caught[fam] !== null && (r.caught[fam] === 'refused') !== exp),
);
if (surprises.length) {
  console.log('\n  DIFFERS FROM THE PRE-REGISTERED EXPECTATION — report as surprises:');
  for (const r of surprises) {
    const diffs = Object.entries(r.expect).filter(([fam, exp]) => r.caught[fam] !== undefined && r.caught[fam] !== null && (r.caught[fam] === 'refused') !== exp);
    console.log(`    ${r.id}: ${diffs.map(([fam, exp]) => `${fam} expected ${exp ? 'refused' : 'missed'}, got ${r.caught[fam] || 'missed'}`).join('; ')}`);
  }
}
console.log('');
if (stamp() !== STAMP) {
  console.log(`  ✗ VOID — motu changed during the run (${STAMP} → ${stamp()}). Nothing above can be trusted.`);
  process.exit(2);
}
