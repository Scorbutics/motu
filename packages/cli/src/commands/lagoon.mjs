// `motu lagoon publish [target]` — build the lagoon as ONE self-contained HTML file, ready to be
// published as an Artifact (a hosted page on claude.ai) so the lagoon can be looked at from a phone
// with no dev server, no tunnel and no backend running.
//
// This command produces the FILE; the agent driving it publishes that file with the Artifact tool.
// The split is not a shortcut — publishing is a hosted-page operation, not something a node script
// can do — but the file is the whole deliverable: everything else is a single tool call.
//
// Why a single file: an artifact page is served under a strict CSP with nothing behind it. No
// /assets/*.js, no /api proxy, no dev server. So the build must be one chunk (MOTU_SINGLEFILE, see
// the lagoon's vite.config) with the JS and CSS inlined, and the transport must be `mock` — which
// is the lagoon's contract anyway: fixtures, no ocean.
//
// `motu lagoon serve [target]` builds the SAME artifact and serves it over http instead of writing
// it. That is the check nothing else performs: `dev:lagoon` serves the source through vite with the
// dev proxy, so it never proves the inlining worked, the mock transport renders with no backend, or
// the page survives with no /assets/ behind it. Serving the artifact does.
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync, statSync, watch as fsWatch } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { regionDeclaresPage } from '../lib/lagoon-declares.mjs';
import { injectDock } from '../lib/dock-inject.mjs';
import { clearLiveUrl, writeLiveUrl } from '../lib/live-url.mjs';
import { createServer } from 'node:http';
import { motuDockCss, motuDockJs } from '@motu/chrome/dock';
import { networkInterfaces } from 'node:os';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT, APP_ROOT, paths, names, color } from '../lib/util.mjs';
import { gitIdentity, uploadLagoon, loadHostConfig } from '../lib/remote.mjs';

/** The framework's own lagoon build runner — replaces the vite.config.ts each project used to carry. */
const LAGOON_BUILD = fileURLToPath(new URL('../lagoon-build.mjs', import.meta.url));


/**
 * Resolve the CLI's target flags into what the lagoon build needs.
 * No target => the switcher entry (index.html), which shows every archipelago — the best default for
 * browsing on a phone. A target => the focused entry (lagoon.html), one island or one archipelago.
 */
function resolveTarget(argv) {
  const positional = argv._[0];
  const island = argv.island || (positional && !argv.archipelago ? positional : undefined);
  const archipelago = argv.archipelago === true ? positional : argv.archipelago;

  if (archipelago) {
    if (!existsSync(paths.archipelagoFile(archipelago)))
      throw new Error(`unknown archipelago "${archipelago}" — no ${paths.rel(paths.archipelagoFile(archipelago))}`);
    // The GALLERY entry, focused on this region — not the bare single-target one. `serve` and
    // `publish` are for a human to look at, and the chrome (tide line, seam lens, the transport and
    // fit chips) is most of what makes the lagoon worth looking at. The bare entry exists for
    // `motu island verify`, which drives lagoon.html directly and wants nothing else on the page.
    return {
      entry: 'main',
      target: `archipelago:${archipelago}`,
      slug: `archipelago-${archipelago}`,
      title: `${names(archipelago).pascal} Lagoon`,
    };
  }
  if (island) {
    const { kebab, tag, pascal } = names(island);
    // BOTH LAYOUTS. This looked for the FOLDER form (`src/islands/<kebab>/`) only, while
    // `motu island create` scaffolds the FLAT form (`src/islands/<kebab>.island.ts`) — so the command
    // that exists for looking at a new island rejected every island the scaffolder makes, with
    // "unknown island" for one that is registered and passes verify. `paths.elementFile` already
    // resolves either shape; the rest of the CLI has used it all along.
    if (!existsSync(paths.elementFile(kebab)))
      throw new Error(
        `unknown island "${island}" — neither ${paths.rel(paths.islandDir(kebab))}/element.ts nor ` +
          `src/islands/${kebab}.island.ts exists`,
      );
    return { entry: 'lagoon', target: `island:${tag}`, slug: `island-${kebab}`, title: `${pascal} Lagoon` };
  }
  return { entry: 'main', target: '', slug: 'all', title: 'Motu Lagoon' };
}

