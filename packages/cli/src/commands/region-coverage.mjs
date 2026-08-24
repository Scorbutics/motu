// `motu region coverage <id> --corpus <file…>` — what the region DOES, against what it PREVIEWS.
//
// Every other check in this CLI compares the region to its declaration. This compares it to reality:
// a corpus of the states production actually reached, folded from beacons, against the states the
// region's flows establish. What comes back is a worklist, not a verdict — which is why the default
// exit is 0 and `--fail-above` is opt-in. An uncovered state is information, and a check that goes
// red for information is a check people learn to skip.
//
// IT DOES NOT WRITE ANYTHING. The scenario skeletons go to stdout for someone to paste and fill in.
// Written to a file they would be a file full of TODO, which looks like coverage and rots — the same
// reason `island create` stopped scaffolding `fixtures.mock.ts`.
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  fingerprintRegion,
  fingerprintId,
  compareCoverage,
  mergeCorpora,
  knownIds,
  keysHash,
} from '@motu/coverage';
import { color, paths } from '../lib/util.mjs';
import { readRegions } from '../lib/eject.mjs';

const HARNESS = resolve(dirname(fileURLToPath(import.meta.url)), '../runtime-harness.mjs');
const CLI_PKG = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Every region key the archipelago declares — the fingerprint's columns.
 *
 * The same union `declaredRegionKeys` computes at runtime, from the same four places, read statically
 * instead. The two must agree or a corpus recorded in a browser cannot be compared to anything here,
 * which is exactly the mismatch `mergeCorpora` and `compareCoverage` refuse rather than paper over.
 */
function declaredKeys(region) {
  const keys = new Set();
  for (const island of region.islands ?? []) {
    for (const key of Object.values(island.bind ?? {})) keys.add(key);
    for (const target of Object.values(island.writes ?? {})) {
      if (typeof target === 'string') keys.add(target);
      else for (const k of Object.values(target ?? {})) keys.add(k);
    }
    for (const key of island.reads ?? []) keys.add(key);
  }
  for (const produced of Object.values(region.sources ?? {})) {
    for (const key of produced.produces ?? []) keys.add(key);
  }
  return [...keys].sort();
}

/** The keys the archipelago declares as closed sets — `coverage: { enums: [...] }`. */
function declaredEnums(region) {
  let text;
  try {
    text = readFileSync(region.file, 'utf8');
  } catch {
    return [];
  }
  const block = text.match(/\bcoverage:\s*\{[^}]*\benums:\s*\[([^\]]*)\]/);
  return block ? [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : [];
}

/** A region's declared flows, by the same two routes `archipelago verify` uses. */
async function readFlows(id) {
  const file = paths.archipelagoEvidence(id);
  if (!existsSync(file)) return null;
  try {
    const mod = await import(`file://${file}?t=${Date.now()}`);
    if (Array.isArray(mod.scenarios)) return mod.scenarios;
  } catch {
    // A plain node import cannot resolve a `.js` specifier pointing at a `.ts` sibling, which is the
    // convention every evidence file uses. Fall through to the tsx loader.
  }
  const res = spawnSync(process.execPath, ['--import', 'tsx', HARNESS, '', file, 'native', 'scenarios'], {
    encoding: 'utf8',
    cwd: CLI_PKG,
    env: { ...process.env, MOTU_PROJECT_ROOT: paths.rel ? undefined : undefined },
  });
  if (res.status !== 0) return null;
  try {
    return JSON.parse((res.stdout || '').trim().split('\n').filter(Boolean).pop()).scenarios ?? null;
  } catch {
    return null;
  }
}

/**
 * The states the flows establish.
 *
 * A seed, plus the seed overlaid with each step's `provide` as they accumulate — because a flow is a
 * sequence and the state after step two is as previewed as the state before step one.
 *
 * WHAT THIS CANNOT SEE, and the report says so: a state reached by `emit`. That goes through an
 * island, so its result is only knowable by running the region — which is the browser lane's job, not
 * this one's. Such a state shows up as uncovered here and is a false positive; the honest fix is for
 * the flow lane to contribute its own fingerprints, and until it does this is a static approximation
 * that errs toward reporting too much rather than too little.
 */
