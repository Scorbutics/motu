// `motu archipelago coverage <id> --corpus <file…>` — what the region DOES, against what it PREVIEWS.
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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
import { color, paths, REPO_ROOT } from '../lib/util.mjs';
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
  // --json MUST OWN STDOUT. The prose and the payload describe the same findings, so a caller that
  // parses one while the other is interleaved gets neither — and the first version of this printed
  // the header and every systemic line before the JSON, which is invalid on the first character.
  // Errors stay on console.error: stderr is where they cannot corrupt what is being parsed.
  const say = argv.json ? () => {} : console.log;
  const id = argv._[0];
  if (!id) {
    console.error(color.red('motu archipelago coverage <id> --corpus <file…>'));
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

  say(color.bold(`\nmotu archipelago coverage — ${id}\n`));

  if (!flows?.length) {
    say(
      `  ${color.dim('–')} ${color.dim('coverage'.padEnd(20))} ` +
        color.dim(`no readable flows in ${paths.rel(paths.archipelagoEvidence(id))} — nothing to compare a corpus against`),
    );
    process.exit(2);
  }
  const { states: covered, emits, sample } = coveredStates(flows, keys, enums);

  // NO CORPUS IS NOT A PASS. Without one this can still say what the flows cover and print the known
  // set to publish, which is useful on its own — but it has examined no reality, and says so.
  //
  // `corpusUrl` FROM CONFIG IS THE DEFAULT, so the everyday invocation is `motu archipelago coverage
  // <id>` rather than a URL somebody has to remember. It is the one coverage address allowed in
  // committed config, because it is read HERE — on a developer's machine — and never reaches a
  // browser; the beacon's own addresses stay in the page's meta tags for exactly that reason.
  // THE CONFIGURED URL FOLLOWS THE REGION BEING ASKED ABOUT. It is one string for a project with
  // several regions, so a `region=` written into it is right for exactly one of them — `motu region
  // coverage directory` fetched the actions corpus and compared a region to another region's data.
  //
  // The declaration guard caught that (`corpus 7f46c60a vs code 3eda0a71`), which is the keysHash
  // bucketing earning its place: without it the two would have been compared and every state reported
  // uncovered, with nothing to say why.
  const configuredUrl = (raw) => {
    if (!/^https?:\/\//.test(raw)) return raw;
    try {
      const u = new URL(raw);
      // `{region}` for a URL that names it elsewhere — a path segment, say.
      if (u.href.includes('%7Bregion%7D') || u.href.includes('{region}')) {
        return decodeURIComponent(u.href).replaceAll('{region}', id);
      }
      u.searchParams.set('region', id);
      return u.href;
    } catch {
      return raw;
    }
  };
  const configured = paths.coverage?.corpusUrl ? [configuredUrl(paths.coverage.corpusUrl)] : [];
  const asked = [argv.corpus, ...(argv._.slice(1) ?? [])].flat().filter(Boolean);
  const files = asked.length ? asked : configured;
  if (files.length && !asked.length) {
    say(`  ${color.dim('·')} ${color.dim('corpus'.padEnd(20))} ${color.dim(`${files[0]}  (coverage.corpusUrl)`)}`);
  }
  if (!files.length) {
    say(
      `  ${color.dim('–')} ${color.dim('coverage'.padEnd(20))} ` +
        color.dim('no --corpus given and no coverage.corpusUrl configured: nothing was compared'),
    );
    say(
      color.dim(
        `\n  ${covered.length} state(s) previewed by ${flows.length} flow(s) over ${keys.length} declared key(s).` +
          `\n  Known set (publish this so clients stay quiet about them):\n`,
      ),
    );
    say('  ' + JSON.stringify(knownIds(covered)));
    process.exit(2);
  }

  // A TOKEN NEVER COMES FROM CONFIG. Committed config is read by `island sync` and baked into the
  // generated registry, which the LAGOON imports — so a secret placed there would travel into a
  // published, publicly reachable page. It comes from the environment, is used for this one fetch,
  // and is never written anywhere.
  const token = argv.token ?? process.env.MOTU_COVERAGE_TOKEN ?? null;

  // A URL IS A FILE HERE. The corpus lives wherever the project put it, and the whole point of the
  // read side being a cacheable blob is that checking against the real thing should not need an
  // export step — `motu archipelago coverage <id> --corpus https://…` is the drift check.
  /**
   * A STATUS PAGE IS ALSO A CORPUS SOURCE, whichever way it arrived.
   *
   * `/coverage/status` answers in a summary shape (`{ top: [{ browsers, state }] }`) because a phone
   * has to render it, and accepting that is what saves somebody standing up a second endpoint to say
   * the same thing.
   *
   * This used to live inside the fetch branch, so the SAME BODY was a corpus from a URL and garbage
   * from a file — and a file is exactly how it arrives when the person reading the status page is on
   * their phone and pastes it. The failure was not even a message about shape: `mergeCorpora` reached
   * `corpus.keys.join(...)` on an object that has no `keys`, and the CLI printed
   * "Cannot read properties of undefined (reading 'join')".
   */
  const asCorpus = (body) => {
    // THE HOST'S OWN READ API, unwrapped. `GET /api/coverage?repo=&region=` answers
    // `{ repo, region, corpus, declarations }` — the corpus in an envelope that names which repo and
    // which region it came from, and how many older declarations are being kept beside it. That
    // envelope is not a corpus, and passing it on reached `corpus.keys.join(...)` on an object with
    // no `keys` — the exact "Cannot read properties of undefined (reading 'join')" this function was
    // already written once to prevent, arriving by the other door.
    //
    // IT IS THE BETTER SOURCE, which is why this is an unwrap and not a rejection: the host holds the
    // WHOLE corpus with real `firstAt`/`lastAt`, where a status page is a top-N summary with the
    // timestamps zeroed. `coverage.corpusUrl` pointed at the host is now the everyday configuration,
    // and an application needs no read route of its own for the CLI's sake.
    if (body?.corpus && Array.isArray(body.corpus.entries)) return body.corpus;
    if (!Array.isArray(body?.top)) return body;
    const entries = body.top.map((t) => ({
      fingerprint: Object.fromEntries(
        String(t.state)
          .split(' ')
          .map((pair) => {
            const i = pair.indexOf(':');
            return [pair.slice(0, i), pair.slice(i + 1)];
          }),
      ),
      // `count` OR `browsers`. The field was renamed when the status page stopped counting distinct
      // browsers — a corpus carries one number, because merging two of them can only add, and the old
      // name claimed a distinction the data no longer makes. Both are accepted so a deployment that
      // is mid-upgrade reports something rather than silently ingesting ones.
      count: t.count ?? t.browsers ?? 1,
      firstAt: 0,
      lastAt: 0,
    }));
    return {
      v: 1,
      // `declaration` IS THE STAMP, `declarations` IS A COUNT. This read `body.declarations?.[0]`,
      // which is `undefined` against every status route that exists — acme's answers a NUMBER there
      // (how many key lists the host is keeping) and puts the hash in `declaration`. So the fallback
      // fired every time and recomputed a hash from the keys of a TRUNCATED top-N, which is only the
      // host's stamp by luck. Prefer what the route actually says.
      keysHash: body.declaration ?? keysHash(Object.keys(entries[0]?.fingerprint ?? {})),
      regionId: body.region ?? id,
      keys: Object.keys(entries[0]?.fingerprint ?? {}).sort(),
      entries,
    };
  };

  const load = async (f) => {
    // A ROOT-RELATIVE PATH IS A CONFIG MISTAKE, NOT A FILENAME. `corpusUrl` is a browser-shaped
    // string in a file full of browser-shaped strings, so `/api/motu/coverage/status` is the natural
    // thing to write — and it reaches here as a path, misses on disk, and reports
    // "ENOENT: no such file or directory, open '/api/…'", which sends the reader looking for a file
    // they never meant to have. Say what is actually wrong.
    if (f.startsWith('/') && !existsSync(f)) {
      throw new Error(
        `${f} looks like a route, not a file. coverage.corpusUrl is fetched from a developer's ` +
          `machine, so it needs the origin too — e.g. https://your-app${f}`,
      );
    }
    if (!/^https?:\/\//.test(f)) return asCorpus(JSON.parse(readFileSync(f, 'utf8')));
    const res = await fetch(f, token ? { headers: { authorization: `Bearer ${token}` } } : undefined);
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `${f} answered ${res.status}` +
          (token ? ' with the token given' : ' — set MOTU_COVERAGE_TOKEN, or pass --token'),
      );
    }
    if (!res.ok) throw new Error(`${f} answered ${res.status}`);
    return asCorpus(await res.json());
  };

  let corpus;
  try {
    corpus = mergeCorpora(await Promise.all(files.map(load)));
  } catch (err) {
    say(`  ${color.red('✗')} ${color.dim('corpus'.padEnd(20))} ${color.red(String(err?.message ?? err))}`);
    process.exit(2);
  }

  // --save: PUT THE DATA WHERE THE LAGOON CAN SHOW IT, and nothing else.
  //
  // A published lagoon is one self-contained HTML file on a host anybody can reach, so it must not
  // carry the address it was fetched from or the credential that opened it. Baking the corpus at
  // BUILD time is what makes that true by construction rather than by redaction: the page holds the
  // rows and has no idea where they came from.
  //
  // Written into the lagoon root so the build globs it, and only ever the corpus — the URL and the
  // token do not appear in the file, which the assertion below enforces rather than assumes.
  if (argv.save) {
    const dir = resolve(paths.lagoonDir, 'src/coverage');
    mkdirSync(dir, { recursive: true });
    const out = resolve(dir, `${id}.json`);
    const body = JSON.stringify(
      { v: corpus.v ?? 1, keysHash: corpus.keysHash, regionId: corpus.regionId, keys: corpus.keys, entries: corpus.entries },
      null,
      2,
    );
    for (const secret of [token, ...files.filter((f) => /^https?:\/\//.test(f))]) {
      if (secret && body.includes(secret)) {
        console.error(color.red(`refusing to save: the corpus body contains ${secret === token ? 'the token' : 'its source URL'}`));
        process.exit(2);
      }
    }
    writeFileSync(out, body + '\n');
    say(
      `  ${color.green('✓')} ${color.dim('saved'.padEnd(20))} ` +
        color.dim(`${paths.rel(out)} · ${corpus.entries.length} state(s), no URL and no token in it`),
    );
  }

  // --forget <id…> / --forget-all: remove a recorded state, which is NOT the same act as accepting it.
  //
  // Accepting says "we looked and chose not to preview this". Forgetting says "this was never true" —
  // and the case it exists for is a mistake in the INSTRUMENT, not in the application. acme recorded
  // `isCurrentWeek:true isOtherWeek:true`, where the second is defined as the negation of the first:
  // a state the page cannot compute, recorded because the region was published one key at a time.
  // Fixing the publishing does not un-record it, and a report that keeps offering an impossible state
  // will eventually be answered with a scenario for something that cannot happen.
  const toForget = [argv.forget].flat().filter((v) => typeof v === 'string' && v);
  if (toForget.length || argv['forget-all']) {
    const { loadHostConfig, gitIdentity } = await import('../lib/remote.mjs');
    const cfg = loadHostConfig();
    const base = (process.env.MOTU_HOST_URL || cfg.url || '').replace(/\/+$/, '');
    const hostToken = process.env.MOTU_HOST_TOKEN || cfg.token || null;
    if (!base || !hostToken) {
      say(`  ${color.red('✗')} ${color.dim('forget'.padEnd(20))} ${color.red('no lagoon host configured — see ~/.config/motu/host.json')}`);
      process.exit(2);
    }
    const hash = corpus.keysHash ?? keysHash(corpus.keys);
    const repo = paths.publishAs?.repo ?? gitIdentity(REPO_ROOT).repo;
    const qs = `repo=${encodeURIComponent(repo)}&region=${encodeURIComponent(id)}&h=${encodeURIComponent(hash)}`;
    const res = await fetch(`${base}/api/coverage/forget?${qs}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${hostToken}`, 'content-type': 'application/json' },
      body: JSON.stringify(argv['forget-all'] ? [] : toForget),
    }).catch(() => null);
    if (!res?.ok) {
      say(`  ${color.red('✗')} ${color.dim('forget'.padEnd(20))} ${color.red(res ? `the host answered ${res.status}` : 'the host is unreachable')}`);
      process.exit(2);
    }
    const body = await res.json();
    say(
      `  ${color.green('✓')} ${color.dim('forget'.padEnd(20))} ` +
        color.dim(`${body.removed} state(s) removed · ${body.remaining} left for declaration ${hash}`),
    );
  }

  // --accept <id…>: the SECOND of the three answers, and the reason it is its own act.
  //
  // "We looked and chose not to preview this" must not be the same state as "nobody looked" — the
  // same reason accepting a snapshot is a separate command from taking one. It goes to the host under
  // the ADMIN token, never the ingest one: nothing may promote a state to known except a flow or a
  // person, and a reporting credential that could also accept would let the tool mark its own
  // findings resolved.
  const toAccept = [argv.accept].flat().filter((v) => typeof v === 'string' && v);
  if (toAccept.length) {
    const { loadHostConfig, gitIdentity } = await import('../lib/remote.mjs');
    const cfg = loadHostConfig();
    const base = (process.env.MOTU_HOST_URL || cfg.url || '').replace(/\/+$/, '');
    const hostToken = process.env.MOTU_HOST_TOKEN || cfg.token || null;
    const repo = paths.publishAs?.repo ?? null;
    if (!base || !hostToken) {
      say(`  ${color.red('✗')} ${color.dim('accept'.padEnd(20))} ${color.red('no lagoon host configured — see ~/.config/motu/host.json')}`);
      process.exit(2);
    }
    const hash = corpus.keysHash ?? keysHash(corpus.keys);
    const qs = `repo=${encodeURIComponent(repo ?? gitIdentity(REPO_ROOT).repo)}&region=${encodeURIComponent(id)}&h=${encodeURIComponent(hash)}`;
    const res = await fetch(`${base}/api/coverage/accept?${qs}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${hostToken}`, 'content-type': 'application/json' },
      body: JSON.stringify(toAccept),
    }).catch(() => null);
    if (!res?.ok) {
      say(
        `  ${color.red('✗')} ${color.dim('accept'.padEnd(20))} ${color.red(res ? `the host answered ${res.status}` : 'the host is unreachable')}`,
      );
      process.exit(2);
    }
    const body = await res.json();
    say(
      `  ${color.green('✓')} ${color.dim('accept'.padEnd(20))} ` +
        color.dim(`${toAccept.length} state(s) accepted · ${body.accepted} in the set for declaration ${hash}`),
    );
  }

  const report = compareCoverage(corpus, covered, keys);
  const total = corpus.entries.reduce((n, e) => n + e.count, 0);

  if (report.keysDiffer) {
    const { onlyRecorded, onlyDeclared } = report.keysDiffer;
    say(
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
    say(
      `  ${color.yellow('!')} ${color.dim('systemic'.padEnd(20))} ` +
        `${color.bold(s.key)}: production is ${color.bold(`[${s.recorded}]`)} and the flows only ever show ` +
        `${color.bold(`[${s.scenarios.join(', ') || 'nothing'}]`)} — ` +
        color.dim('not a missing scenario, a missing column. Widen the flow seeds'),
    );
  }

  const threshold = argv['fail-above'] != null ? Number(argv['fail-above']) : null;

  // --json: THE SAME FINDINGS, for something that is not a person.
  //
  // The prose above is written to be read once and acted on; an agent needs the fingerprint, the
  // share and the SKELETON as data, because the skeleton is the actionable half — it is the scenario
  // stub, already typed from the flows' own seed. Printed before the human report rather than
  // alongside it, so the two cannot disagree about what was found and stdout stays parseable.
  if (argv.json) {
    const over = threshold != null ? report.uncovered.filter((u) => u.share * 100 >= threshold) : [];
    console.log(
      JSON.stringify(
        {
          region: id,
          declaration: corpus.keysHash ?? keysHash(corpus.keys),
          keys: corpus.keys,
          recorded: { states: corpus.entries.length, occurrences: total },
          covered: report.covered,
          // A key where the two sides are DISJOINT: not a missing scenario but a missing column, and
          // the thing to fix before writing any of the scenarios below.
          systemic: report.systemic,
          uncovered: report.uncovered.map((u) => ({
            id: u.id,
            share: u.share,
            count: corpus.entries.find((e) => fingerprintId(e.fingerprint) === u.id)?.count ?? null,
            differsBy: u.diff,
            fingerprint: u.fingerprint,
            scenario: skeleton(u.fingerprint, covered, sample),
          })),
          unreachable: report.unreachable,
          keysDiffer: report.keysDiffer,
          // Said in the payload, not only in the prose: a state reached through `emit` is reported as
          // uncovered even though a flow does exercise it, because only a browser knows the result.
          caveats: { emitOnlySteps: emits, unreachableIsWeak: true },
          failAbove: threshold,
          pass: over.length === 0,
        },
        null,
        2,
      ),
    );
    process.exit(over.length ? 1 : 0);
  }

  if (!report.uncovered.length) {
    say(
      `  ${color.green('✓')} ${color.dim('coverage'.padEnd(20))} ` +
        color.dim(`every recorded state is previewed · ${corpus.entries.length} state(s), ${total} occurrence(s)`),
    );
  } else {
    say(
      color.dim(
        `  ${report.uncovered.length} of ${corpus.entries.length} recorded state(s) are previewed by no flow, ` +
          `most-seen first:\n`,
      ),
    );
    for (const u of report.uncovered) {
      say(`  ${color.yellow((u.share * 100).toFixed(1).padStart(5) + '%')}  ${u.diff}`);
      say(color.dim(`         ${skeleton(u.fingerprint, covered, sample)}`));
      // The id, so the third answer to an uncovered state is reachable without deriving it by hand.
      if (argv.ids) say(color.dim(`         ${u.id}`));
    }
    say(
      color.dim(
        `\n  Three answers, not one: write a scenario, ACCEPT it (\`--accept <id>\`, and \`--ids\` prints them),` +
          `\n  or fix the application — an error state at 3% is a 3% error rate, not a missing preview.`,
      ),
    );
  }

  if (emits) {
    say(
      color.dim(
        `\n  ${emits} flow step(s) act through \`emit\`, whose result only a browser can know — a state reached` +
          `\n  that way is reported above as uncovered even though a flow does exercise it.`,
      ),
    );
  }
  if (report.unreachable.length) {
    say(
      color.dim(
        `\n  ${report.unreachable.length} previewed state(s) never recorded. Rare, seasonal or aspirational states` +
          `\n  look like this, so it is worth reading rather than acting on.`,
      ),
    );
  }


  const over = threshold != null ? report.uncovered.filter((u) => u.share * 100 >= threshold) : [];
  if (over.length) {
    say(`\n${color.red(color.bold('FAIL'))}${color.dim(`  ${over.length} uncovered state(s) at or above ${threshold}%`)}`);
    process.exit(1);
  }
  say(
    `\n${color.green(color.bold('PASS'))}` +
      color.dim(`  ${report.covered} covered, ${report.uncovered.length} to triage${threshold == null ? ' (advisory — pass --fail-above to gate)' : ''}`),
  );
  process.exit(0);
}
