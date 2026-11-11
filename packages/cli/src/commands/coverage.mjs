// `motu coverage init | doctor | pull` — production coverage that reaches the host, on any stack.
//
// WHY THIS EXISTS. Coverage is the one part of motu that runs in production, and on the first project
// that switched it on the host never stored a single corpus. Nothing said so: setup took four values
// in a production environment, a token minted by hand on the host, two route files and two meta tags,
// and any one of them missing gave silence. These three verbs are the setup, the proof, and the way
// round a production server that cannot reach the host at all.
//
//   init    write the route for this host stack, mint the ingest token over the host's admin API, and
//           print the ONE remaining step in that platform's terms
//   doctor  send a synthetic report through the DEPLOYED route and name the hop that fails
//   pull    fold `motu-coverage {…}` lines from a log (the route's `log` mode) and upload them with
//           this machine's credentials — for a server with no outbound network
//
// An agent runs all three: `init` during integration, `doctor` after every deploy, `pull` from CI.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { mergeCorpora, keysHash } from '@motu/coverage';
import { color, paths, REPO_ROOT } from '../lib/util.mjs';
import { loadMotuConfig } from '../lib/config.mjs';
import { readRegions } from '../lib/eject.mjs';
import { gitIdentity, loadHostConfig } from '../lib/remote.mjs';

/** The full config: the curated `paths` export carries neither the host stack nor its root. */
const full = loadMotuConfig();

const DEFAULT_ENDPOINT = '/api/motu/coverage';
/** Where the Java servlet in `dev.motu:endpoint` answers, relative to the application's context. */
const JAVA_ENDPOINT = '/motu/coverage';

export async function coverageCommand(sub, argv) {
  if (sub === 'doctor') return doctor(argv);
  if (sub === 'pull') return pull(argv);
  if (sub === 'init') return init(argv);
  console.error(color.red(`unknown: motu coverage ${sub ?? ''}`) + color.dim(' — init | doctor | pull'));
  return 2;
}

function hostTarget(argv) {
  const cfg = loadHostConfig();
  const url = (typeof argv.host === 'string' ? argv.host : process.env.MOTU_HOST_URL || cfg.url || '').replace(/\/+$/, '');
  const token = (typeof argv.token === 'string' ? argv.token : process.env.MOTU_HOST_TOKEN || cfg.token) || null;
  return { url, token };
}

function repoName() {
  return paths.publishAs?.repo ?? gitIdentity(REPO_ROOT).repo;
}

function regionIds() {
  return readRegions(paths.archipelagosDir).map((r) => r.id);
}

// ── doctor ──────────────────────────────────────────────────────────────────────────────────────

/**
 * Send one synthetic report through the deployed route, and say which hop failed.
 *
 * The report is marked (`x-motu-doctor: 1`): the route forwards it as a DRY RUN, which the host
 * checks (token, repo) and does not store, or logs it under a different prefix, which `pull` skips.
 * So running this against production changes nothing a person will later read.
 *
 * EXIT CODES carry the usual meaning: 1 is a finding about the deployment (repair it), 2 is that the
 * application could not be reached from here at all (retry, or run it from somewhere that can).
 */