/** Build the chosen entry as one chunk, mock-backed. Returns the built HTML path. */
function buildSingleFile({ entry, target, fit }) {
  const res = spawnSync(process.execPath, [LAGOON_BUILD], {
    // The project root, not the lagoon: the build resolves motu.config.json by walking up from cwd.
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      MOTU_SINGLEFILE: entry,
      MOTU_NO_SSL: '1',
      // Non-negotiable: an artifact has no /api proxy behind it, so `http` would render an island
      // that fails every call. Fixtures are what makes the published page work standalone.
      MOTU_TRANSPORT: 'mock',
      MOTU_TARGET: target,
      ...(fit ? { MOTU_FIT: fit } : {}),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
  if (res.status !== 0)
    throw new Error(`lagoon build failed:\n${(res.stdout || '') + (res.stderr || '')}`);
  // WHAT THE BUILD LEFT OUT, surfaced from the child. A successful build that quietly dropped an
  // island is worse than a failed one: the gallery opens, the island is a placeholder, and nobody
  // knows why. See the `[motu:excluded]` marker in lagoon-vite.mjs.
  reportExclusions((res.stdout || '') + (res.stderr || ''));
  const html = resolve(paths.lagoonDir, 'dist', entry === 'lagoon' ? 'lagoon.html' : 'index.html');
  if (!existsSync(html)) throw new Error(`build produced no ${paths.rel(html)}`);
  return html;
}


/** Print the islands a build stubbed out, read from the child's marked lines. */
export function reportExclusions(output) {
  const lines = String(output)
    .split('\n')
    .filter((l) => l.includes('[motu:excluded]'))
    .map((l) => l.slice(l.indexOf('[motu:excluded]') + '[motu:excluded]'.length).trim());
  if (!lines.length) return;
  console.warn(
    color.yellow(`! ${lines.length} island(s) left out of this build — they cannot be bundled, and the rest of the lagoon still works:`),
  );
  for (const l of lines) console.warn(color.dim(`    · ${l}`));
  console.warn(color.dim('    Their slots render a placeholder saying why. `motu island verify <name>` gives the full chain.'));
}

/** Inline a built asset reference's contents, keeping the file safe to embed inside HTML. */
function readAsset(distDir, url) {
  const file = resolve(distDir, url.replace(/^\//, ''));
  if (!existsSync(file)) throw new Error(`asset referenced but not built: ${url}`);
  // A literal "</script" inside a string in the bundle would close the inline tag early. Escaping the
  // slash is inert inside JS/CSS but stops the HTML parser dead.
  return readFileSync(file, 'utf8').replace(/<\/script/gi, '<\\/script');
}

/**
 * Turn the built multi-file page into one artifact-ready document: assets inlined, and the
 * <!doctype>/<html>/<head>/<body> skeleton dropped (the artifact wrapper supplies its own).
 */
function inlineToArtifact(htmlPath, title) {
  const distDir = resolve(htmlPath, '..');
  let html = readFileSync(htmlPath, 'utf8');

  html = html.replace(
    /<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/gi,
    (_m, src) => `<script type="module">\n${readAsset(distDir, src)}\n</script>`,
  );
  html = html.replace(
    /<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/gi,
    (_m, href) => `<style>\n${readAsset(distDir, href)}\n</style>`,
  );
  // Preload hints point at files that will not exist once everything is inlined.
  html = html.replace(/<link\b[^>]*\brel="modulepreload"[^>]*>\s*/gi, '');

  html = html
    .replace(/<!doctype html>\s*/i, '')
    .replace(/<\/?(?:html|head|body)\b[^>]*>\s*/gi, '')
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`);

  // The honest check: anything still pointing at /assets/ is a request the CSP will block, which
  // would show up as a silently blank page rather than an error. Fail here instead.
  const dangling = html.match(/["'(]\/assets\/[^"')]+/g);
  if (dangling) throw new Error(`could not inline every asset — still referenced: ${[...new Set(dangling)].join(', ')}`);

  return html.trim() + '\n';
}

/**
 * A STABLE path per target: republishing the same file path redeploys to the same artifact URL, so a
 * link already sitting on your phone keeps working instead of being superseded. `serve --no-build`
 * reads back exactly what `publish` wrote here.
 */
function publishFile(slug) {
  return resolve(REPO_ROOT, '.motu/publish', `lagoon-${slug}.html`);
}

export async function lagoonPublishCommand(argv) {
  const json = !!argv.json;
  let resolved;
  try {
    resolved = resolveTarget(argv);
  } catch (err) {
    console.error(color.red(`✗ ${err.message}`));
    process.exit(1);
  }
  const { entry, target } = resolved;
  // Same override as `serve`, and it has to be BOTH: publishing under one slug while the dev server
  // registers itself under another is a live member the gallery can never match to a published one.
  const slug = paths.publishAs?.slug ?? resolved.slug;
  // The derived title says WHAT was built ('Motu Lagoon'); in a composed view listing several repos'
  // switcher entries it says nothing, so a project can name its own.
  //
  // DECLARED, not only passed. It used to be a flag alone, so a republish that did not repeat the
  // flag silently renamed the project back to 'Motu Lagoon' in every gallery — which is exactly what
  // happened to acme here. The flag still wins for a one-off.
  const title =
    typeof argv.title === 'string' ? argv.title.slice(0, 200) : (declaredTitle() ?? resolved.title);
  const fit = argv.fit === 'legacy' ? 'legacy' : argv.fit === 'native' ? 'native' : '';

  if (!json) console.log(color.dim(`building ${target || 'all archipelagos'} (mock fixtures, one chunk)…`));
  const built = buildSingleFile({ entry, target, fit });
  const page = inlineToArtifact(built, title);

  const out = argv.out ? resolve(REPO_ROOT, argv.out) : publishFile(slug);
  mkdirSync(resolve(out, '..'), { recursive: true });
  writeFileSync(out, page, 'utf8');

  const bytes = statSync(out).size;

  // BEFORE the --json early return, not after: `--json --remote` is the agent's spelling of this
  // command, and returning the local report there would print `ok: true` for an upload that never
  // happened. uploadPublished owns the json shape for its own leg.
  const hostCfg = loadHostConfig();
  const remote = argv.remote === true ? process.env.MOTU_HOST_URL || hostCfg.url : argv.remote;
  if (remote) return uploadPublished({ remote, token: typeof argv.token === 'string' ? argv.token : null, page, slug, title, out, bytes, json });

  if (json) {
    console.log(JSON.stringify({ ok: true, file: out, title, target: target || null, fit: fit || null, bytes }, null, 2));
    return 0;
  }

  console.log('');
  console.log(`${color.green('✓')} ${color.bold(title)} — ${(bytes / 1024).toFixed(0)} kB, self-contained`);
  console.log('  ' + color.dim(paths.rel(out)));
  console.log('');
  console.log('  Publish it with the Artifact tool, same file path every time to keep one URL:');
  console.log('  ' + color.dim(`Artifact({ file_path: "${out}", favicon: "🏝️", description: "…" })`));
  if (!process.env.MOTU_HOST_URL)
    console.log('  ' + color.dim('Or host it yourself: motu lagoon publish --remote <url>  (see motu-host)'));
  return 0;
}

/**
 * Send the file that was just written to a lagoon host.
 *
 * Deliberately AFTER the local write, never instead of it: `--remote` adds a destination, it does not
 * replace the artifact. If the host is down, or the token is wrong, the page is still on disk and
 * still publishable as an Artifact — a network failure must not cost you the build.
 */
/**
 * The project's own colour, from `lagoon.config.json`'s `chrome.brand`.
 *
 * NOT `chrome.primary`, deliberately. That one is for the lagoon itself and is allowed to reference
 * the host's own CSS variables (acme writes `hsl(var(--primary-control))`), which resolve inside that
 * app and nowhere else — a host listing repositories would be handed a colour it cannot compute.
 * `brand` is the same decision written so it travels: any self-contained CSS colour.
 */
/** What this project calls its lagoon, from `lagoon.config.json`'s `title`. */
function declaredTitle() {
  return readLagoonConfig()?.title?.trim?.() || null;
}

/** The project's lagoon config, or null. Parsed once per process, and never fatal here. */
function readLagoonConfig() {
  const file = resolve(paths.lagoonDir, 'lagoon.config.json');
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    // A lagoon config that does not parse is a problem the lagoon itself reports, with a line number.
    // Publishing should not die second, with a worse message.
    return null;
  }
}

function declaredBrand() {
  const brand = readLagoonConfig()?.chrome?.brand;
  return typeof brand === 'string' && brand.trim() ? brand.trim() : null;
}

async function uploadPublished({ remote, token: flagToken, page, slug, title, out, bytes, json }) {
  const url = remote === true ? null : String(remote);
  if (!url || !/^https?:\/\//.test(url)) {
    console.error(color.red('✗ --remote needs a host URL — pass one, set MOTU_HOST_URL, or put {"url","token"} in ~/.config/motu/host.json'));
    process.exit(1);
  }
  const id = gitIdentity(REPO_ROOT);
  // A project may say who it is, for the case git cannot answer: several publishable apps in one
  // repository. The commit and branch still come from git — those are facts about this build.
  if (paths.publishAs?.repo) id.repo = paths.publishAs.repo;
  if (!id.repo) {
    console.error(color.red('✗ could not derive a repo name from the git remote or the directory name'));
    process.exit(1);
  }
  const token = flagToken || process.env.MOTU_HOST_TOKEN || loadHostConfig().token || null;

  let res;
  try {
    res = await uploadLagoon({ url, token, repo: id.repo, slug, title, sha: id.sha, branch: id.branch, brand: declaredBrand(), body: page, });
  } catch (err) {
    if (json) {
      console.log(JSON.stringify({ ok: false, file: out, bytes, error: err.message }, null, 2));
      return 1;
    }
    console.error(color.red(`✗ ${err.message}`));
    console.error(color.dim(`  the page is still on disk: ${paths.rel(out)}`));
    return 1;
  }

  const latest = `${res.base}${res.urls.latest}`;
  const immutable = `${res.base}${res.urls.immutable}`;
  if (json) {
    console.log(JSON.stringify({ ok: true, file: out, bytes, repo: id.repo, slug, deduped: !!res.deduped, urls: { latest, immutable, ...(res.urls.branch ? { branch: `${res.base}${res.urls.branch}` } : {}) } }, null, 2));
    return 0;
  }
  console.log('');
  console.log(`${color.green('✓')} ${color.bold(title)} — ${(bytes / 1024).toFixed(0)} kB` +
    color.dim(` (${(res.sentBytes / 1024).toFixed(0)} kB gzipped)${res.deduped ? ' · unchanged, deduped' : ''}`));
  console.log(`  ${latest}   ${color.dim('(the bookmark — always current)')}`);
  console.log(`  ${immutable}   ${color.dim('(this build, forever)')}`);
  if (id.dirty) console.log(color.yellow('  working tree is dirty — the immutable URL is keyed by content, not by HEAD'));
  // The host sees what only a host can: paths that resolve against the ORIGIN. They work in
  // `lagoon dev` (vite serves them) and 404 once published, so this is the first place they surface.
  for (const w of res.warnings ?? []) console.log(color.yellow(`  ${w}`));
  console.log('  ' + color.dim(paths.rel(out)));
  return 0;
}

/**
 * Put back the document skeleton the artifact host would have supplied.
 *
 * `inlineToArtifact` deliberately drops <!doctype>/<html>/<head>/<body> — the artifact wrapper owns
 * them. A browser will limp along without them, but it gets no charset and no viewport meta, so the
 * page renders desktop-width on exactly the device this command exists to test. The fragment keeps
 * its own <title>, so this adds nothing but the skeleton.
 */
function wrapForBrowser(page) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body>
${page}</body>
</html>
`;
}

/**
 * The dock, drawn by the SERVER rather than bundled into the page.
 *
 * This is the second consumer of `@motu/chrome/dock`, and the reason that module exists rather than a
 * stylesheet in the host: the host app frames a published artifact, `motu lagoon serve` serves one
 * directly, and both must draw the same dock. A copy in each is two chromes that drift — and the dev
 * loop and every runtime check run through THIS one, so a divergence here is a divergence between
 * what a person sees while working and what the checks assert on.
 *
 * IT ONLY TAKES OVER A LAGOON IT CAN DRIVE, per page, decided in the browser. An artifact built
 * before `__motuLagoonControl` existed can list nothing and switch nothing, so hiding its own dock
 * would take the controls away and put nothing in their place. Same rule the host applies, for the
 * same reason.
 *
 * Injected, never bundled: that is the whole point. Change the dock and no lagoon needs rebuilding.
 */

/**
 * A rebuild is only useful if the phone in your hand notices it, so `--watch` also injects a tiny
 * live-reload client that listens on an SSE endpoint this same server owns.
 *
 * Injected ONLY in watch mode, never by `publish`: a published artifact is served under a strict CSP
 * with nothing behind it, so a page that dials home would be both broken and a lie about what the
 * artifact is. This is the one place the served page deliberately differs from the published one.
 */
function injectReloadClient(page) {
  return `${page}
<script>
(function () {
  // Reconnects on its own: the server restarts (or the phone sleeps) far more often than you reload.
  function listen() {
    // Relative to WHERE THIS PAGE IS, not to the origin root: framed in a host's shell the page lives
    // at /<repo>/<ref>/<slug>/__motu_frame, and an absolute '/__motu_reload' would ask the host for a
    // stream it does not have instead of the dev server for the one it does.
    //
    // NO REGEX HERE, deliberately. This whole client lives inside a template literal, where a
    // backslash starts an escape sequence JS resolves before the string is ever written out — so a
    // trailing-slash regex was emitted with its backslash eaten, turning the rest of the line into a
    // comment. The script then failed to parse, no EventSource was ever constructed, and the only
    // symptom was a page that quietly stopped reloading. Nothing here needs a backslash, so nothing
    // here has one. (This comment cannot carry backticks either, for the same reason.)
    var here = location.pathname;
    while (here.length > 1 && here.charAt(here.length - 1) === '/') here = here.slice(0, -1);
    // AT THE ROOT this must become the empty string, not '/'. Served standalone the page IS at '/',
    // and '/' + '/__motu_reload' is '//__motu_reload' — a protocol-relative URL naming a host called
    // __motu_reload, which fails on the one path this feature has always worked on.
    if (here === '/') here = '';
    var es = new EventSource(here + '/__motu_reload');
    es.onmessage = function (e) { if (e.data === 'reload') location.reload(); };
    es.onerror = function () { es.close(); setTimeout(listen, 1500); };
  }
  listen();
})();
</script>`;
}

/**
 * Where a rebuild can come from. The lagoon entry, the app's own sources, and — in this monorepo,
 * where @motu/* resolve to workspace source rather than to a published tarball — the framework
 * packages, so editing the lagoon chrome in packages/react rebuilds too.
 *
 * Nested roots are dropped (the lagoon lives inside the app root), because a recursive watch on both
 * would deliver every event twice.
 */
/**
 * The live `FSWatcher`s, held at module scope so nothing collects them AND so they can be re-armed.
 *
 * Two failures, one symptom — `--watch` stops rebuilding, silently, while the server keeps serving a
 * stale page. That is the worst shape this can take: on the phone in your hand there is no console,
 * and a page that loads looks like a page that is current.
 *
 * 1. `fsWatch()`'s return value was dropped on the floor. An FSWatcher nobody references can be
 *    garbage-collected, and when V8 takes it the watch ends.
 * 2. The BUILD kills the watch. Node's recursive watch on Linux is per-directory underneath, and a
 *    vite build churns directories inside the watched root (`.motu/`, vite's caches); when those go,
 *    the watcher can close without ever emitting an error anyone sees.
 *
 * So holding the reference is necessary and not sufficient: they are also re-armed after every
 * rebuild, which is precisely when they die. Re-arming is a handful of inotify calls.
 */
const WATCHERS = [];

function watchRoots() {
  const candidates = [APP_ROOT, paths.lagoonDir, resolve(REPO_ROOT, 'packages')].filter((p) => existsSync(p));
  return candidates.filter((p) => !candidates.some((other) => other !== p && p.startsWith(other + sep)));
}

/** Source files worth a rebuild. Everything else — build output above all — must not feed the loop. */
function isSourceChange(file) {
  if (!file) return false;
  const path = file.split(sep).join('/');
  // dist/ is the vite build's OWN output: reacting to it would make every build trigger the next one.
  if (/(^|\/)(node_modules|dist|\.motu|\.git)(\/|$)/.test(path)) return false;
  return /\.(ts|tsx|js|jsx|css|html|json)$/.test(path);
}

/** First real LAN IPv4 — docker/virtual bridges are skipped, they are never the phone's route here. */
function lanAddress() {
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    if (/^(docker|br-|veth|virbr|tun|tap)/.test(name)) continue;
    for (const a of addrs ?? []) if (a.family === 'IPv4' && !a.internal) return a.address;
  }
  return null;
}

export function lagoonServeCommand(argv) {
  let resolved;
  try {
    resolved = resolveTarget(argv);
  } catch (err) {
    console.error(color.red(`✗ ${err.message}`));
    process.exit(1);
  }
  const { entry, target, title } = resolved;
  // BRANCH-SCOPED, exactly as `lagoon dev` is. `serve --watch --live-push` announces to the host too,
  // so without this a preview of a work-in-progress branch overwrites the member a team bookmarks —
  // the same collision the dev server already avoids. A publish is deliberate and keeps its own slug.
  const slug = liveSlugFor(paths.publishAs?.slug ?? resolved.slug, argv, REPO_ROOT);
  const fit = argv.fit === 'legacy' ? 'legacy' : argv.fit === 'native' ? 'native' : '';

  const port = Number.parseInt(String(argv.port ?? 8817), 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(color.red(`✗ --port must be 1-65535, got "${argv.port}"`));
    process.exit(1);
  }
  // Loopback by default: serving the app to the whole network is opt-in, not a side effect of preview.
  const lan = argv.host === true || argv.host === '0.0.0.0';
  const bind = lan ? '0.0.0.0' : '127.0.0.1';

  // WHERE THE HOST SHOULD COME AND FETCH THIS, when it is not here.
  //
  // The registry has always stored a URL rather than a port, and this is the flag that finally makes
  // that mean something: the announcement said `http://127.0.0.1:<port>` unconditionally, so a live
  // lagoon only worked when the host happened to share a machine with the dev server. Give it a
  // reachable address — a tailnet name, an `ssh -R` tunnel, anything the host can resolve — and the
  // same feature works from a laptop the host has never heard of.
  //
  // VALIDATED HERE, LOUDLY, because the failure is otherwise silent in the worst way: the host stores
  // whatever it is given, every fetch of it fails, and each viewer quietly falls back to the last
  // published build. The page renders. It is just not live, and nothing says so.
  const liveUrlRaw = typeof argv['live-url'] === 'string' ? argv['live-url'] : process.env.MOTU_LIVE_URL || '';
  let liveUrl = '';
  if (liveUrlRaw) {
    let parsed;
    try {
      parsed = new URL(liveUrlRaw);
    } catch {
      console.error(color.red(`✗ --live-url must be an absolute URL, got "${liveUrlRaw}"`));
      console.error(color.dim('  e.g. --live-url https://my-laptop.tailnet.ts.net:8901'));
      process.exit(1);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      console.error(color.red(`✗ --live-url must be http or https, got "${parsed.protocol}"`));
      process.exit(1);
    }
    // A LOOPBACK ADDRESS HERE IS ALMOST CERTAINLY A MISTAKE, and it is the mistake this flag exists to
    // fix — passing it means announcing the default, from a machine that needed the flag. Refused
    // rather than warned: a warning scrolls past and the symptom is a badge that lies.
    if (/^(127\.|0\.0\.0\.0$|\[?::1\]?$|localhost$)/.test(parsed.hostname)) {
      console.error(color.red(`✗ --live-url points at ${parsed.hostname}, which is this machine.`));
      console.error(color.dim('  That is what the announcement already says. Give the host an address IT can reach —'));
      console.error(color.dim('  a tailnet name, a tunnel, a LAN IP — or drop the flag if the host runs here too.'));
      process.exit(1);
    }
    // Trailing slash trimmed: the host joins this with a path, and `//__motu_reload` is a
    // protocol-relative URL naming a host called __motu_reload. The reload client learned that one.
    liveUrl = liveUrlRaw.replace(/\/+$/, '');
  }
  // PUSH INSTEAD OF BEING PULLED. `--live-url` tells the host where to come and fetch this; this
  // sends the artifact instead, over the same outbound connection the announcement already uses. It
  // is the option for a machine nothing can reach — no tunnel, no tailnet, no LAN route — and it
  // works because a lagoon is ONE self-contained file, so there is nothing else a viewer can ask for.
  const pushing = argv['live-push'] === true;
  if (pushing && liveUrl) {
    console.error(color.red('✗ --live-push and --live-url are two answers to the same question.'));
    console.error(color.dim('  --live-url: the host fetches from you (it must be able to reach you).'));
    console.error(color.dim('  --live-push: you send it to the host (nothing has to reach you).'));
    process.exit(1);
  }
  if (liveUrl && !lan) {
    // Announcing an address the host can reach while listening only on loopback means the host will
    // arrive and find nothing. The two flags belong together, and the pair is easy to half-remember.
    console.error(color.red('✗ --live-url without --host: this would listen on 127.0.0.1 only,'));
    console.error(color.dim('  so the host would resolve the address you gave it and then be refused.'));
    console.error(color.dim('  Add --host to accept connections from outside this machine.'));
    process.exit(1);
  }

  /**
   * Tell the host we are going, if we ever told it we were here.
   *
   * HOISTED TO ONE PLACE because there were TWO SIGINT handlers and they raced: `registerLive`
   * registered one that awaited a network round trip, and the server's own registered one that closed
   * the socket and called `process.exit(0)`. Exit won essentially always, so Ctrl-C — the way every
   * person actually stops this — left the member registered and the badge lit until the 90s TTL ran
   * out. It looked like it worked because a SIGTERM (`pkill`) hits only the first handler, and that
   * is what I happened to test with.
   */
  let sayGoodbye = async () => {};

  const watching = argv.watch === true;
  if (watching && argv.build === false) {
    console.error(color.red('✗ --watch and --no-build contradict each other — --no-build never rebuilds'));
    process.exit(1);
  }

  let page;
  if (argv.build === false) {
    const file = publishFile(slug);
    if (!existsSync(file)) {
      console.error(color.red(`✗ nothing published at ${paths.rel(file)} — drop --no-build, or run motu lagoon publish first`));
      process.exit(1);
    }
    page = readFileSync(file, 'utf8');
  } else {
    console.log(color.dim(`building ${target || 'all archipelagos'} (mock fixtures, one chunk)…`));
    try {
      page = inlineToArtifact(buildSingleFile({ entry, target, fit }), title);
    } catch (err) {
      console.error(color.red(`✗ ${err.message}`));
      process.exit(1);
    }
  }

  // The served bytes are a VARIABLE, not a constant: --watch swaps them in place, so the funnel or
  // LAN URL in front of this server never has to be re-pointed to see new work.
  let body = Buffer.from(wrapForBrowser(injectDock(watching ? injectReloadClient(page) : page)), 'utf8');
  /** Open live-reload streams, one per viewer (a laptop and a phone on the same URL is the point). */
  const viewers = new Set();

  // One artifact, no asset requests to route: every path serves the page, so deep links work too.
  const server = createServer((req, res) => {
    if (req.url === '/favicon.ico') return void res.writeHead(204).end(); // keeps the console clean
    // ENDS WITH, not equals. Inside a host's shell the page is served at
    // /<repo>/<ref>/<slug>/__motu_frame, and the injected client asks for `<that path>/__motu_reload`
    // so the host can route the stream back here.
    // Standing alone at :8817 the path is exactly '/__motu_reload', which still ends with it.
    if (watching && String(req.url).split('?')[0].endsWith('/__motu_reload')) {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-store',
        connection: 'keep-alive',
        // The funnel sits in front of this; without it the stream is buffered and nothing arrives.
        'x-accel-buffering': 'no',
      });
      res.write('retry: 1500\n\n');
      viewers.add(res);
      req.on('close', () => viewers.delete(res));
      return;
    }
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'content-length': body.length,
      'cache-control': 'no-store', // a republish behind the same URL must not serve a stale page
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') console.error(color.red(`✗ port ${port} is already in use — pass --port <n>`));
    else if (err.code === 'EACCES') console.error(color.red(`✗ not allowed to bind port ${port} — pick one above 1024`));
    else console.error(color.red(`✗ ${err.message}`));
    process.exit(1);
  });

  server.listen(port, bind, () => {
    const ip = lan ? lanAddress() : null;
    console.log('');
    console.log(`${color.green('✓')} ${color.bold(title)} — ${(body.length / 1024).toFixed(0)} kB, self-contained, mock-backed`);
    console.log(`  http://localhost:${port}`);
    if (ip) console.log(`  http://${ip}:${port}   ${color.dim('(LAN — open this on a phone on the same wifi)')}`);
    else if (lan) console.log(color.dim('  (no LAN address found — only loopback is up)'));
    else console.log(color.dim(`  --host also serves it on your LAN, for testing on a phone`));
    console.log('');
    console.log(color.dim('  Off-network? Tunnel it — no install, uses the ssh you already have:'));
    console.log(color.dim(`  ssh -R 80:localhost:${port} nokey@localhost.run`));
    console.log(color.dim('  That URL is PUBLIC while the tunnel runs. If the host resolves to 127.0.0.1'));
    console.log(color.dim('  (systemd-resolved does this — the name starts with "localhost"), dial the IP:'));
    console.log(color.dim(`  ssh -o HostKeyAlias=localhost.run -R 80:localhost:${port} nokey@$(dig +short localhost.run @1.1.1.1 | head -1)`));
    console.log('');
    console.log(color.dim('  Ctrl-C to stop.'));
  });

  if (watching) startWatching();
  if (watching) registerLive();
  /**
   * Send the built artifact to the host, as the current draft for this lagoon.
   *
   * BEST EFFORT, like the announcement, and for the same reason: a preview must not fail because a
   * host is down. But a REFUSAL is said once — the announcement taught that lesson by swallowing one
   * for twenty-six seconds while the gallery quietly showed the last published build.
   *
   * NOT AWAITED by the rebuild, so a slow link never delays the local reload. The pushes are
   * SERIALISED though: two saves a second apart must not race and leave the older bytes as the draft,
   * which is a bug that would show up as "it reloaded and nothing changed" once in a while.
   */
  // DECLARED ABOVE THE FIRST CALL, and that is not stylistic. `function pushDraft` hoists and these
  // do not, so the startup push below — which used to sit above this block — threw
  // "Cannot access 'pushInFlight' before initialization" and took the whole server down with it.
  let pushInFlight = null;
  let pushQueued = false;
  let pushRefused = false;
  function pushDraft() {
    if (!pushing) return;
    if (pushInFlight) {
      pushQueued = true;
      return;
    }
    const cfg = loadHostConfig();
    const base = (process.env.MOTU_HOST_URL || cfg.url || '').replace(/\/+$/, '');
    const hostToken = process.env.MOTU_HOST_TOKEN || cfg.token || null;
    if (!base || !hostToken) return;
    const repo = paths.publishAs?.repo ?? gitIdentity(REPO_ROOT).repo;
    const qs = `repo=${encodeURIComponent(repo)}&slug=${encodeURIComponent(slug)}`;
    // SNAPSHOT THE BYTES. `body` is reassigned by every rebuild, so reading it after the await would
    // sometimes send a newer artifact under an older push's completion — harmless here, and exactly
    // the kind of thing that makes a race impossible to reason about later.
    const bytes = body;
    pushInFlight = fetch(`${base}/api/live/draft?${qs}`, {
      method: 'POST',
      headers: { 'content-type': 'text/html; charset=utf-8', authorization: `Bearer ${hostToken}` },
      body: bytes,
    })
      .then(async (res) => {
        if (!res.ok && !pushRefused) {
          pushRefused = true;
          const why = await res.json().catch(() => null);
          console.error(color.red(`  ✗ the host refused this draft: ${why?.error ?? res.status}`));
        }
      })
      .catch(() => {
        /* the host is unreachable; the local preview is unaffected and the next save tries again */
      })
      .finally(() => {
        pushInFlight = null;
        if (pushQueued) {
          pushQueued = false;
          pushDraft();
        }
      });
  }

  // The first draft goes up immediately: the artifact is already built by the time we get here, and
  // waiting for the first SAVE would leave the host showing the last published build until somebody
  // typed — which is the exact confusion this feature exists to remove.
  if (watching && pushing) pushDraft();

  /**
   * Tell the lagoon host this member is being served live, and keep telling it.
   *
   * The composed gallery then serves THIS process in that member's frame — one URL for the whole
   * gallery, live where a dev server happens to be running and the last published build everywhere
   * else. Without it the gallery could only ever show what had been published, which is why a page
   * under active work looked static there.
   *
   * The heartbeat is what makes a killed process harmless: the host expires an entry that stops being
   * refreshed and falls back to the stored bytes. `off` on exit is the polite version of the same
   * thing, and it is best-effort by design — nothing here should keep the CLI alive.
   */
  function registerLive() {
    const cfg = loadHostConfig();
    const base = (process.env.MOTU_HOST_URL || cfg.url || '').replace(/\/+$/, '');
    const hostToken = process.env.MOTU_HOST_TOKEN || cfg.token || null;
    if (!base || !hostToken) return; // no host configured: serving locally is the whole feature
    // THE SAME IDENTITY PUBLISHING USES. Taking the git repo here while publish takes the override
    // registers a live member under a name the gallery has no published member for — so the frame
    // never goes live and nothing says why. (It did exactly that: Scorbutics/motu:all against a
    // published motu-review:all.)
    const repo = paths.publishAs?.repo ?? gitIdentity(REPO_ROOT).repo;
    const qs = `repo=${encodeURIComponent(repo)}&slug=${encodeURIComponent(slug)}`;
    const call = (path, body, extra) => {
      const search = new URLSearchParams(qs);
      for (const [k, v] of Object.entries(extra ?? {})) search.set(k, v);
      return fetch(`${base}${path}?${search}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${hostToken}` },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }).catch(() => null);
    };

    let announced = false;
    let refused = false;
    const beat = async () => {
      // PUSHING REPLACES ANNOUNCING. Doing both registered the member TWICE — once as a URL to come
      // and fetch, once as bytes already held — for one lagoon a viewer cannot tell apart. When we
      // are pushing, this loop is only a HEARTBEAT: it stops the draft expiring during a long think,
      // and the bytes themselves go up on save.
      if (pushing) {
        const beatRes = await call('/api/live/draft', null, { touch: '1' });
        // A 404 MEANS THE HOST NO LONGER HOLDS IT, and the heartbeat cannot revive what is not there.
        // Drafts live in the host's memory, so a host restart — or the 32-draft cap evicting the
        // least recently refreshed — forgets one while the dev server it belongs to is still running
        // happily. Without this the lagoon goes dark until somebody saves a file, and nothing says
        // why: the CLI is fine, the host is fine, and the page quietly serves the last publish.
        // Re-send the bytes we already have, which is exactly what a save would have done.
        if (beatRes?.status === 404) pushDraft();
        return;
      }
      const announceUrl = liveUrl || `http://127.0.0.1:${port}`;
      const res = await call('/api/live', { url: announceUrl });
      // A REFUSAL IS SAID ONCE, and until now it was said never. The announcement is best-effort by
      // design — nothing here should keep the CLI alive or fail a preview — but "best effort" was
      // implemented as swallowing the response, so a host that REJECTED the registration produced no
      // output at all. I watched this happen for twenty-six seconds: the server started, the page
      // served, and the only symptom was a gallery that never went live and never said why.
      //
      // Once, not every beat: this retries every 30 seconds and a wrong URL stays wrong.
      if (res && !res.ok && !refused) {
        refused = true;
        const why = await res.json().catch(() => null);
        console.error(color.red(`  ✗ the host refused this as a live member: ${why?.error ?? res.status}`));
        console.error(color.dim(`    announced: ${announceUrl}`));
      }
      if (res?.ok && !announced) {
        announced = true;
        // ITS OWN ADDRESS, which is the only one there is now. This printed `${base}/g/<group>` — a
        // placeholder the reader had to resolve to a group name, for a route that no longer exists.
        console.log(color.dim(`  live at: ${base}/${repo}/latest/${slug}`));
        // THE ADDRESS IS PRINTED, always. It is the one value here nobody can check from the outside:
        // if the host cannot reach it, every viewer silently sees the last published build instead,
        // and this line is the only place the actual announcement is visible.
        console.log(color.dim(`  the host will fetch it from: ${announceUrl}`));
      }
    };
    void beat();
    const timer = setInterval(beat, 30_000);
    timer.unref?.();

    let leaving = false;
    sayGoodbye = async () => {
      if (leaving) return;
      leaving = true;
      clearInterval(timer);
      // A DEADLINE, because shutting down must not hang on a host that has gone away. Two seconds is
      // long enough for a round trip to a machine on the same network and short enough that nobody
      // reaches for a second Ctrl-C, which would skip this entirely.
      await Promise.race([call('/api/live/off'), new Promise((r) => setTimeout(r, 2000))]);
    };
  }

  /**
   * Rebuild on source change, debounced, and never concurrently: a vite build takes seconds, and a
   * burst of saves (or one editor writing several files) must collapse into one build. A build that
   * fails keeps the LAST GOOD bytes on the wire — a broken page is worse than a slightly stale one,
   * especially on the phone you are holding, where there is no console to explain it.
   */
  function startWatching() {
    const roots = watchRoots();
    let timer = null;
    let building = false;
    let queued = false;

    const rebuild = () => {
      if (building) {
        queued = true;
        return;
      }
      building = true;
      const started = Date.now();
      try {
        const fresh = inlineToArtifact(buildSingleFile({ entry, target, fit }), title);
        body = Buffer.from(wrapForBrowser(injectDock(injectReloadClient(fresh))), 'utf8');
        const secs = ((Date.now() - started) / 1000).toFixed(1);
        console.log(
          `${color.green('✓')} rebuilt in ${secs}s — ${(body.length / 1024).toFixed(0)} kB` +
            (viewers.size ? color.dim(` · reloading ${viewers.size} viewer(s)`) : ''),
        );
        for (const res of viewers) res.write('data: reload\n\n');
        // AND THE HOST, if we are pushing. After the local viewers, because a rebuild that reaches
        // the browser on this machine and fails to reach the host is a better outcome than the
        // reverse — and because `pushDraft` is fire-and-forget and must not delay either.
        pushDraft();
      } catch (err) {
        console.error(color.red(`✗ rebuild failed — still serving the last good page`));
        console.error(color.dim(`  ${err.message.split('\n')[0]}`));
      } finally {
        building = false;
        // The build is what kills the watch, so re-arm on the way out — before any queued rebuild,
        // because that one is a build too.
        arm();
        if (queued) {
          queued = false;
          rebuild();
        }
      }
    };

    arm();

    /** (Re)create every watcher. Idempotent: the previous set is closed first. */
    function arm() {
      for (const w of WATCHERS.splice(0)) {
        try {
          w.close();
        } catch {
          /* already closed — that is the case this exists for */
        }
      }
      for (const root of roots) {
        try {
          const w = fsWatch(root, { recursive: true }, (_event, file) => {
            if (!isSourceChange(file)) return;
            clearTimeout(timer);
            timer = setTimeout(rebuild, 250);
          });
          // An 'error' on an EventEmitter with no listener THROWS. A dying watcher must not take the
          // server with it — re-arm instead, since the watch is exactly what we are trying to keep.
          w.on('error', () => setTimeout(arm, 100));
          WATCHERS.push(w);
        } catch (err) {
          console.error(color.red(`✗ cannot watch ${paths.rel(root)} — ${err.message}`));
        }
      }
    }
    console.log(color.dim(`  watching ${roots.map((r) => paths.rel(r)).join(', ')} — saves rebuild and reload viewers`));
    console.log('');
  }

  // ONE SHUTDOWN, in order: tell the host first, then drop the viewers and close. The other way
  // round is what was happening by accident, and it meant the host kept serving a lagoon whose
  // process had exited — proxying to a port nothing was listening on, or holding a draft nobody
  // would refresh — for up to ninety seconds.
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    console.log('');
    await sayGoodbye();
    for (const res of viewers) res.end();
    server.close(() => process.exit(0));
    // If the server has open connections that will not close, do not hang for ever on the way out.
    setTimeout(() => process.exit(0), 1500).unref?.();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  return 0;
}


