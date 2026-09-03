#!/usr/bin/env node
// DOES MOTU CATCH WHAT IT CLAIMS — coupling defects, against the instruments a project already has.
//
//   node bench/coupling/run.mjs --project /path/to/app --region <id> [--only C1,C3]
//
// THE QUESTION THIS ASKS, and the one the cold-start bench did not. That one measured how many CLI
// invocations an adoption takes, which is a proxy for "is this easy to try" and says nothing about
// whether the framework catches anything. This injects the class motu exists for — the seam between
// components, where each part is individually correct and the composition is wrong — and asks four
// instruments the same question.
//
// AGAINST THE APP'S OWN TOOLING, not against nothing. `tsc`, the linter and the test suite are what a
// project already has; motu only earns its place on the defects those three miss. A row where
// everything catches it is a row where motu added nothing.
//
// A DEFECT IS CAUGHT WHEN AN INSTRUMENT'S FAILURE SIGNATURE CHANGES, not when it is merely red. Real
// projects have failing tests and lint findings on a good day — this one starts with both — so exit
// codes alone would score a pre-existing failure as a catch, every time, for every defect.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFECTS } from './defects.mjs';

const args = process.argv.slice(2);
const flag = (n, d = null) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? d : args[i + 1];
};
const PROJECT = resolve(flag('project', '/home/scorbutics/dev/motu-bench/shlink'));
const REGION = flag('region', 'manage-servers');
const MOTU = flag('motu', '/home/scorbutics/dev/motu/packages/cli/src/cli.mjs');
const ONLY = flag('only') ? new Set(flag('only').split(',')) : null;