async function doctor(argv) {
  const json = argv.json === true;
  const base = typeof argv.url === 'string' ? argv.url.replace(/\/+$/, '') : '';
  if (!/^https?:\/\//.test(base)) {
    console.error(color.red('✗ --url <the application’s origin> is required, e.g. --url https://app.example.com'));
    return 2;
  }
  const endpoint = typeof argv.endpoint === 'string' ? argv.endpoint : full.host === 'angularjs' ? JAVA_ENDPOINT : DEFAULT_ENDPOINT;
  const region = typeof argv.region === 'string' ? argv.region : regionIds()[0];
  if (!region) {
    console.error(color.red('✗ this project declares no region to name in the report — pass --region <id>'));
    return 2;
  }
  const target = `${base}${endpoint}`;
  const report = { v: 1, regionId: region, keys: [], entries: [] };
  const say = (ok, hop, detail, code) => {
    if (json) console.log(JSON.stringify({ ok, hop, detail, target, region }, null, 2));
    else {
      console.log(`${ok ? color.green('✓') : color.red('✗')} ${color.bold(hop)} ${color.dim('·')} ${detail}`);
      console.log(color.dim(`  ${target} (region ${region})`));
    }
    return code;
  };

  let res;
  try {
    res = await fetch(target, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-motu-doctor': '1' },
      body: JSON.stringify(report),
    });
  } catch (err) {
    return say(false, 'application unreachable', `could not reach ${base} from this machine (${err?.cause?.code ?? err?.message ?? err})`, 2);
  }
  const took = res.headers.get('x-motu-coverage');
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  const error = body?.error ?? '';
  if (res.status === 404) return say(false, 'route missing', `nothing answers at ${endpoint} — \`motu coverage init\` writes the route`, 1);
  if (res.status === 405) return say(false, 'route refuses POST', `${endpoint} exists but answers 405 to a POST — is it the coverage route?`, 1);
  if (res.status === 503) return say(false, 'route not configured', error || 'the route answered 503', 1);
  if (res.status === 400) return say(false, 'report refused by the route', error || 'the route answered 400', 1);
  if (res.status === 502) {
    const hop = /401|token/.test(error) ? 'host refused the token' : /unreachable/.test(error) ? 'host unreachable from the application' : 'host answered an error';
    return say(false, hop, error || 'the route answered 502', 1);
  }
  if (res.ok && took === 'forwarded') return say(true, 'forwarded', 'the route reached the motu host, which accepted the token (dry run — nothing stored)', 0);
  if (res.ok && took === 'logged') {
    return say(true, 'logged', 'the route is in log mode: look for one `motu-coverage-doctor {…}` line in that server’s log, then collect real lines with `motu coverage pull`', 0);
  }
  if (res.ok) {
    return say(false, 'route too old to say', `the route answered ${res.status} without \`x-motu-coverage\` — update @motu/coverage (or the Java endpoint) so this can tell forwarded from dropped`, 1);
  }
  return say(false, 'unexpected answer', `the route answered ${res.status}${error ? `: ${error}` : ''}`, 1);
}

// ── pull ────────────────────────────────────────────────────────────────────────────────────────

const LINE = /(?:^|\s)motu-coverage (\{.*\})\s*$/;

/**
 * Fold `motu-coverage {…}` lines out of a log and upload them to the host.
 *
 * For a server in `log` mode: it cannot reach the host (a JBoss behind a datacentre's egress
 * firewall) or should not hold a secret. Its log is collected somewhere already — a file, a CI
 * artifact, an ELK or Splunk export — and this runs wherever that is, with this machine's own host
 * credentials.
 *
 * PULLED LINES ARE REMEMBERED (by hash, in `.motu/cache/coverage-pulled.json`) so pulling the same log
 * twice does not count its states twice. Pulling it from two machines would; pull from one place.
 */