/**
 * `motu lagoon dev` — the iteration loop: the lagoon served by Vite with HMR.
 *
 * Replaces the per-project `npm run dev` inside roots/lagoon, which existed only because each project
 * carried its own package.json and vite.config.ts. Runs the dev server in THIS process (foreground,
 * Ctrl-C to stop) rather than spawning one, since nothing here needs to outlive the command.
 */
/**
 * Tell the lagoon host where this dev server is, so `<host>/<repo>/latest/<slug>` serves IT.
 *
 * The host has proxied a registered live endpoint since it was written — `latest` resolves to a live
 * dev server when one is announced and falls back to the last publish when none is. What it had was
 * no announcer on this path: only `lagoon serve --watch` registered, and `lagoon dev` is what a
 * person iterating — and every agent in four bench rounds — actually runs. So the live axis existed
 * and the command that would have used it never said hello, and the gallery showed the last publish
 * with nothing to explain why.
 *
 * Pull mode only. Pushing bytes is `serve --watch --live-push`'s business, because it has bytes; a
 * dev server has a port.
 *
 * BEST EFFORT, and LOUD ON REFUSAL. A preview must never fail because a host is down — but "best
 * effort" implemented as swallowing the response is how a rejected registration produced no output
 * at all, which `serve` learned the hard way and this inherits: said once, not every beat.
 */