const run = (cmd, cmdArgs, timeoutMs) => {
  try {
    return { code: 0, out: execFileSync(cmd, cmdArgs, { cwd: PROJECT, encoding: 'utf8', timeout: timeoutMs, stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (err) {
    return { code: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
};

/**
 * What each instrument is asked, and how its answer is reduced to something comparable.
 *
 * The signature keeps WHICH things failed and drops everything else — timings, paths that move,
 * ordering. Two runs of the same tree must produce the same string or every row reads as a catch.
 */
/**
 * Phrases that only appear in motu's branded type errors — the rules it encodes as types rather than
 * as checks. A tsc failure carrying one of these is motu speaking through the host's compiler.
 */
const MOTU_TYPE_MARKERS = [
  'written by more than one island',
  'wired to an event its island does not declare',
  'is not a slot this region declares',
  'ConstInferenceLost',
];

/**
 * The region's declared slot names, read with motu's own reader.
 *
 * A SLOT TYPO IS CAUGHT BY MOTU, THROUGH THE COMPILER. `slot="manage-servers-serch-list"` fails with
 *
 *     Type '"manage-servers-serch-list"' is not assignable to type
 *     '"manage-servers-list" | "manage-servers-search"'
 *
 * and that union exists only because `createRegion` types the prop from the archipelago. Strip motu
 * out and `slot` is a plain string the compiler is happy with. Scoring that as "the app's own tsc
 * caught it" credits motu's mechanism to tooling the project already had, which is the one mistake
 * this experiment cannot afford to make in either direction.
 */
const REGION_SLOTS = (() => {
  try {
    const out = execFileSync('node', [MOTU, 'lagoon', 'states', '--json'], { cwd: PROJECT, encoding: 'utf8', timeout: 120_000 });
    void out;
  } catch {
    /* not needed if it fails; the archipelago is read directly below */
  }
  try {
    const text = readFileSync(resolve(PROJECT, `src/archipelagos/${REGION}/${REGION}.archipelago.ts`), 'utf8');
    return [...text.matchAll(/slot:\s*'([^']+)'/g)].map((m) => m[1]);
  } catch {
    return [];
  }
})();

/** Does this tsc line fail against a type motu declares rather than one the app wrote? */
const isMotuTypeLine = (line) =>
  MOTU_TYPE_MARKERS.some((m) => line.includes(m)) ||
  (line.includes('not assignable to type') && REGION_SLOTS.some((slot) => line.includes(`"${slot}"`)));
const stripMotuTypeErrors = (out) => out.split('\n').filter((line) => !isMotuTypeLine(line)).join('\n');

const INSTRUMENTS = [
  {
    id: 'tsc',
    label: 'tsc (the app’s own typecheck)',
    // Its signature drops motu's branded type errors, so it must not be scored on the exit code.
    filtered: true,
    go: () => run('npm', ['run', 'types'], 400_000),
    // MOTU'S OWN TYPE ERRORS DO NOT COUNT AS THE COMPILER CATCHING IT. The typed archipelago encodes
    // motu's rules as branded types — "written by more than one island — a key has ONE producer" is a
    // TYPE — so a run that credits those to `tsc` reports motu's own mechanism as the app's tooling,
    // and understates exactly the thing this experiment is measuring. They are attributed to
    // `motu-types` below instead, and stripped here.
    sign: (r) => [...new Set((stripMotuTypeErrors(r.out).match(/error TS\d+/g) ?? []))].sort().join(','),
  },
  {
    id: 'motu-types',
    label: 'motu’s own types (via the host’s tsc)',
    go: () => run('npm', ['run', 'types'], 400_000),
    sign: (r) => (r.out.split('\n').some(isMotuTypeLine) ? 'motu-typed-error' : ''),
  },
  {
    id: 'lint',
    label: 'lint (oxlint)',
    go: () => run('npm', ['run', 'lint'], 300_000),
    sign: (r) => [...new Set((r.out.match(/error [a-z-]+\([a-z-/]+\)/g) ?? []))].sort().join(','),
  },
  {
    id: 'tests',
    label: 'the app’s own test suite (vitest)',
    go: () => run('npm', ['run', 'test'], 600_000),
    // The NAMES of failing tests: a count alone moves when a suite is flaky about how many assertions
    // it reports, and the names are what a person would read.
    sign: (r) => [...new Set((r.out.match(/FAIL\s+.*/g) ?? []).map((l) => l.replace(/\d+ms/g, '').trim()))].sort().join(' | '),
  },
  {
    id: 'motu',
    label: 'motu check (static, 1–2s)',
    go: () => run('node', [MOTU, 'check'], 400_000),
    sign: (r) => [...new Set((r.out.match(/✗\s+\S+/g) ?? []).map((s) => s.trim()))].sort().join(','),
  },
  {
    id: 'motu-rt',
    label: `motu archipelago verify ${REGION} --runtime`,
    go: () => run('node', [MOTU, 'archipelago', 'verify', REGION, '--runtime'], 600_000),
    sign: (r) => [...new Set((r.out.match(/✗\s+\S+/g) ?? []).map((s) => s.trim()))].sort().join(','),
  },
];

const measure = () => INSTRUMENTS.map((i) => {
  const started = Date.now();
  const r = i.go();
  return { id: i.id, sign: i.sign(r), code: r.code, seconds: Math.round((Date.now() - started) / 1000) };
});

/** A defect is one or more exact edits; single-edit ones are written in the short form. */
const editsOf = (d) => d.edits ?? [{ file: d.file, find: d.find, replace: d.replace }];

/**
 * Apply a defect, and hand back a revert that PROVES it worked.
 *
 * State leaking between defects is the failure that invalidates the whole run, silently: the first
 * attempt reverted C2 and then C5 found its own text twice, so C5 was skipped and C1 matched nothing.
 * The matrix still printed, with three rows missing and no indication that anything had gone wrong.
 * Now the restore is verified byte-for-byte and a mismatch stops the run.
 */
const apply = (d) => {
  const originals = new Map();
  for (const e of editsOf(d)) {
    const file = resolve(PROJECT, e.file);
    if (!originals.has(file)) originals.set(file, readFileSync(file, 'utf8'));
  }
  for (const e of editsOf(d)) {
    const file = resolve(PROJECT, e.file);
    const now = readFileSync(file, 'utf8');
    const hits = now.split(e.find).length - 1;
    if (hits !== 1) {
      for (const [f, text] of originals) writeFileSync(f, text);
      throw new Error(`${d.id}: \`find\` matched ${hits} times in ${e.file} — a mutation must be exact`);
    }
    writeFileSync(file, now.replace(e.find, e.replace));
  }
  return () => {
    for (const [file, text] of originals) writeFileSync(file, text);
    for (const [file, text] of originals) {
      if (readFileSync(file, 'utf8') !== text) throw new Error(`${d.id}: ${file} did not restore — the run is void`);
    }
  };
};

console.log(`\ncoupling bench — ${PROJECT}, region \`${REGION}\`\n`);

// PREFLIGHT, before a single byte moves. A defect whose text no longer matches is a defect the run
// would have SKIPPED halfway through, leaving a matrix that looks complete and is not.
{
  const bad = [];
  for (const d of DEFECTS) {
    if (ONLY && !ONLY.has(d.id)) continue;
    for (const e of editsOf(d)) {
      const hits = readFileSync(resolve(PROJECT, e.file), 'utf8').split(e.find).length - 1;
      if (hits !== 1) bad.push(`${d.id}: matched ${hits}x in ${e.file}`);
    }
  }
  if (bad.length) {
    console.error('✗ the defect set does not fit this tree:\n  ' + bad.join('\n  '));
    console.error('  Nothing was changed. Fix the defect text, or point --project at the right tree.');
    process.exit(2);
  }
  console.log(`  preflight ok — ${(ONLY ? DEFECTS.filter((d) => ONLY.has(d.id)) : DEFECTS).length} defect(s) apply exactly once\n`);
}
console.log('BASELINE (the tree as it stands; a real project is not green on a good day)');
const baseline = measure();
for (const b of baseline) {
  const inst = INSTRUMENTS.find((i) => i.id === b.id);
  console.log(`  ${b.id.padEnd(9)} exit=${b.code}  ${b.seconds}s  ${b.sign ? `already failing: ${b.sign.slice(0, 90)}` : 'clean'}`);
  void inst;
}

const rows = [];
for (const d of DEFECTS) {
  if (ONLY && !ONLY.has(d.id)) continue;
  console.log(`\n${d.id}  ${d.name}`);
  let revert;
  try {
    revert = apply(d);
  } catch (err) {
    console.log(`  SKIPPED — ${err.message}`);
    continue;
  }
  try {
    const now = measure();
    const caught = {};
    for (const b of baseline) {
      const n = now.find((x) => x.id === b.id);
      // THE EXIT CODE IS NOT ENOUGH, AND FOR `tsc` IT LIES. Its signature is computed after motu's own
      // branded type errors are stripped, but the PROCESS still failed because of them — so scoring on
      // the exit code credited motu's mechanism to the app's compiler. On C2 the only two errors are
      // motu's, and the row read "tsc caught it", which is the opposite of what happened.
      //
      // So an instrument whose signature is filtered is judged on the signature alone. The others keep
      // the exit-code fallback, for a crash that produces nothing parseable.
      const inst = INSTRUMENTS.find((i) => i.id === b.id);
      caught[b.id] = inst?.filtered
        ? n.sign !== b.sign
        : n.sign !== b.sign || (n.code !== b.code && n.code !== 0);
      console.log(`  ${b.id.padEnd(9)} ${caught[b.id] ? 'CAUGHT ' : '  miss '} ${n.seconds}s${caught[b.id] && n.sign ? `  ${n.sign.slice(0, 84)}` : ''}`);
    }
    rows.push({ ...d, caught });
  } finally {
    revert();
  }
}

console.log('\n\nMATRIX  (✓ = the instrument’s failure changed when the defect was introduced)\n');
const head = INSTRUMENTS.map((i) => i.id.padStart(8)).join('');
console.log(`      ${head}   defect`);
for (const r of rows) {
  console.log(`  ${r.id}  ${INSTRUMENTS.map((i) => (r.caught[i.id] ? '✓' : '·').padStart(8)).join('')}   ${r.name}`);
}
const onlyMotu = rows.filter((r) => (r.caught.motu || r.caught['motu-rt']) && !r.caught.tsc && !r.caught.tests && !r.caught.lint);
const nobody = rows.filter((r) => !Object.values(r.caught).some(Boolean));
console.log(`\n  ${rows.length} defect(s); motu caught ${rows.filter((r) => r.caught.motu || r.caught['motu-rt']).length}, ` +
  `the app's own tooling caught ${rows.filter((r) => r.caught.tsc || r.caught.tests || r.caught.lint).length}.`);
console.log(`  ONLY motu: ${onlyMotu.length ? onlyMotu.map((r) => r.id).join(', ') : 'none'} — this is the number that says whether it earns its place.`);
if (nobody.length) console.log(`  NOBODY caught: ${nobody.map((r) => r.id).join(', ')} — the honest gap.`);
console.log('');