async function pull(argv) {
  const json = argv.json === true;
  const from = typeof argv.from === 'string' ? argv.from : null;
  if (!from) {
    console.error(color.red('✗ --from <log file> is required (`-` reads stdin: `kubectl logs … | motu coverage pull --from -`)'));
    return 2;
  }
  let text;
  try {
    text = from === '-' ? readFileSync(0, 'utf8') : readFileSync(resolve(process.cwd(), from), 'utf8');
  } catch (err) {
    console.error(color.red(`✗ could not read ${from}: ${err.message}`));
    return 2;
  }

  const seenFile = process.env.MOTU_COVERAGE_PULL_STATE || resolve(full.cacheDir ?? resolve(REPO_ROOT, '.motu/cache'), 'coverage-pulled.json');
  let seen = new Set();
  try {
    seen = new Set(JSON.parse(readFileSync(seenFile, 'utf8')));
  } catch {
    /* first pull */
  }

  const groups = new Map();
  let lines = 0;
  let malformed = 0;
  let already = 0;
  const fresh = [];
  for (const raw of text.split('\n')) {
    const m = LINE.exec(raw);
    if (!m) continue;
    lines++;
    const h = createHash('sha256').update(m[1]).digest('hex').slice(0, 32);
    if (seen.has(h)) {
      already++;
      continue;
    }
    let corpus;
    try {
      corpus = JSON.parse(m[1]);
    } catch {
      malformed++;
      continue;
    }
    if (!corpus || typeof corpus.regionId !== 'string' || !Array.isArray(corpus.keys) || !Array.isArray(corpus.entries)) {
      malformed++;
      continue;
    }
    // Grouped by DECLARATION, not just region: two key sets are not comparable, and `mergeCorpora`
    // refuses to fold them rather than produce nonsense.
    const k = `${corpus.regionId}\u0000${corpus.keysHash ?? keysHash(corpus.keys)}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(corpus);
    fresh.push(h);
  }

  if (!lines) {
    // A PULL THAT FOUND NOTHING is almost always the wrong file, or a route not in log mode — never a
    // success to report quietly.
    const msg = `no \`motu-coverage {…}\` lines in ${from} — is the route in log mode, and is this that server’s log?`;
    if (json) console.log(JSON.stringify({ ok: false, error: msg, lines: 0 }, null, 2));
    else console.error(color.red(`✗ ${msg}`));
    return 1;
  }

  const host = hostTarget(argv);
  const repo = repoName();
  const dry = argv['dry-run'] === true;
  if (!dry && (!host.url || !host.token)) {
    console.error(color.red('✗ no lagoon host to upload to — set MOTU_HOST_URL / MOTU_HOST_TOKEN or ~/.config/motu/host.json (or pass --dry-run)'));
    return 2;
  }

  const results = [];
  for (const list of groups.values()) {
    const merged = mergeCorpora(list);
    const entry = { region: merged.regionId, reports: list.length, states: merged.entries.length };
    if (!dry) {
      const res = await fetch(`${host.url}/api/coverage?repo=${encodeURIComponent(repo)}&region=${encodeURIComponent(merged.regionId)}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${host.token}`, 'content-type': 'application/json' },
        body: JSON.stringify(merged),
      }).catch((err) => ({ ok: false, status: 0, statusText: String(err?.cause?.code ?? err?.message ?? err) }));
      entry.uploaded = !!res.ok;
      if (!res.ok) entry.error = `host answered ${res.status || res.statusText}`;
    }
    results.push(entry);
  }

  const failed = results.filter((r) => r.uploaded === false);
  if (!dry && !failed.length) {
    mkdirSync(dirname(seenFile), { recursive: true });
    // Bounded: the newest 50 000 line hashes are plenty to stop a re-pull of last week's logs.
    writeFileSync(seenFile, JSON.stringify([...seen, ...fresh].slice(-50_000)));
  }
  if (json) {
    console.log(JSON.stringify({ ok: !failed.length, repo, lines, already, malformed, regions: results, dryRun: dry }, null, 2));
  } else {
    for (const r of results) {
      const mark = r.uploaded === false ? color.red('✗') : color.green('✓');
      console.log(`${mark} ${r.region}  ${r.states} state(s) from ${r.reports} report(s)${r.error ? color.red(` — ${r.error}`) : dry ? color.dim(' (dry run)') : ''}`);
    }
    console.log(color.dim(`  ${lines} line(s) read · ${already} already pulled · ${malformed} malformed · repo ${repo}`));
  }
  return failed.length ? 1 : 0;
}

// ── init ────────────────────────────────────────────────────────────────────────────────────────

const NEXT_ROUTE = (host, mode) => `// Where a motu coverage beacon lands. Written by \`motu coverage init\`; see @motu/coverage/server.
//
// ${mode === 'log' ? 'LOG MODE: each report becomes one `motu-coverage {…}` line in this server\'s log, and\n// `motu coverage pull --from <log>` uploads them. No secret, no outbound network.' : 'FORWARD MODE: each report goes to the motu host with MOTU_COVERAGE_TOKEN, the one secret this\n// needs. The host URL is not a secret, so it is written here; the repo is read from the token.'}
import { createCoverageRoute } from '@motu/coverage/server/next';

export const dynamic = 'force-dynamic';

export const POST = createCoverageRoute({ ${mode === 'log' ? "mode: 'log'" : `host: ${JSON.stringify(host)}`} });
`;

const NEXT_KNOWN = (host) => `// The states somebody accepted, served back so the beacon stays quiet about them. Written by
// \`motu coverage init\`. The ingest token reads this set of its own repo; nothing else is needed.
import { createKnownRoute } from '@motu/coverage/server/next/known';

export const dynamic = 'force-dynamic';

export const GET = createKnownRoute({ host: ${JSON.stringify(host)} });
`;

/**
 * Wire coverage for this project's host stack, as far as files in this repository can.
 *
 * What it writes is code (the route). What it cannot write is the production environment, so for
 * that it prints exactly one step in the platform's own terms — a Vercel variable, a JBoss system
 * property — and stops. `doctor` is how that step is proved afterwards.
 */