/**
 * Where a REMOTE viewer's HMR client should connect, given the host that will be proxying the page.
 *
 * Vite bakes the socket address into its client from the dev server's own config, so by default it
 * tells every viewer to reach `127.0.0.1:<port>` — true for the person who started it and useless for
 * anyone arriving through the lagoon host. Pointing it at the host's own origin, under the member's
 * path, is what makes an edit push itself to someone else's browser.
 *
 * Returns null when no host is configured, and the dev server then keeps Vite's local default — the
 * common case of iterating alone must not be made worse by a feature for sharing.
 */
export function hmrForHost({ slug, repo, base }) {
  if (!base) return null;
  const u = new URL(base);
  return {
    protocol: u.protocol === 'https:' ? 'wss' : 'ws',
    host: u.hostname,
    clientPort: Number(u.port || (u.protocol === 'https:' ? 443 : 80)),
    // RELATIVE TO `base`, which is already the member's prefix. Vite concatenates the two, so giving
    // the full path here produced `/<repo>/latest/<slug>/<repo>/latest/<slug>/__motu_hmr` — a doubled
    // prefix the host could not route and the socket never opened, while the page and its assets were
    // fine. The client's own module is where this is visible; nothing else reports it.
    path: '__motu_hmr',
  };
}

/**
 * The member a DEV SERVER announces itself as — the published slug, scoped by branch.
 *
 * One slug per project was right while a dev server was something a person started on their laptop.
 * It stops being right the moment several agents work the same repository at once: they all announce
 * `<repo>/latest/all`, each heartbeat overwrites the last, and whoever looks sees whichever agent
 * beat most recently — with nothing anywhere saying that is what happened.
 *
 * A branch is the identity that already distinguishes concurrent work, so `all@fix-search` and
 * `all@add-filters` are separate members of the same repo and coexist in the gallery. The default
 * branch keeps the bare slug, because that is the address a person bookmarks and it should not move.
 *
 * `--as <slug>` overrides, for work that is not on its own branch.
 */
