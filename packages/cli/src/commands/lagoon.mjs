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
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';
import { REPO_ROOT, paths, names, color } from '../lib/util.mjs';

const VITE_BIN = resolve(REPO_ROOT, 'node_modules/vite/bin/vite.js');

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
    return {
      entry: 'lagoon',
      target: `archipelago:${archipelago}`,
      slug: `archipelago-${archipelago}`,
      title: `${names(archipelago).pascal} Lagoon`,
    };
  }
  if (island) {
    const { kebab, tag, pascal } = names(island);
    if (!existsSync(paths.islandDir(kebab)))
      throw new Error(`unknown island "${island}" — no ${paths.rel(paths.islandDir(kebab))}`);
    return { entry: 'lagoon', target: `island:${tag}`, slug: `island-${kebab}`, title: `${pascal} Lagoon` };
  }
  return { entry: 'main', target: '', slug: 'all', title: 'Motu Lagoon' };
}

/** Build the chosen entry as one chunk, mock-backed. Returns the built HTML path. */
function buildSingleFile({ entry, target, fit }) {
  const res = spawnSync(process.execPath, [VITE_BIN, 'build'], {
    cwd: paths.lagoonDir,
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
    throw new Error(`vite build failed:\n${(res.stdout || '') + (res.stderr || '')}`);
  const html = resolve(paths.lagoonDir, 'dist', entry === 'lagoon' ? 'lagoon.html' : 'index.html');
  if (!existsSync(html)) throw new Error(`build produced no ${paths.rel(html)}`);
  return html;
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

export function lagoonPublishCommand(argv) {
  const json = !!argv.json;
  let resolved;
  try {
    resolved = resolveTarget(argv);
  } catch (err) {
    console.error(color.red(`✗ ${err.message}`));
    process.exit(1);
  }
  const { entry, target, slug, title } = resolved;
  const fit = argv.fit === 'legacy' ? 'legacy' : argv.fit === 'native' ? 'native' : '';

  if (!json) console.log(color.dim(`building ${target || 'all archipelagos'} (mock fixtures, one chunk)…`));
  const built = buildSingleFile({ entry, target, fit });
  const page = inlineToArtifact(built, title);

  const out = argv.out ? resolve(REPO_ROOT, argv.out) : publishFile(slug);
  mkdirSync(resolve(out, '..'), { recursive: true });
  writeFileSync(out, page, 'utf8');

  const bytes = statSync(out).size;
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
  const { entry, target, slug, title } = resolved;
  const fit = argv.fit === 'legacy' ? 'legacy' : argv.fit === 'native' ? 'native' : '';

  const port = Number.parseInt(String(argv.port ?? 8817), 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(color.red(`✗ --port must be 1-65535, got "${argv.port}"`));
    process.exit(1);
  }
  // Loopback by default: serving the app to the whole network is opt-in, not a side effect of preview.
  const lan = argv.host === true || argv.host === '0.0.0.0';
  const bind = lan ? '0.0.0.0' : '127.0.0.1';

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

  // One artifact, no asset requests to route: every path serves the page, so deep links work too.
  const body = Buffer.from(wrapForBrowser(page), 'utf8');
  const server = createServer((req, res) => {
    if (req.url === '/favicon.ico') return void res.writeHead(204).end(); // keeps the console clean
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

  process.on('SIGINT', () => {
    console.log('');
    server.close(() => process.exit(0));
  });
  return 0;
}