async function init(argv) {
  const json = argv.json === true;
  const mode = argv.mode === 'log' ? 'log' : 'forward';
  const host = hostTarget(argv);
  const repo = repoName();
  const cfg = full;
  const steps = [];
  const wrote = [];

  if (!cfg.coverage?.enabled) steps.push('switch the fold on: `"coverage": { "enabled": true }` in motu.config.json, then `motu sync`');

  // 1. THE ROUTE, for the stacks motu knows.
  let endpoint = DEFAULT_ENDPOINT;
  if (full.host === 'next') {
    const appDir = ['app', 'src/app'].map((d) => resolve(full.hostRoot, d)).find((d) => existsSync(d));
    if (!appDir) {
      steps.push(`no Next app router found under ${paths.rel(full.hostRoot)} — add a POST route at ${DEFAULT_ENDPOINT} exporting createCoverageRoute from @motu/coverage/server/next`);
    } else {
      const routeFile = resolve(appDir, 'api/motu/coverage/route.ts');
      const knownFile = resolve(appDir, 'api/motu/coverage/known/route.ts');
      for (const [file, body] of [
        [routeFile, NEXT_ROUTE(host.url, mode)],
        ...(mode === 'forward' ? [[knownFile, NEXT_KNOWN(host.url)]] : []),
      ]) {
        if (existsSync(file) && argv.force !== true) {
          steps.push(`${paths.rel(file)} already exists — kept. \`--force\` rewrites it to the one-secret form`);
          continue;
        }
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, body);
        wrote.push(paths.rel(file));
      }
    }
    steps.push(`the root layout renders <meta name="motu-coverage-endpoint" content="${DEFAULT_ENDPOINT}" />${mode === 'forward' ? ` and <meta name="motu-coverage-known" content="${DEFAULT_ENDPOINT}/known" />` : ''} (skip if present)`);
  } else if (full.host === 'angularjs') {
    endpoint = JAVA_ENDPOINT;
    steps.push('depend on dev.motu:endpoint in the WAR: its servlet registers itself at /motu/coverage through web-fragment.xml (no web.xml edit)');
    steps.push(`the page renders <meta name="motu-coverage-endpoint" content="<context>${JAVA_ENDPOINT}" />`);
    steps.push(mode === 'log' ? 'set the system property -Dmotu.coverage.mode=log (or MOTU_COVERAGE_MODE=log)' : `set -Dmotu.coverage.host=${host.url || '<host url>'} (not a secret)`);
  } else {
    steps.push(`this host (${full.host}) has no server motu writes for: deploy a POST route at ${DEFAULT_ENDPOINT} with @motu/coverage/server's handleCoverage (Web-standard Request/Response — any JS runtime), or the Java servlet`);
  }

  // 2. THE ONE SECRET, minted over the admin API.
  let token = null;
  if (mode === 'forward') {
    if (!host.url || !host.token) {
      steps.push('mint an ingest token: no admin credentials here (~/.config/motu/host.json) — on the host, `motu-host access --repo ' + repo + ' --ingest`');
    } else {
      const res = await fetch(`${host.url}/api/access/ingest?repo=${encodeURIComponent(repo)}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${host.token}` },
      }).catch((err) => ({ ok: false, status: 0, json: async () => ({ error: String(err?.cause?.code ?? err) }) }));
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.token) {
        steps.push(`could not mint an ingest token (${res.status || 'unreachable'}: ${body.error ?? 'no detail'}) — on the host, \`motu-host access --repo ${repo} --ingest\``);
      } else token = body.token;
    }
    const where = existsSync(resolve(full.hostRoot, 'vercel.json'))
      ? 'vercel env add MOTU_COVERAGE_TOKEN production   (paste the token)'
      : full.host === 'angularjs'
        ? '-Dmotu.coverage.token=<token> in the server’s JVM options (or MOTU_COVERAGE_TOKEN in its environment)'
        : 'MOTU_COVERAGE_TOKEN=<token> in the production environment';
    steps.push(`the ONE production step: ${where}`);
  }
  steps.push(`then prove it: motu coverage doctor --url <production origin>${endpoint !== DEFAULT_ENDPOINT ? ` --endpoint <context>${endpoint}` : ''}`);

  if (json) {
    console.log(JSON.stringify({ ok: true, mode, repo, host: host.url || null, wrote, token, steps }, null, 2));
    return 0;
  }
  console.log(`${color.green('✓')} coverage for ${color.bold(repo)} — ${mode} mode${host.url && mode === 'forward' ? color.dim(` → ${host.url}`) : ''}`);
  for (const f of wrote) console.log(color.dim(`  wrote ${f}`));
  if (token) {
    console.log('');
    console.log(`  ${color.bold('MOTU_COVERAGE_TOKEN')}=${token}`);
    console.log(color.dim('  shown once; it can only WRITE coverage for this repo (and read back its accepted states).'));
  }
  console.log('');
  steps.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
  return 0;
}