export function liveSlugFor(baseSlug, argv, cwd) {
  // THE HOST'S RULE, NOT A LOOSER ONE. A slug is a path segment on the host's disk, so the host
  // validates it as `[A-Za-z0-9][A-Za-z0-9._-]*` and refuses anything else. Building a nicer-looking
  // `all@branch` here got the announcement rejected with "repo and slug are required" while the dev
  // server carried on serving a base path for a member that would never exist — so the sanitiser is
  // the host's own alphabet, applied here, and a slug that cannot be announced is not invented.
  const clean = (s) => s.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[^A-Za-z0-9]+/, '');
  const explicit = typeof argv?.as === 'string' ? argv.as : null;
  if (explicit) return clean(explicit) || baseSlug;
  const { branch } = gitIdentity(cwd);
  if (!branch || /^(main|master|trunk)$/.test(branch)) return baseSlug;
  return clean(`${baseSlug}.${branch}`) || baseSlug;
}

function announceDevServer({ slug, port, liveUrl, protocol = 'http' }) {
  const cfg = loadHostConfig();
  const base = (process.env.MOTU_HOST_URL || cfg.url || '').replace(/\/+$/, '');
  const hostToken = process.env.MOTU_HOST_TOKEN || cfg.token || null;
  if (!base || !hostToken) return () => {}; // no host configured: serving locally is the whole feature
  // The SAME identity publishing uses, or the gallery has a live member it can match to nothing.
  const repo = paths.publishAs?.repo ?? gitIdentity(REPO_ROOT).repo;
  const qs = `repo=${encodeURIComponent(repo)}&slug=${encodeURIComponent(slug)}`;
  const call = (path, body) =>
    fetch(`${base}${path}?${qs}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${hostToken}` },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }).catch(() => null);

  const announceUrl = liveUrl || `${protocol}://127.0.0.1:${port}`;
  let announced = false;
  let warnedUrlFile = false;
  let refused = false;
  const beat = async () => {
    const res = await call('/api/live', { url: announceUrl });
    if (res && !res.ok && !refused) {
      refused = true;
      const why = await res.json().catch(() => null);
      console.error(color.red(`  ✗ the host refused this as a live member: ${why?.error ?? res.status}`));
      console.error(color.dim(`    announced: ${announceUrl}`));
    }
    if (res?.ok) {
      // REWRITTEN EVERY BEAT, so the file's own mtime says how long ago this was true. A URL left on
      // disk by a dev server that has since been killed is worse than no URL: it sends whoever reads
      // it to a page that no longer exists, and it reads exactly like a working one.
      try {
        writeLiveUrl(`${base}/${repo}/latest/${slug}`);
      } catch (err) {
        // SAID ONCE, not swallowed. An unwritable cache dir must not take the dev server down, and a
        // silent failure here is how the checks came to report "no live lagoon" while one was serving.
        if (!warnedUrlFile) {
          warnedUrlFile = true;
          console.error(color.dim(`  (could not record the live URL for motu check: ${err?.message ?? err})`));
        }
      }
    }
    if (res?.ok && !announced) {
      announced = true;
      console.log(color.dim(`  live at: ${base}/${repo}/latest/${slug}`));
      console.log(color.dim(`  the host will fetch it from: ${announceUrl}`));
    }
  };
  void beat();
  // The host expires a live member after 90s, so a dev server that dies decays back to the last
  // publish on its own — the heartbeat is what keeps a RUNNING one from decaying with it.
  const timer = setInterval(beat, 30_000);
  timer.unref?.();
  return async () => {
    clearInterval(timer);
    clearLiveUrl();
    // Bounded: leaving must not hang on a host that has gone away.
    await Promise.race([call('/api/live/off'), new Promise((r) => setTimeout(r, 2000))]);
  };
}