function coveredStates(flows, keys, enums) {
  const fp = (state) => fingerprintRegion(keys, (k) => state[k], { enums });
  const out = [];
  // One real seed, kept so a skeleton can say `[]` instead of guessing at what `empty` means.
  const sample = { ...(flows[0]?.seed ?? {}) };
  let emits = 0;
  for (const flow of flows) {
    let state = { ...(flow.seed ?? {}) };
    out.push(fp(state));
    for (const step of flow.steps ?? []) {
      if (step.emit) emits++;
      if (!step.provide) continue;
      state = { ...state, ...step.provide };
      out.push(fp(state));
    }
  }
  return { states: out, emits, sample };
}

/**
 * The seed literal a reader would paste, for a state nobody previewed.
 *
 * TYPED FROM THE FLOWS' OWN SEED where it can be. A fingerprint says `empty`, which is true of `[]`,
 * `''` and `{}` alike — but the flows already establish that key with a real value, so its type is
 * known and the skeleton can say `[]` rather than offering three guesses. Only a key no flow
 * establishes at all falls back to a TODO, which is honest: nobody has ever given it a value.
 */
function skeleton(fingerprint, coveredFp, sampleSeed) {
  const base = coveredFp[0] ?? {};
  const differs = Object.keys(fingerprint).filter((k) => base[k] !== fingerprint[k]);
  const emptyFor = (key) => {
    const seen = sampleSeed?.[key];
    if (Array.isArray(seen)) return '[]';
    if (typeof seen === 'string') return "''";
    if (seen && typeof seen === 'object') return '{}';
    return '[] /* or "" or {} */';
  };
  const literal = (state, key) => {
    if (state === 'absent') return undefined;
    if (state === 'null') return 'null';
    if (state === 'empty') return emptyFor(key);
    if (state === 'true' || state === 'false') return state;
    if (state.startsWith('= ')) return JSON.stringify(state.slice(2));
    return '/* TODO: a value */';
  };
  const body = differs
    .map((k) => [k, literal(fingerprint[k], k)])
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
  return `{ name: 'TODO', seed: { ...SEED${body ? `, ${body}` : ''} } }`;
}