/** Where a detached dev server records itself, so a later `--stop` can find it. */
function devPidFile(cfg) {
  return resolve(cfg.cacheDir, 'lagoon-dev.pid');
}

/**
 * `--detach` / `--stop` — a lagoon that outlives the shell that started it.
 *
 * An agent's dev server dies with the agent's session. Watched repeatedly across four bench rounds:
 * the run ends, the URL a person was told to open goes dark, and the only trace is a heartbeat that
 * stops. The host degrades correctly — the member expires after 90s and `latest` falls back to the
 * last publish — so nothing is broken, but nothing is watchable either, and watching an agent work is
 * the point of announcing at all.
 *
 * A pidfile rather than a daemon: the process is an ordinary detached child, so `--stop` is a signal
 * and a crash needs no cleanup beyond the host's own expiry.
 */
function detachDevServer(cfg, argv) {
  const file = devPidFile(cfg);
  const existing = readPid(file);
  if (existing) {
    console.error(color.red(`✗ a detached lagoon is already running (pid ${existing})`));
    console.error(color.dim('  stop it first: motu lagoon dev --stop'));
    process.exit(1);
  }
  // The same argv minus the flag that got us here, so the child does the ordinary thing.
  const args = process.argv.slice(2).filter((a) => a !== '--detach');
  const out = openSync(resolve(cfg.cacheDir, 'lagoon-dev.log'), 'a');
  // `process.argv[1]` is the CLI entry that is running us — the only path guaranteed to be the same
  // motu the caller invoked, which matters when several checkouts exist on one machine.
  const child = spawn(process.execPath, [process.argv[1], ...args], {
    detached: true,
    stdio: ['ignore', out, out],
    cwd: process.cwd(),
    env: process.env,
  });
  child.unref();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, String(child.pid));
  console.log(color.dim(`  detached (pid ${child.pid}) — logs: ${paths.rel(resolve(cfg.cacheDir, 'lagoon-dev.log'))}`));
  console.log(color.dim('  stop it with: motu lagoon dev --stop'));
}