export async function regionCoverageCommand(argv) {
  const id = argv._[0];
  if (!id) {
    console.error(color.red('motu region coverage <id> --corpus <file…>'));
    process.exit(2);
  }
  const region = readRegions(paths.archipelagosDir).find((r) => r.id === id);
  if (!region) {
    console.error(color.red(`no archipelago '${id}' under ${paths.rel(paths.archipelagosDir)}`));
    process.exit(2);
  }

  const keys = declaredKeys(region);
  const enums = declaredEnums(region);
  const flows = await readFlows(id);

  console.log(color.bold(`\nmotu region coverage — ${id}\n`));

  if (!flows?.length) {
    console.log(
      `  ${color.dim('–')} ${color.dim('coverage'.padEnd(20))} ` +
        color.dim(`no readable flows in ${paths.rel(paths.archipelagoEvidence(id))} — nothing to compare a corpus against`),
    );
    process.exit(2);
  }
  const { states: covered, emits, sample } = coveredStates(flows, keys, enums);

  // NO CORPUS IS NOT A PASS. Without one this can still say what the flows cover and print the known
  // set to publish, which is useful on its own — but it has examined no reality, and says so.
  const files = [argv.corpus, ...(argv._.slice(1) ?? [])].flat().filter(Boolean);
  if (!files.length) {
    console.log(`  ${color.dim('–')} ${color.dim('coverage'.padEnd(20))} ${color.dim('no --corpus given: nothing was compared')}`);
    console.log(
      color.dim(
        `\n  ${covered.length} state(s) previewed by ${flows.length} flow(s) over ${keys.length} declared key(s).` +
          `\n  Known set (publish this so clients stay quiet about them):\n`,
      ),
    );
    console.log('  ' + JSON.stringify(knownIds(covered)));
    process.exit(2);
  }

  // A URL IS A FILE HERE. The corpus lives wherever the project put it, and the whole point of the
  // read side being a cacheable blob is that checking against the real thing should not need an
  // export step — `motu region coverage <id> --corpus https://…` is the drift check.
  const load = async (f) => {
    if (!/^https?:\/\//.test(f)) return JSON.parse(readFileSync(f, 'utf8'));
    const res = await fetch(f);
    if (!res.ok) throw new Error(`${f} answered ${res.status}`);
    return res.json();
  };

  let corpus;
  try {
    corpus = mergeCorpora(await Promise.all(files.map(load)));
  } catch (err) {
    console.log(`  ${color.red('✗')} ${color.dim('corpus'.padEnd(20))} ${color.red(String(err?.message ?? err))}`);
    process.exit(2);
  }

  const report = compareCoverage(corpus, covered, keys);
  const total = corpus.entries.reduce((n, e) => n + e.count, 0);

  if (report.keysDiffer) {
    const { onlyRecorded, onlyDeclared } = report.keysDiffer;
    console.log(
      `  ${color.red('✗')} ${color.dim('declaration'.padEnd(20))} ` +
        color.red(
          `corpus ${corpus.keysHash ?? keysHash(corpus.keys)} vs code ${keysHash(keys)} — ` +
            `${onlyRecorded.length ? `recorded only: ${onlyRecorded.join(', ')}. ` : ''}` +
            `${onlyDeclared.length ? `declared only: ${onlyDeclared.join(', ')}. ` : ''}` +
            `The same state fingerprints differently on each side, so nothing below is comparable`,
        ),
    );
    process.exit(1);
  }

  for (const s of report.systemic) {
    console.log(
      `  ${color.yellow('!')} ${color.dim('systemic'.padEnd(20))} ` +
        `${color.bold(s.key)}: production is ${color.bold(`[${s.recorded}]`)} and the flows only ever show ` +
        `${color.bold(`[${s.scenarios.join(', ') || 'nothing'}]`)} — ` +
        color.dim('not a missing scenario, a missing column. Widen the flow seeds'),
    );
  }

  if (!report.uncovered.length) {
    console.log(
      `  ${color.green('✓')} ${color.dim('coverage'.padEnd(20))} ` +
        color.dim(`every recorded state is previewed · ${corpus.entries.length} state(s), ${total} occurrence(s)`),
    );
  } else {
    console.log(
      color.dim(
        `  ${report.uncovered.length} of ${corpus.entries.length} recorded state(s) are previewed by no flow, ` +
          `most-seen first:\n`,
      ),
    );
    for (const u of report.uncovered) {
      console.log(`  ${color.yellow((u.share * 100).toFixed(1).padStart(5) + '%')}  ${u.diff}`);
      console.log(color.dim(`         ${skeleton(u.fingerprint, covered, sample)}`));
    }
  }

  if (emits) {
    console.log(
      color.dim(
        `\n  ${emits} flow step(s) act through \`emit\`, whose result only a browser can know — a state reached` +
          `\n  that way is reported above as uncovered even though a flow does exercise it.`,
      ),
    );
  }
  if (report.unreachable.length) {
    console.log(
      color.dim(
        `\n  ${report.unreachable.length} previewed state(s) never recorded. Rare, seasonal or aspirational states` +
          `\n  look like this, so it is worth reading rather than acting on.`,
      ),
    );
  }

  const threshold = argv['fail-above'] != null ? Number(argv['fail-above']) : null;
  const over = threshold != null ? report.uncovered.filter((u) => u.share * 100 >= threshold) : [];
  if (over.length) {
    console.log(`\n${color.red(color.bold('FAIL'))}${color.dim(`  ${over.length} uncovered state(s) at or above ${threshold}%`)}`);
    process.exit(1);
  }
  console.log(
    `\n${color.green(color.bold('PASS'))}` +
      color.dim(`  ${report.covered} covered, ${report.uncovered.length} to triage${threshold == null ? ' (advisory — pass --fail-above to gate)' : ''}`),
  );
  process.exit(0);
}