/** The pid a previous `--detach` wrote, when that process is still alive. */
function readPid(file) {
  try {
    const pid = Number(readFileSync(file, 'utf8').trim());
    if (!pid) return null;
    process.kill(pid, 0); // throws when it is gone
    return pid;
  } catch {
    return null;
  }
}

function stopDetachedDev(cfg) {
  const file = devPidFile(cfg);
  const pid = readPid(file);
  if (!pid) {
    console.log(color.dim('  no detached lagoon is running'));
    try {
      rmSync(file, { force: true });
    } catch {}
    return;
  }
  // SIGTERM, not SIGKILL: the dev server's own handler deregisters it from the host on the way out,
  // which is the difference between `latest` falling back at once and doing it 90 seconds later.
  process.kill(pid, 'SIGTERM');
  try {
    rmSync(file, { force: true });
  } catch {}
  // AND DEREGISTER FROM HERE, rather than trusting the child's own exit path. Measured: the process
  // died and the host still listed the member 54 seconds later, because a signal handler racing an
  // async POST against process exit is not something to rely on. The host would have expired it at
  // 90s anyway — this is the difference between `latest` falling back at once and a minute of
  // serving an address with nothing behind it.
  void deregisterLive();
  console.log(color.dim(`  stopped the detached lagoon (pid ${pid})`));
}

/** Tell the host this member is gone. Best effort and bounded: stopping must not hang on a dead host. */
async function deregisterLive() {
  const cfg = loadHostConfig();
  const base = (process.env.MOTU_HOST_URL || cfg.url || '').replace(/\/+$/, '');
  const hostToken = process.env.MOTU_HOST_TOKEN || cfg.token || null;
  if (!base || !hostToken) return;
  const repo = paths.publishAs?.repo ?? gitIdentity(REPO_ROOT).repo;
  const slug = liveSlugFor(paths.publishAs?.slug ?? 'all', {}, REPO_ROOT);
  const qs = `repo=${encodeURIComponent(repo)}&slug=${encodeURIComponent(slug)}`;
  await Promise.race([
    fetch(`${base}/api/live/off?${qs}`, { method: 'POST', headers: { authorization: `Bearer ${hostToken}` } }).catch(() => null),
    new Promise((r) => setTimeout(r, 2000)),
  ]);
}

export async function lagoonDevCommand(argv) {
  if (argv.stop) {
    const { loadMotuConfig } = await import('../lib/config.mjs');
    return stopDetachedDev(loadMotuConfig());
  }
  if (argv.detach) {
    const { loadMotuConfig } = await import('../lib/config.mjs');
    return detachDevServer(loadMotuConfig(), argv);
  }
  const { entry, target } = resolveTarget(argv);
  const { buildLagoonViteConfig, resolveVite } = await import('../lib/lagoon-vite.mjs');
  const { loadMotuConfig } = await import('../lib/config.mjs');
  // The FULL resolved config, not util.mjs's `paths` — that one is a curated subset for path
  // formatting and carries no `host`/`motuRoot`, which would silently yield an alias-free lagoon.
  const cfg = loadMotuConfig();
  const vite = await resolveVite(cfg);
  const hostCfg = loadHostConfig();
  const hostBase = (process.env.MOTU_HOST_URL || hostCfg.url || '').replace(/\/+$/, '');
  const config = await buildLagoonViteConfig(cfg, {
    ...process.env,
    ...(target ? { MOTU_TARGET: target } : {}),
    ...(argv.fit ? { MOTU_FIT: String(argv.fit) } : {}),
    // Explicit, because it lowers a real protection: only a run that ASKS accepts any Host header.
    ...(argv.allowAnyHost || argv['allow-any-host'] ? { MOTU_ALLOW_ANY_HOST: '1' } : {}),
  });
  if (argv.port) config.server.port = Number(argv.port);
  // HMR THROUGH THE HOST, when there is one and we are going to announce. Without this the page is
  // live and never hot for anyone but the person who started the server.
  if (hostBase && argv.live !== false && !argv['no-live']) {
    const liveSlug = liveSlugFor(paths.publishAs?.slug ?? resolveTarget(argv).slug ?? 'all', argv, REPO_ROOT);
    const liveRepo = paths.publishAs?.repo ?? gitIdentity(REPO_ROOT).repo;
    // THE MEMBER'S PATH IS THE BASE. A dev server emits absolute URLs (`/@vite/client`, the module
    // graph) computed from `base`, and through the host those arrive under the member's prefix — so
    // unless the dev server KNOWS that prefix, every asset it names resolves at the host's root, where
    // nothing serves it. Measured: the page proxied fine and `/@vite/client` 404'd.
    //
    // Local viewing is unaffected: Vite serves the base path locally too, and `printUrls` shows it.
    config.base = `/${liveRepo}/latest/${liveSlug}/`;
    const hmr = hmrForHost({ slug: liveSlug, repo: liveRepo, base: hostBase });
    if (hmr) config.server = { ...config.server, hmr: { ...hmr, ...(config.server?.hmr ?? {}) } };
  }
  config.clearScreen = false;
  const server = await vite.createServer(config);
  await server.listen();
  console.log(color.dim(`  lagoon: ${paths.rel(cfg.lagoonDir)}  (host: ${cfg.host})`));
  if (target) console.log(color.dim(`  focused on ${target} — open /lagoon.html`));
  server.printUrls();

  // ANNOUNCE, unless told not to. `--no-live` is for the case the flag exists to serve: a dev server
  // on a shared machine that should not become the address a whole team is looking at.
  if (argv.live !== false && !argv['no-live']) {
    const resolvedPort = server.config.server.port ?? Number(argv.port) ?? 5173;
    // THE PROTOCOL THE SERVER ACTUALLY SPEAKS. The announcement was always `http://`, so a lagoon on
    // an HTTPS dev server registered an address the host could not fetch: it appeared in the gallery,
    // said `live`, and every page under it answered 502. A project gets HTTPS from its own Vite config
    // (a cert plugin, `server.https`) — the lagoon borrows that config, so this is not exotic.
    //
    // Read from Vite's resolved config rather than guessed, because that is the thing that decides it.
    const isHttps = Boolean(server.config.server?.https);
    const stopAnnouncing = announceDevServer({
      slug: liveSlugFor(paths.publishAs?.slug ?? resolveTarget(argv).slug ?? 'all', argv, REPO_ROOT),
      port: resolvedPort,
      protocol: isHttps ? 'https' : 'http',
      liveUrl: typeof argv.liveUrl === 'string' ? argv.liveUrl : argv['live-url'],
    });
    const leave = () => {
      void stopAnnouncing().finally(() => process.exit(0));
    };
    process.on('SIGINT', leave);
    process.on('SIGTERM', leave);
  }
}


/**
 * `motu lagoon eject` — write the framework's lagoon entries into the project.
 *
 * The escape hatch C1 promises: everything motu derives, motu can also write out. After ejecting, the
 * project owns `index.html` and the entries, the materializer stops running for it (ownership is
 * decided by `index.html`), and the files are yours to diverge — which is exactly the state the
 * reference ocean is in, and why its 180-line composition root was never at risk from this.
 */
export async function lagoonEjectCommand() {
  const { loadMotuConfig } = await import('../lib/config.mjs');
  const { materializeLagoon, projectOwnsLagoon } = await import('../lib/lagoon-materialize.mjs');
  const cfg = loadMotuConfig();
  if (projectOwnsLagoon(cfg)) {
    console.error(color.red(`already ejected: ${paths.rel(cfg.lagoonDir)}/index.html exists`));
    console.log(color.dim('  delete it (and src/main.tsx, src/lagoon.tsx, src/fixtures.ts, src/env.ts)'));
    console.log(color.dim('  to hand the lagoon back to the framework.'));
    process.exit(2);
  }
  materializeLagoon(cfg, cfg.lagoonDir);
  console.log(`ejected into ${paths.rel(cfg.lagoonDir)}`);
  console.log(color.dim('  index.html, lagoon.html, src/{main.tsx,lagoon.tsx,fixtures.ts,env.ts}'));
  console.log(color.dim('  the project now owns these — motu will not regenerate them.'));
}

/**
 * `motu lagoon states [target]` — every state this project's lagoon can be OPENED in, as a URL.
 *
 * The addresses (`?scenario=`, `?flow=`) are only half of a first-class thing; the other half is
 * being able to find out what exists without reading four evidence files. This is that half, and it
 * is deliberately the same source the browser gets: island `scenarios` and region flows, read with
 * the loader every runtime check already uses.
 *
 * Paths, not absolute URLs, unless `--base` says otherwise — the port belongs to whichever lagoon is
 * running (`dev` picks one, `serve` defaults to 8817, a published lagoon has a host), and printing a
 * guess that resolves to nothing is worse than printing the part that is always true.
 */
export async function lagoonStatesCommand(argv) {
  const { readScenarios } = await import('./verify.mjs');
  const { listIslands } = await import('../lib/islands.mjs');
  const { readRegions } = await import('../lib/eject.mjs');

  const base = typeof argv.base === 'string' ? argv.base.replace(/\/$/, '') : '';
  const only = argv._[0];
  const q = (params) => new URLSearchParams(params).toString();

  /** The same slug the page accepts, so a URL carries "a-week-to-answer" rather than 40 escaped bytes. */
  const slug = (name) =>
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

  /**
   * Address each state by its SLUG where that is unambiguous, and by its exact name where it is not.
   *
   * The page resolves both. Printing the slug is what makes these URLs quotable in a commit message
   * or a review comment; falling back the moment two names collide is what keeps them addresses.
   */
  const addressFor = (list) => {
    const slugs = list.map((s, i) => slug(s.name ?? `#${i + 1}`));
    return (name, i) => (slugs.filter((x) => x === slugs[i]).length === 1 ? slugs[i] : name);
  };

  const islands = listIslands(paths.islandsDir)
    .filter(({ kebab }) => !only || kebab === only || names(kebab).tag === only)
    .map(({ kebab }) => {
      const file = paths.fixturesFile(kebab);
      const scenarios = existsSync(file) ? readScenarios(file) : [];
      const { tag } = names(kebab);
      const address = addressFor(scenarios);
      return {
        target: `island:${tag}`,
        states: scenarios.map((s, i) => {
          const name = s.name ?? `#${i + 1}`;
          const steps = (s.interactions ?? []).length;
          return {
            name,
            // The gallery, like the region rows below — NOT lagoon.html. `lagoon serve` and
            // `lagoon publish` build the gallery and serve it at every path, so this address used to
            // land on the gallery with a `target` it ignored: the first region rendered, no banner,
            // and the URL looked like it had worked. The gallery reads an `island:` target now.
            url: `${base}/?${q({ target: `island:${tag}`, scenario: address(name, i) })}`,
            // A scenario with interactions is not ONE state. Reported exactly as a region's flow
            // reports its own — a COUNT, which the printer already turns into "&step=<n> stops
            // earlier" — so the states BETWEEN the clicks are as findable here as a flow's are, and
            // the last one stops looking like the only one there is. Omitted (not 0) when a scenario
            // has none, so a plain seeded state does not advertise a step vocabulary it cannot use.
            ...(steps ? { steps } : {}),
          };
        }),
      };
    })
    .filter((i) => i.states.length);

  const regions = readRegions(paths.archipelagosDir)
    .filter(({ id }) => !only || id === only)
    .map(({ id }) => {
      const file = paths.archipelagoEvidence(id);
      const flows = existsSync(file) ? readScenarios(file) : [];
      const address = addressFor(flows);
      return {
        target: `archipelago:${id}`,
        // THE PAGE IS A STATE TOO, where the region declares one — the application's own page module,
        // rendered with the region's providers and wire. Listed first because it is the only address
        // here that shows the page a person actually visits, and read by PARSING the overrides module
        // rather than matching it, so a shape nobody anticipated cannot silently hide the address.
        page: regionDeclaresPage(id) ? `${base}/?${q({ region: id, view: 'page' })}` : null,
        states: flows.map((f, i) => {
          const name = f.name ?? `#${i + 1}`;
          return {
            name,
            steps: (f.steps ?? []).length,
            // The gallery, not lagoon.html: that is the entry `lagoon serve` and `lagoon publish`
            // build, so this URL works on the lagoon a human is actually looking at.
            //
            // `region` is always written out, even though the page can infer it from a unique flow
            // name. Flow names DO collide across regions ("each slot renders its own island" is a
            // good name in every region that has one), and a printed URL is the thing someone pastes
            // six months later into a lagoon that has grown another region since.
            url: `${base}/?${q({ region: id, flow: address(name, i) })}`,
          };
        }),
      };
    })
    .filter((r) => r.states.length || r.page);

  if (argv.json) {
    console.log(JSON.stringify({ islands, regions }, null, 2));
    return;
  }
  if (!islands.length && !regions.length) {
    console.log(color.dim(only ? `no declared states for "${only}"` : 'no island scenarios and no region flows yet'));
    console.log(color.dim('  an island declares `scenarios` in <kebab>.evidence.ts; a region declares flows in <id>.evidence.ts'));
    return;
  }
  for (const { target, states, page } of [...islands, ...regions]) {
    console.log(color.bold(target));
    if (page) {
      console.log(`  the application's own page${color.dim(' · what the page renders, not the region')}`);
      console.log(color.dim(`    ${page}`));
    }
    for (const s of states) {
      const steps = s.steps === undefined ? '' : color.dim(` · ${s.steps} step(s), &step=<n> stops earlier`);
      console.log(`  ${s.name}${steps}`);
      console.log(color.dim(`    ${s.url}`));
    }
  }
  if (!base) console.log(color.dim('\n  paths are relative to a running lagoon — pass --base http://localhost:8817 for full URLs'));
}
